-- Two corrections to the evidence engine, both about not overstating what we know.
--
-- 1. "We never asked" is not the same as "it does not apply."
--    compliance_applies() returned false for an unanswered key, and the caller turned that
--    into not_applicable with the reason "Does not apply based on your camp setup." For a
--    camp that has not answered `has_riflery` — because they set up before we shipped the
--    question — that sentence is an affirmative claim we cannot support. It now resolves to
--    a distinct `needs_answer` status that names the unanswered question.
--
-- 2. An inspection requirement with no `categories` rule was matching every safety item at
--    the camp. "Set up the archery range" reported the same "5 items, 1 overdue" as the
--    smoke-alarm rule, because both counted all five. Progress a camp has not made is the
--    worst thing a compliance product can display, so an inspection requirement now needs an
--    explicit category rule to read the safety register; without one it falls through to the
--    attach-a-document path like any other evidence source we do not capture yet.

alter table camp_requirement_status drop constraint if exists camp_requirement_status_status_check;
alter table camp_requirement_status add constraint camp_requirement_status_status_check
  check (status in ('satisfied','partial','expiring','missing','not_applicable','needs_answer'));

-- ─── Applicability, now three-valued ────────────────────────────────────────
-- 'yes' | 'no' | 'unknown'. Unknown means at least one deciding question is unanswered.
create or replace function public.compliance_applicability(p_answers jsonb, p_applies_when jsonb)
returns text
language plpgsql immutable
as $$
declare
  k text; want text; got text;
  v_any_of jsonb;
  v_hit         boolean := false;  -- some any_of member is a definite match
  v_unknown_or  boolean := false;  -- some any_of member is unanswered
  v_unknown_and boolean := false;  -- some top-level (AND'd) key is unanswered
begin
  if p_applies_when is null or p_applies_when = '{}'::jsonb then return 'yes'; end if;

  -- Top-level keys are AND'd. One definite mismatch settles it; an unanswered one leaves
  -- the answer open.
  for k in select key from jsonb_object_keys(p_applies_when) as t(key) where t.key <> 'any_of' loop
    want := lower(trim(both '"' from (p_applies_when -> k)::text));
    got  := lower(coalesce(p_answers ->> k, ''));
    if got = '' then v_unknown_and := true;
    elsif want <> got then return 'no';
    end if;
  end loop;

  -- The reserved `any_of` key is OR'd: a camp with either a pool or a waterfront gets the
  -- aquatics rules. One definite hit settles the group, even if a sibling is unanswered —
  -- knowing they have a pool is enough, whether or not we know about the lake.
  v_any_of := p_applies_when -> 'any_of';
  if v_any_of is not null and v_any_of <> '{}'::jsonb then
    for k in select key from jsonb_object_keys(v_any_of) as t(key) loop
      want := lower(trim(both '"' from (v_any_of -> k)::text));
      got  := lower(coalesce(p_answers ->> k, ''));
      if got = '' then v_unknown_or := true;
      elsif want = got then v_hit := true;
      end if;
    end loop;
    if not v_hit then
      if v_unknown_or then return 'unknown'; end if;
      return 'no';
    end if;
  end if;

  if v_unknown_and then return 'unknown'; end if;
  return 'yes';
end $$;

comment on function public.compliance_applicability is
  'yes / no / unknown. Unknown means a deciding question has not been answered, which is not the same as the requirement not applying.';

-- Kept so the existing test suite and any caller still resolve; now defined in terms of the
-- three-valued function, with unknown treated as "do not claim it applies".
create or replace function public.compliance_applies(p_answers jsonb, p_applies_when jsonb)
returns boolean
language sql immutable
as $$ select public.compliance_applicability(p_answers, p_applies_when) = 'yes' $$;

-- ─── Name the questions a camp still owes us ────────────────────────────────
create or replace function public.compliance_unanswered_keys(p_answers jsonb, p_applies_when jsonb)
returns text[]
language sql immutable
as $$
  select coalesce(array_agg(k order by k), '{}'::text[])
  from (
    select k from jsonb_object_keys(coalesce(p_applies_when,'{}'::jsonb)) k where k <> 'any_of'
    union
    select k from jsonb_object_keys(coalesce(p_applies_when->'any_of','{}'::jsonb)) k
  ) t(k)
  where coalesce(p_answers ->> k, '') = ''
$$;

-- ─── The engine, with both corrections applied ──────────────────────────────
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
  v_applies   text;
  v_unfiltered boolean;
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
    v_unfiltered := false;

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

    else
      v_applies := compliance_applicability(v_answers, r.applies_when);

    if v_applies = 'no' then
      v_status := 'not_applicable';
      v_detail := jsonb_build_object('reason', 'Does not apply based on your camp setup',
                                     'applies_when', r.applies_when);

    elsif v_applies = 'unknown' then
      -- We have not asked, so we will not tell the camp it is off the hook.
      v_status := 'needs_answer';
      v_detail := jsonb_build_object(
        'need', 'Answer the setup question that decides whether this applies to you',
        'unanswered', to_jsonb(compliance_unanswered_keys(v_answers, r.applies_when)),
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
          if not (r.evidence_rule ? 'cert_types') then
            v_unfiltered := true;
          else
          select count(*), count(*) filter (where c.expiry_date is not null and c.expiry_date <= current_date + v_soon_days),
                 min(c.expiry_date)
            into v_total, v_soon, v_next
            from staff_certifications c
           where c.camp_id = p_camp_id
             and (c.expiry_date is null or c.expiry_date >= current_date)
             and c.cert_type = any (select jsonb_array_elements_text(r.evidence_rule -> 'cert_types'));
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

          end if;

        -- ── Recurring inspections (extinguishers, alarms, hoods) ──
        when 'inspection' then
          -- Without an explicit category rule this branch would count every safety item at
          -- the camp, so an archery-range requirement would report the same progress as a
          -- smoke-alarm one. Unmapped inspection requirements take the document path instead.
          if not (r.evidence_rule ? 'categories') then
            v_unfiltered := true;
          else
          select count(*), count(*) filter (where i.next_due is not null and i.next_due < current_date),
                 min(i.next_due)
            into v_total, v_soon, v_next
            from safety_items i
           where i.camp_id = p_camp_id
             and i.category = any (select jsonb_array_elements_text(r.evidence_rule -> 'categories'));
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

          end if;

        -- ── Drills actually run ──
        when 'drill' then
          if not (r.evidence_rule ? 'drill_types') then
            v_unfiltered := true;
          else
          select count(*), max(d.completed_date)
            into v_total, v_next
            from safety_drills d
           where d.camp_id = p_camp_id
             and d.completed_date is not null
             and d.drill_type = any (select jsonb_array_elements_text(r.evidence_rule -> 'drill_types'))
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
          if not (r.evidence_rule ? 'categories') then
            v_unfiltered := true;
          else
          select count(*), count(*) filter (where a.registration_expiry is not null
                                              and a.registration_expiry <= current_date + v_soon_days),
                 min(a.registration_expiry)
            into v_total, v_soon, v_next
            from camp_assets a
           where a.camp_id = p_camp_id and a.is_active
             and a.category = any (select jsonb_array_elements_text(r.evidence_rule -> 'categories'));
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

      -- A branch that has no filter rule cannot tell this requirement's evidence apart from
      -- every other requirement's, so it does not get to count any of it. The camp attaches
      -- the record instead. This is the difference between "we checked" and "we counted
      -- something adjacent and called it checking."
      if v_unfiltered then
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
          -- Deliberately not 'awaiting_feature': the tracker for this evidence kind exists,
          -- this requirement just is not scoped to a slice of it, so the camp attaches the
          -- record by hand. Telling them the feature is missing would be the wrong excuse.
          v_detail := jsonb_build_object(
            'need', 'Attach the record that evidences this requirement',
            'unmapped', r.evidence_type);
        end if;
      end if;
    end if;
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
