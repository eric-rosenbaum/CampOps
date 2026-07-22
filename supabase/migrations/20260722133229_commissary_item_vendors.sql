-- Commissary multi-vendor pack sizes.
--
-- The same ingredient is sold by different vendors in different pack sizes and at
-- different prices — a case of chicken is 40 lb from US Foods but 30 lb from Sysco.
-- Before this, an item held a single vendor + pack + price. Now an item can carry a
-- pack per vendor, and an order line can be pointed at whichever vendor you're buying
-- from that week; the base-unit conversion follows automatically.
--
-- The item's own vendor_id / purchase_unit / purchase_unit_in_base / unit_price columns
-- are KEPT as a mirror of the default pack, so all existing ordering and cost math keeps
-- reading them unchanged — multi-vendor is purely additive. The client keeps the mirror
-- in sync whenever packs change.

CREATE TABLE IF NOT EXISTS commissary_item_vendors (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id               uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  item_id               uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  vendor_id             uuid NOT NULL REFERENCES commissary_vendors(id) ON DELETE CASCADE,
  -- How this vendor sells it, expressed in the item's base unit.
  purchase_unit         text NOT NULL,
  purchase_unit_in_base numeric NOT NULL,
  unit_price            numeric,
  -- Exactly one row per item should be default; it mirrors the item's own columns and
  -- drives order generation until a line is switched to another vendor.
  is_default            boolean NOT NULL DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (item_id, vendor_id)
);

ALTER TABLE commissary_item_vendors ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commissary_item_vendors_updated_at BEFORE UPDATE ON commissary_item_vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS commissary_item_vendors_camp_id_idx ON commissary_item_vendors(camp_id);
CREATE INDEX IF NOT EXISTS commissary_item_vendors_item_id_idx ON commissary_item_vendors(item_id);

CREATE POLICY "members_select_commissary_item_vendors" ON commissary_item_vendors FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_commissary_item_vendors"   ON commissary_item_vendors FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

ALTER PUBLICATION supabase_realtime ADD TABLE commissary_item_vendors;
ALTER TABLE public.commissary_item_vendors REPLICA IDENTITY FULL;

-- Backfill: every item that already has a vendor becomes that vendor's default pack,
-- copying the item's current pack + price verbatim so nothing changes for existing data.
INSERT INTO commissary_item_vendors
  (camp_id, item_id, vendor_id, purchase_unit, purchase_unit_in_base, unit_price, is_default)
SELECT camp_id, id, vendor_id, purchase_unit, purchase_unit_in_base, unit_price, true
FROM inventory_items
WHERE vendor_id IS NOT NULL
ON CONFLICT (item_id, vendor_id) DO NOTHING;
