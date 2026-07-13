-- Commissary phase 3a: per-diem cost tracking + receiving actuals.

-- Sessions carry a budgeted per-diem and meals/day (display only).
ALTER TABLE commissary_sessions
  ADD COLUMN IF NOT EXISTS budget_per_person_per_day numeric(10,2),
  ADD COLUMN IF NOT EXISTS meals_per_day int NOT NULL DEFAULT 3 CHECK (meals_per_day > 0);

-- Costs that don't flow through a purchase order: cash produce runs, Costco trips,
-- standing contracts. Feeds "actual spend" in the per-diem alongside received POs.
CREATE TABLE commissary_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES commissary_sessions(id) ON DELETE SET NULL,
  date        date NOT NULL,
  category    text NOT NULL DEFAULT 'other'
    CHECK (category IN ('protein','dairy','produce','dry_goods','pantry',
                        'frozen','snacks','beverage','other')),
  description text,
  amount      numeric(12,2) NOT NULL DEFAULT 0,
  created_by  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE commissary_expenses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commissary_expenses_updated_at BEFORE UPDATE ON commissary_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX commissary_expenses_camp_idx ON commissary_expenses(camp_id, date DESC);
CREATE POLICY "members_select_commissary_expenses" ON commissary_expenses FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_commissary_expenses" ON commissary_expenses FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- Receiving actuals: what showed up, not what was ordered.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_total  numeric(12,2),
  ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS received_qty        numeric(12,2),
  ADD COLUMN IF NOT EXISTS received_unit_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS received_note       text;

-- Booking now uses the received quantity when the receiver entered one, falling back
-- to the ordered quantity (so an un-annotated receive behaves as before). The client
-- writes received_qty / invoice fields onto the rows first, then calls this; the stock
-- booking + status flip stay atomic here.
CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id    uuid,
  p_received_by text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $function$
DECLARE
  v_status text;
  v_line   record;
  v_qty    numeric;
BEGIN
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = p_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found or not permitted', p_order_id;
  END IF;
  IF v_status = 'received' THEN
    RAISE EXCEPTION 'Purchase order already received';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot receive a cancelled order';
  END IF;

  FOR v_line IN
    SELECT item_id, order_qty, received_qty, purchase_unit_in_base
    FROM public.purchase_order_lines
    WHERE order_id = p_order_id
  LOOP
    v_qty := COALESCE(v_line.received_qty, v_line.order_qty);
    IF v_line.item_id IS NOT NULL AND v_qty > 0 THEN
      PERFORM public.adjust_inventory_item(
        v_line.item_id,
        v_qty * v_line.purchase_unit_in_base,
        'received',
        'Received PO',
        p_received_by
      );
    END IF;
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'received', received_at = now(), updated_at = now()
  WHERE id = p_order_id;
END;
$function$;

ALTER PUBLICATION supabase_realtime ADD TABLE commissary_expenses;
ALTER TABLE public.commissary_expenses REPLICA IDENTITY FULL;
