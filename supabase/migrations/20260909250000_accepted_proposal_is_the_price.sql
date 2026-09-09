-- A camp edits the amount on a proposal line all the time -- a negotiated rate, a package price,
-- a discount for a shoulder week -- and that number is what the group accepts. Nothing read it
-- back. Both the camp panel and the guest portal resolved the expected total as
-- invoice -> charges -> rate card, so a group that accepted $25,000 was quoted $16,200 from the
-- rate formula until somebody raised an invoice. The two numbers on screen were the two numbers
-- nobody had agreed to.
--
-- The accepted proposal now sits between charges and the rate card, on both sides. It is applied
-- by rewriting the deployed function body rather than restating it: get_portal_data is long,
-- and a hand-retyped copy is how the two drift apart. get_portal_data_v2 delegates to it, so it
-- inherits the change.

do $mig$
declare v_src text; v_new text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'public.get_portal_data(text,text)'::regprocedure;

  -- Already applied (a re-run, or a fresh database built from a later dump).
  if position('v_agreed' in v_src) > 0 then return; end if;

  v_new := replace(v_src,
    'v_nights int; v_expected numeric; v_inv_gross numeric;',
    'v_nights int; v_expected numeric; v_inv_gross numeric; v_agreed numeric;');

  v_new := replace(v_new,
'  IF v_inv_gross IS NOT NULL THEN v_expected := v_inv_gross;
  ELSIF v_charges > 0 THEN v_expected := v_charges;
  ELSE v_expected := CASE r.pricing_model',
'  SELECT total INTO v_agreed FROM retreat_proposals
   WHERE retreat_id = r.id AND status = ''accepted'' AND COALESCE(total,0) > 0
   ORDER BY version DESC LIMIT 1;

  IF v_inv_gross IS NOT NULL THEN v_expected := v_inv_gross;
  ELSIF v_charges > 0 THEN v_expected := v_charges;
  ELSIF v_agreed IS NOT NULL THEN v_expected := v_agreed;
  ELSE v_expected := CASE r.pricing_model');

  if v_new = v_src then
    raise exception 'accepted-proposal patch did not match get_portal_data; apply it by hand';
  end if;

  execute format(
    'create or replace function public.get_portal_data(p_token text, p_session text default null::text)
     returns jsonb language plpgsql stable security definer set search_path = public as %L',
    v_new);
end $mig$;
