-- Items can carry dietary tags (vegetarian/vegan/kosher/halal) alongside allergens, shown
-- together as "Allergens / Dietary preferences". Kept separate from `allergens` so dietary
-- accommodations never raise safety allergen warnings.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS dietary text[] NOT NULL DEFAULT '{}';
