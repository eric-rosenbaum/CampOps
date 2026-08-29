-- The evidence engine.
--
-- Answers, for one camp and season, "where do we stand on every requirement that applies to
-- us" — by reading the evidence tables the platform already fills. It runs in Postgres rather
-- than the browser on purpose: the client hydrates thirteen stores asynchronously, and a
-- completeness score computed from whatever happened to have loaded is not a number anyone
-- should file a permit on.
--
-- Every branch writes a `detail` object explaining itself. A camp is never told "missing"
-- without being told missing what.

-- ─── Does this requirement apply to this camp? ───────────────────────────────
-- `applies_when` is an object of answer keys; every one must match. {} means always.
create or replace function public.compliance_applies(p_answers jsonb, p_applies_when jsonb)
returns boolean
language plpgsql immutable
as $$
declare k text; want text; got text;
begin
  if p_applies_when is null or p_applies_when = '{}'::jsonb then return true; end if;
  for k in select jsonb_object_keys(p_applies_when) loop
    want := lower(trim(both '"' from (p_applies_when -> k)::text));
    got  := lower(coalesce(p_answers ->> k, ''));
    -- An unanswered question means we cannot claim the requirement applies. Fail closed on
    -- the requirement (do not show it) rather than showing a camp rules for a pool it may
    -- not own; the setup interview is what resolves this.
    if got = '' then return false; end if;
    if want <> got then return false; end if;
  end loop;
  return true;
end $$;

comment on function public.compliance_applies is
  'True when every key in applies_when matches the camp''s answer. Unanswered => does not apply.';

