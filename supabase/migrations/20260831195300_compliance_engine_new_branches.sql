-- Five new evidence branches, so the engine computes what the module now records.
--
-- Before this, seven of fourteen `evidence_type` values had an evaluator and the rest fell through
-- to an honest fallback: "attach a document as evidence", tagged `awaiting_feature`. That fallback
-- was the right call while the tables did not exist. They exist now.
--
-- Sixty-seven of 155 requirements resolved to `document`, which is the bucket where the camp does
-- the work and the platform holds nothing. Every requirement moved out of it is a form field a
-- camp never fills and a piece of proof that cannot be forgotten.
--
-- HOW THIS MIGRATION IS WRITTEN. `compute_camp_compliance` is a 500-line function and this changes
-- one `case` inside it. Rather than paste a copy that would immediately drift from whatever the
-- previous migration left behind, it reads the live definition, splices the new branches in ahead
-- of the fallback, and re-executes it. That is safe to re-run and cannot silently revert an
-- unrelated change made to the function since.

alter table compliance_requirements drop constraint if exists compliance_requirements_evidence_type_check;
alter table compliance_requirements add constraint compliance_requirements_evidence_type_check
  check (evidence_type = any (array['document','certification','screening','training','inspection',
    'drill','temp_log','pool_log','water_sample','asset_expiry','plan_section','attestation',
    'roster','manual','insurance','permit','incident_reporting']));

