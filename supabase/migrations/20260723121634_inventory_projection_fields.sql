-- Reconciled inventory/ordering model.
-- shelf_life_days: caps how far ahead a perishable is ordered (NULL = non-perishable).
-- expected_delivery: when a SENT order is due — makes it "in-transit" stock in the
-- projection so it isn't double-ordered.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS shelf_life_days integer;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery date;
