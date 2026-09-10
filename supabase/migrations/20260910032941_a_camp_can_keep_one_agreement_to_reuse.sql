-- The agreement a camp sends every group, kept once.
--
-- It was a PDF uploaded per retreat, which means a camp that uses the same agreement forty
-- times a season uploads it forty times -- and a proposal that is supposed to go out with the
-- agreement attached could not, because at the moment of sending there was usually nothing
-- there. A camp can now keep one on file; a retreat can still have its own, and that wins,
-- because a group that negotiated different terms has a different agreement.

alter table camps
  add column if not exists agreement_template_path text,
  add column if not exists agreement_template_name text;

comment on column camps.agreement_template_path is
  'Storage path of the agreement sent to every group by default. A retreat''s own uploaded agreement takes precedence.';

/**
 * Give this retreat an agreement to sign, from the camp's stored one.
 *
 * Does nothing if the retreat already has an agreement -- including one the camp uploaded for
 * this group specifically, which is the whole reason a per-retreat upload still exists.
 */
create or replace function public.attach_agreement_from_template(p_retreat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_r retreats; v_c camps; v_id uuid;
begin
  select * into v_r from retreats where id = p_retreat_id;
  if v_r.id is null then raise exception 'No such retreat.'; end if;
  if not is_camp_member(v_r.camp_id) then raise exception 'Forbidden'; end if;

  select * into v_c from camps where id = v_r.camp_id;
  if coalesce(btrim(v_c.agreement_template_path), '') = '' then return null; end if;

  if exists (
    select 1 from retreat_documents
    where retreat_id = p_retreat_id and doc_type in ('agreement', 'contract')
  ) then return null; end if;

  insert into retreat_documents (camp_id, retreat_id, doc_type, name, status, file_path, sort_order)
  values (v_r.camp_id, p_retreat_id, 'agreement',
          coalesce(nullif(btrim(v_c.agreement_template_name), ''), 'Retreat agreement'),
          'pending', v_c.agreement_template_path, 0)
  returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function public.attach_agreement_from_template(uuid) to authenticated;