do $outer$
declare
  v_def text;
  v_anchor text := '        -- ── Evidence sources the platform does not capture yet ──';
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'compute_camp_compliance';

  if v_def is null then raise exception 'compute_camp_compliance not found'; end if;

  -- Already spliced: nothing to do. Keeps the migration idempotent.
  if v_def like '%when ''screening'' then%' then
    raise notice 'branches already present, skipping';
    return;
  end if;

  v_new := $ins$        -- ── Background screenings: that a check was run, and when ──
        -- 7-2.5(l) wants every employee and volunteer checked before their first day and annually
        -- before arrival. We hold the date and never the result — the DCJS letter stays in the
        -- camp's files, which is where the regulation puts it — so "satisfied" means the camp has
        -- an unexpired screening of the named kind for everyone on the active roster.
        when 'screening' then
          declare
            v_kind text := coalesce(r.evidence_rule ->> 'kind', 'dcjs_sor');
            v_people int;
            v_done int;
          begin
            select count(*) into v_people
              from safety_staff st
             where st.camp_id = p_camp_id and st.is_active;

            select count(distinct sc.staff_id) into v_done
              from compliance_screenings sc
             where sc.camp_id = p_camp_id and sc.kind = v_kind
               and sc.staff_id is not null
               and coalesce(sc.cleared, true)
               and (sc.expires_on is null or sc.expires_on >= current_date);

            if v_people = 0 then
              v_status := 'missing';
              v_detail := jsonb_build_object('need', 'Add your staff roster first');
            elsif v_done = 0 then
              v_status := 'missing';
              v_detail := jsonb_build_object('need', 'Run the check for every employee and volunteer',
                                             'kind', v_kind, 'people', v_people, 'done', 0);
            elsif v_done < v_people then
              v_status := 'partial';
              v_detail := jsonb_build_object('kind', v_kind, 'people', v_people, 'done', v_done);
            else
              v_status := 'satisfied';
              v_detail := jsonb_build_object('kind', v_kind, 'people', v_people, 'done', v_done);
            end if;
          end;

        -- ── Training and orientation attendance ──
        -- DOH-2040 lists attendance documentation as a plan component in its own right, and the
        -- Justice Center code of conduct is acknowledged annually. A session inside the last year
        -- counts; the roll-up of who attended is reported in the detail.
        when 'training' then
          declare
            v_kind text := coalesce(r.evidence_rule ->> 'kind', 'staff_orientation');
            v_since date := coalesce(v_open - 365, current_date - 365);
            v_sessions int;
            v_attendees int;
          begin
            select count(*), count(distinct t.staff_id)
              into v_sessions, v_attendees
              from compliance_trainings t
             where t.camp_id = p_camp_id and t.kind = v_kind
               and t.delivered_on >= v_since;

            if v_sessions = 0 then
              v_status := 'missing';
              v_detail := jsonb_build_object('need', 'Record the session and who attended', 'kind', v_kind);
            else
              v_status := 'satisfied';
              v_detail := jsonb_build_object('kind', v_kind, 'sessions', v_sessions,
                                             'attendees', v_attendees);
            end if;
          end;

        -- ── Insurance held, at the limit, and where required filed ──
        -- Amusement devices need not less than $1,000,000 per occurrence proved to the local
        -- health department annually before use, so a policy that exists but has not been filed
        -- is partial rather than satisfied.
        when 'insurance' then
          declare
            v_kind text := coalesce(r.evidence_rule ->> 'kind', 'general_liability');
            v_min bigint := coalesce((r.evidence_rule ->> 'min_per_occurrence_cents')::bigint, 0);
            v_pol record;
          begin
            select * into v_pol
              from compliance_insurance ins
             where ins.camp_id = p_camp_id and ins.kind = v_kind
               and (ins.expires_on is null or ins.expires_on >= current_date)
             order by ins.expires_on desc nulls last
             limit 1;

            if v_pol is null then
              v_status := 'missing';
              v_detail := jsonb_build_object('need', 'Record the policy', 'kind', v_kind);
            elsif v_min > 0 and coalesce(v_pol.per_occurrence_cents, 0) < v_min then
              v_status := 'partial';
              v_detail := jsonb_build_object('need', 'Coverage is below the required limit',
                                             'required_cents', v_min,
                                             'held_cents', v_pol.per_occurrence_cents);
            elsif (r.evidence_rule ->> 'must_file') = 'true' and v_pol.filed_on is null then
              v_status := 'partial';
              v_detail := jsonb_build_object('need', 'Proof has not been filed with the county yet',
                                             'expires_on', v_pol.expires_on);
            else
              v_status := 'satisfied';
              v_detail := jsonb_build_object('carrier', v_pol.carrier, 'expires_on', v_pol.expires_on);
              if v_pol.expires_on is not null and v_pol.expires_on <= current_date + v_soon_days then
                v_status := 'expiring';
              end if;
            end if;
          end;

        -- ── Permits and licences, from the safety register ──
        -- safety_licenses already had the right shape and was simply never wired to compliance.
        when 'permit' then
          declare
            v_ltype text := coalesce(r.evidence_rule ->> 'license_type', 'health_permit');
            v_lic record;
          begin
            select * into v_lic
              from safety_licenses l
             where l.camp_id = p_camp_id and l.license_type = v_ltype
             order by l.expiry_date desc nulls last
             limit 1;

            if v_lic is null then
              v_status := 'missing';
              v_detail := jsonb_build_object('need', 'Record the permit', 'license_type', v_ltype);
            elsif v_lic.expiry_date is not null and v_lic.expiry_date < current_date then
              v_status := 'missing';
              v_detail := jsonb_build_object('need', 'The permit on file has expired',
                                             'expired_on', v_lic.expiry_date);
            elsif v_lic.expiry_date is not null and v_lic.expiry_date <= current_date + v_soon_days then
              v_status := 'expiring';
              v_detail := jsonb_build_object('expires_on', v_lic.expiry_date,
                                             'renewal_due_on', v_lic.renewal_due_on);
            else
              v_status := 'satisfied';
              v_detail := jsonb_build_object('number', v_lic.license_number,
                                             'expires_on', v_lic.expiry_date,
                                             'posted', v_lic.posted_location);
            end if;
          end;

        -- ── Reportable incidents filed on the clock ──
        -- A camp with no reportable incidents is satisfied, which is the honest reading: the duty
        -- is to report what happens, not to have things happen. What fails it is an incident that
        -- was reportable and was not reported.
        when 'incident_reporting' then
          declare
            v_reportable int;
            v_late int;
            v_unreported int;
          begin
            select count(*),
                   count(*) filter (where i.reported_at is not null and i.report_due_at is not null
                                      and i.reported_at > i.report_due_at),
                   count(*) filter (where i.reported_at is null)
              into v_reportable, v_late, v_unreported
              from compliance_incidents i
             where i.camp_id = p_camp_id
               and (i.season_id = p_season_id or i.season_id is null)
               and i.reportable;

            if v_unreported > 0 then
              v_status := 'missing';
              v_detail := jsonb_build_object('need', 'Reportable incidents have not been reported',
                                             'unreported', v_unreported, 'reportable', v_reportable);
            elsif v_late > 0 then
              v_status := 'partial';
              v_detail := jsonb_build_object('reportable', v_reportable, 'late', v_late);
            else
              v_status := 'satisfied';
              v_detail := jsonb_build_object('reportable', v_reportable, 'late', 0);
            end if;
          end;

$ins$ || v_anchor;

  if position(v_anchor in v_def) = 0 then
    raise exception 'fallback anchor not found — the engine has been restructured, splice by hand';
  end if;

  execute replace(v_def, v_anchor, v_new);
  raise notice 'compute_camp_compliance: five branches spliced in';
end $outer$;