-- ─── The engine ──────────────────────────────────────────────────────────────
create or replace function public.compute_camp_compliance(p_camp_id uuid, p_season_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_answers   jsonb;
  v_open      date;
  v_close     date;
  r           record;
  v_status    text;
  v_detail    jsonb;
  v_due       date;
  v_count     integer := 0;
  v_total     integer;
  v_ok        integer;
  v_soon      integer;
  v_next      date;
  v_soon_days constant integer := 30;
begin
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_answers
    from camp_compliance_answers where camp_id = p_camp_id and season_id = p_season_id;

  select opening_date, closing_date into v_open, v_close
    from seasons where id = p_season_id;

  for r in
    select req.*, prof.code as profile_code
      from compliance_requirements req
      join compliance_profiles prof on prof.id = req.profile_id
      join camp_compliance_profiles ccp
        on ccp.profile_id = req.profile_id
       and ccp.camp_id = p_camp_id and ccp.season_id = p_season_id
     where prof.is_active
  loop
    v_status := 'missing';
    v_detail := '{}'::jsonb;
    v_due    := null;

    -- Deadline, if the requirement declares one.
    if r.deadline_rule ? 'type' then
      if r.deadline_rule ->> 'type' = 'relative_to_opening' and v_open is not null then
        v_due := v_open + ((r.deadline_rule ->> 'days')::integer);
      elsif r.deadline_rule ->> 'type' = 'fixed' then
        v_due := make_date(
          extract(year from coalesce(v_open, current_date))::int,
          (r.deadline_rule ->> 'month')::int,
          (r.deadline_rule ->> 'day')::int);
      end if;
    end if;

    -- A camp may declare a requirement not applicable; that decision outranks the evaluators.
    if exists (select 1 from camp_requirement_status s
                where s.camp_id = p_camp_id and s.season_id = p_season_id
                  and s.requirement_id = r.id and s.na_reason is not null) then
      v_status := 'not_applicable';
      v_detail := jsonb_build_object('reason', 'Marked not applicable by the camp');

    elsif not compliance_applies(v_answers, r.applies_when) then
      v_status := 'not_applicable';
      v_detail := jsonb_build_object('reason', 'Does not apply based on your camp setup',
                                     'applies_when', r.applies_when);

    else
      case r.evidence_type

        -- ── Documents: an attached, unexpired file ──
        when 'document', 'attestation' then
          select count(*), count(*) filter (where d.expires_on is not null and d.expires_on <= current_date + v_soon_days),
                 min(d.expires_on)
            into v_total, v_soon, v_next
            from requirement_documents rd
            join compliance_documents d on d.id = rd.document_id
           where rd.camp_id = p_camp_id and rd.season_id = p_season_id
             and rd.requirement_id = r.id
             and (d.expires_on is null or d.expires_on >= current_date);
          if v_total = 0 then
            v_status := 'missing';
            v_detail := jsonb_build_object('need', 'Attach a document for this requirement');
          elsif v_soon > 0 then
            v_status := 'expiring';
            v_detail := jsonb_build_object('documents', v_total, 'expires_on', v_next);
          else
            v_status := 'satisfied';
            v_detail := jsonb_build_object('documents', v_total, 'expires_on', v_next);
          end if;

        -- ── Certifications held by staff ──
        when 'certification' then
          select count(*), count(*) filter (where c.expiry_date is not null and c.expiry_date <= current_date + v_soon_days),
                 min(c.expiry_date)
            into v_total, v_soon, v_next
            from staff_certifications c
           where c.camp_id = p_camp_id
             and (c.expiry_date is null or c.expiry_date >= current_date)
             and (not (r.evidence_rule ? 'cert_types')
                  or c.cert_type = any (select jsonb_array_elements_text(r.evidence_rule -> 'cert_types')));
          v_ok := coalesce((r.evidence_rule ->> 'min_count')::int, 1);
          if v_total = 0 then
            v_status := 'missing';
            v_detail := jsonb_build_object('need', format('At least %s current certification(s)', v_ok), 'held', 0);
          elsif v_total < v_ok then
            v_status := 'partial';
            v_detail := jsonb_build_object('need', v_ok, 'held', v_total);
          elsif v_soon > 0 then
            v_status := 'expiring';
            v_detail := jsonb_build_object('held', v_total, 'expiring_within_days', v_soon_days, 'next_expiry', v_next);
          else
            v_status := 'satisfied';
            v_detail := jsonb_build_object('held', v_total, 'next_expiry', v_next);
          end if;

        -- ── Recurring inspections (extinguishers, alarms, hoods) ──
        when 'inspection' then
          select count(*), count(*) filter (where i.next_due is not null and i.next_due < current_date),
                 min(i.next_due)
            into v_total, v_soon, v_next
            from safety_items i
           where i.camp_id = p_camp_id
             and (not (r.evidence_rule ? 'categories')
                  or i.category = any (select jsonb_array_elements_text(r.evidence_rule -> 'categories')));
          if v_total = 0 then
            v_status := 'missing';
            v_detail := jsonb_build_object('need', 'No items of this type are on file yet');
          elsif v_soon > 0 then
            v_status := 'partial';
            v_detail := jsonb_build_object('items', v_total, 'overdue', v_soon, 'earliest_due', v_next);
          elsif v_next is not null and v_next <= current_date + v_soon_days then
            v_status := 'expiring';
            v_detail := jsonb_build_object('items', v_total, 'next_due', v_next);
          else
            v_status := 'satisfied';
            v_detail := jsonb_build_object('items', v_total, 'next_due', v_next);
          end if;

        -- ── Drills actually run ──
        when 'drill' then
          select count(*), max(d.completed_date)
            into v_total, v_next
            from safety_drills d
           where d.camp_id = p_camp_id
             and d.completed_date is not null
             and (not (r.evidence_rule ? 'drill_types')
                  or d.drill_type = any (select jsonb_array_elements_text(r.evidence_rule -> 'drill_types')))
             and (v_open is null or d.completed_date >= v_open - 365);
          v_ok := coalesce((r.evidence_rule ->> 'min_count')::int, 1);
          if v_total = 0 then
            v_status := 'missing';
            v_detail := jsonb_build_object('need', format('%s completed drill(s) on record', v_ok), 'completed', 0);
          elsif v_total < v_ok then
            v_status := 'partial';
            v_detail := jsonb_build_object('need', v_ok, 'completed', v_total, 'last_completed', v_next);
          else
            v_status := 'satisfied';
            v_detail := jsonb_build_object('completed', v_total, 'last_completed', v_next);
          end if;

        -- ── Kitchen temperature logs ──
        when 'temp_log' then
          select count(*), max(t.log_date) into v_total, v_next
            from safety_temp_logs t
           where t.camp_id = p_camp_id
             and (v_open is null or t.log_date between v_open and coalesce(v_close, current_date));
          if v_total = 0 then
            v_status := 'missing';
            v_detail := jsonb_build_object('need', 'Temperature logs for this season');
          else
            v_status := 'satisfied';
            v_detail := jsonb_build_object('entries', v_total, 'last_logged', v_next);
          end if;

        -- ── Pool chemistry ──
        when 'pool_log' then
          select count(*), max(pr.reading_time::date) into v_total, v_next
            from pool_chemical_readings pr
           where pr.camp_id = p_camp_id
             and (v_open is null or pr.reading_time::date between v_open and coalesce(v_close, current_date));
          if v_total = 0 then
            v_status := 'missing';
            v_detail := jsonb_build_object('need', 'Chemical readings for this season');
          else
            v_status := 'satisfied';
            v_detail := jsonb_build_object('readings', v_total, 'last_reading', v_next);
          end if;

        -- ── Vehicle / watercraft paperwork ──
        when 'asset_expiry' then
          select count(*), count(*) filter (where a.registration_expiry is not null
                                              and a.registration_expiry <= current_date + v_soon_days),
                 min(a.registration_expiry)
            into v_total, v_soon, v_next
            from camp_assets a
           where a.camp_id = p_camp_id and a.is_active
             and (not (r.evidence_rule ? 'categories')
                  or a.category = any (select jsonb_array_elements_text(r.evidence_rule -> 'categories')));
          if v_total = 0 then
            v_status := 'missing';
            v_detail := jsonb_build_object('need', 'No assets of this type are on file');
          elsif v_soon > 0 then
            v_status := 'expiring';
            v_detail := jsonb_build_object('assets', v_total, 'expiring', v_soon, 'earliest_expiry', v_next);
          else
            v_status := 'satisfied';
            v_detail := jsonb_build_object('assets', v_total);
          end if;

        -- ── Written plan sections (the DOH-2040 component list) ──
        when 'plan_section' then
          select count(*), count(*) filter (where p.status in ('complete','not_applicable'))
            into v_total, v_ok
            from compliance_plan_sections p
           where p.camp_id = p_camp_id and p.season_id = p_season_id
             and (not (r.evidence_rule ? 'categories')
                  or p.category = any (select jsonb_array_elements_text(r.evidence_rule -> 'categories')))
             and (not (r.evidence_rule ? 'section_codes')
                  or p.section_code = any (select jsonb_array_elements_text(r.evidence_rule -> 'section_codes')));
          if v_total = 0 then
            v_status := 'missing';
            v_detail := jsonb_build_object('need', 'Plan sections have not been set up yet');
          elsif v_ok = 0 then
            v_status := 'missing';
            v_detail := jsonb_build_object('need', 'Write the plan sections',
                                           'sections', v_total, 'complete', 0);
          elsif v_ok < v_total then
            v_status := 'partial';
            v_detail := jsonb_build_object('sections', v_total, 'complete', v_ok);
          else
            v_status := 'satisfied';
            v_detail := jsonb_build_object('sections', v_total, 'complete', v_ok);
          end if;

        -- ── Evidence sources the platform does not capture yet ──
        -- Honest fallback: the camp can still satisfy these by attaching a document. The
        -- requirement keeps its real evidence_type so that when the feature lands, the rule
        -- starts evaluating automatically with no seed change.
        else
          select count(*) into v_total
            from requirement_documents rd
            join compliance_documents d on d.id = rd.document_id
           where rd.camp_id = p_camp_id and rd.season_id = p_season_id
             and rd.requirement_id = r.id
             and (d.expires_on is null or d.expires_on >= current_date);
          if v_total > 0 then
            v_status := 'satisfied';
            v_detail := jsonb_build_object('documents', v_total, 'via', 'attached document');
          else
            v_status := 'missing';
            v_detail := jsonb_build_object('need', 'Attach a document as evidence',
                                           'awaiting_feature', r.evidence_type);
          end if;
      end case;
    end if;

    insert into camp_requirement_status
      (camp_id, season_id, requirement_id, status, detail, due_on, computed_at)
    values (p_camp_id, p_season_id, r.id, v_status, v_detail, v_due, now())
    on conflict (camp_id, season_id, requirement_id) do update
      set status = excluded.status,
          detail = excluded.detail,
          due_on = excluded.due_on,
          computed_at = excluded.computed_at;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function public.compute_camp_compliance is
  'Recomputes every applicable requirement status for a camp-season from live evidence. Returns rows written.';

revoke execute on function public.compute_camp_compliance(uuid, uuid) from public;
grant execute on function public.compute_camp_compliance(uuid, uuid) to authenticated;
