-- Commissary phase 2a: purchase ordering.
--
-- A purchase order is a SNAPSHOT, not a live view. Prices move, stock moves, and a
-- sent order must not mutate underneath you — so every line freezes the item name,
-- pack factors, on-hand, computed need and unit price at the moment it was generated.
-- item_id is kept only as a soft link (ON DELETE SET NULL) for receiving stock back in.

CREATE TABLE purchase_orders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  vendor_id  uuid REFERENCES commissary_vendors(id) ON DELETE SET NULL,
  vendor_name text NOT NULL,
  status     text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','received','cancelled')),
  -- How the quantities were derived, so the order explains itself later.
  source     text NOT NULL DEFAULT 'par'
    CHECK (source IN ('menu','par')),
  session_id  uuid REFERENCES commissary_sessions(id) ON DELETE SET NULL,
  week_number int,
  subtotal     numeric(12,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  total        numeric(12,2) NOT NULL DEFAULT 0,
  delivery_instructions text,
  created_by  text,
  sent_at     timestamptz,
  received_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX purchase_orders_camp_status_idx ON purchase_orders(camp_id, status);
CREATE POLICY "members_select_purchase_orders" ON purchase_orders FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_purchase_orders"   ON purchase_orders FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE purchase_order_lines (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id  uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id  uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  -- Frozen at generation.
  item_name    text NOT NULL,
  stock_unit   text NOT NULL,
  purchase_unit text NOT NULL,
  purchase_unit_in_base numeric(14,6) NOT NULL CHECK (purchase_unit_in_base > 0),
  on_hand_base numeric(14,4) NOT NULL DEFAULT 0,
  needed_base  numeric(14,4) NOT NULL DEFAULT 0,
  -- Whole purchase units. You cannot buy 1.82 cases of eggs.
  order_qty    numeric(12,2) NOT NULL DEFAULT 0 CHECK (order_qty >= 0),
  unit_price   numeric(10,2),
  line_total   numeric(12,2) NOT NULL DEFAULT 0,
  sort_order   int DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_purchase_order_lines_updated_at BEFORE UPDATE ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX purchase_order_lines_order_id_idx ON purchase_order_lines(order_id);
CREATE POLICY "members_select_po_lines" ON purchase_order_lines FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_po_lines"   ON purchase_order_lines FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- Receiving an order books every line into stock and writes the audit trail, in one
-- transaction, reusing the same atomic increment the Adjust dialog uses. Doing this
-- line-by-line from the client would leave a half-received order behind on any failure.
CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id    uuid,
  p_received_by text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $function$
DECLARE
  v_status text;
  v_line   record;
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
    SELECT item_id, order_qty, purchase_unit_in_base, item_name
    FROM public.purchase_order_lines
    WHERE order_id = p_order_id AND order_qty > 0
  LOOP
    -- Lines whose item was deleted since generation are skipped, not fatal.
    IF v_line.item_id IS NOT NULL THEN
      PERFORM public.adjust_inventory_item(
        v_line.item_id,
        v_line.order_qty * v_line.purchase_unit_in_base,
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

ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders, purchase_order_lines;
ALTER TABLE public.purchase_orders      REPLICA IDENTITY FULL;
ALTER TABLE public.purchase_order_lines REPLICA IDENTITY FULL;
