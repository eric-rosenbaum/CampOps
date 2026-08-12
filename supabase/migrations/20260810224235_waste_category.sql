-- Waste categorisation for inventory adjustments.
--
-- Waste is not one thing, and reporting it as one number overstates what a camp can act
-- on. Spoilage, overproduction and damage respond to better ordering, rotation and
-- forecasting; trim loss and plate waste do not (ReFED puts roughly 70% of foodservice
-- waste at the plate). So every waste row now carries a category, and the Waste tab
-- reports the reducible share separately from the rest rather than blending them.
--
-- NULL is meaningful and permitted: every row written before this migration was logged
-- without a category, and the UI reports those as uncategorised instead of assuming a
-- bucket for them. A backfill would be inventing data.

alter table public.inventory_adjustments
  add column if not exists waste_category text;

alter table public.inventory_adjustments
  drop constraint if exists inventory_adjustments_waste_category_check;
alter table public.inventory_adjustments
  add constraint inventory_adjustments_waste_category_check
  check (
    waste_category is null
    or waste_category in ('spoilage', 'overproduction', 'damage', 'prep_loss', 'plate_waste', 'other')
  );

-- A category is only meaningful on a waste row. Enforcing this keeps the reducible-share
-- denominator honest: it can only ever be computed over rows that are actually waste.
alter table public.inventory_adjustments
  drop constraint if exists inventory_adjustments_waste_category_reason_check;
alter table public.inventory_adjustments
  add constraint inventory_adjustments_waste_category_reason_check
  check (waste_category is null or reason = 'waste');

-- The waste report only ever scans waste rows, so index only those.
create index if not exists inventory_adjustments_waste_idx
  on public.inventory_adjustments (camp_id, created_at desc)
  where reason = 'waste';


-- ─── adjust_inventory_item: drop and recreate with a 6th argument ────────────────────
--
-- The 5-arg signature is DROPPED on purpose rather than left in place as an overload.
-- Because every argument after p_delta_base has a default, a 5-arg and a 6-arg version
-- would both be candidates for a 5-arg call — PostgREST would resolve it ambiguously and
-- could silently keep writing category-less waste rows forever. One signature, no doubt.
-- Existing 5-arg callers still work: p_waste_category simply takes its DEFAULT.
--
-- search_path is re-pinned below because DROP discards what
-- 20260724162648_security_phase1_function_hardening_2 applied. SECURITY INVOKER (the
-- original behaviour, and what makes RLS on inventory_items apply to the caller) is
-- stated explicitly here so a future reader cannot mistake it for an oversight.

drop function if exists public.adjust_inventory_item(uuid, numeric, text, text, text);

create function public.adjust_inventory_item(
  p_item_id       uuid,
  p_delta_base    numeric,
  p_reason        text default 'other',
  p_notes         text default null,
  p_adjusted_by   text default null,
  p_waste_category text default null
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_camp_id     uuid;
  v_new_on_hand numeric;
  v_category    text;
BEGIN
  -- Defend the reason/category constraint at the door: a caller that leaves a stale
  -- category selected while switching the reason away from waste gets it dropped, not
  -- a failed write.
  v_category := CASE WHEN p_reason = 'waste' THEN p_waste_category ELSE NULL END;

  UPDATE public.inventory_items
  SET on_hand_base = GREATEST(0, on_hand_base + p_delta_base),
      updated_at   = now()
  WHERE id = p_item_id
  RETURNING camp_id, on_hand_base INTO v_camp_id, v_new_on_hand;

  IF v_camp_id IS NULL THEN
    RAISE EXCEPTION 'Inventory item % not found or not permitted', p_item_id;
  END IF;

  INSERT INTO public.inventory_adjustments
    (camp_id, item_id, delta_base, resulting_on_hand_base, reason, notes, adjusted_by, waste_category)
  VALUES
    (v_camp_id, p_item_id, p_delta_base, v_new_on_hand, p_reason, p_notes, p_adjusted_by, v_category);

  RETURN v_new_on_hand;
END;
$function$;
