-- Track whether an item's on-hand has ever been affirmatively counted/set. NULL means
-- "never counted" — the state a CSV import leaves an item in — so the UI can warn that
-- on-hand hasn't been established (distinct from a legitimate on-hand of 0).
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS last_counted_at timestamptz;

-- Existing items were set up by hand, so treat them as counted (don't flood the new flag).
-- Fresh imports going forward leave it NULL.
UPDATE inventory_items SET last_counted_at = created_at WHERE last_counted_at IS NULL;
