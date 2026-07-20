-- Commissary recipe steps: prep lead time.
--
-- A step can now declare how far ahead it must be done, so the production prep
-- calendar can schedule it to the right slot ("night before", "morning of",
-- "2 days before"). lead_days = whole days before service (0 = day of); time_slot
-- narrows it within the day. Both default to "day of, any time", so every existing
-- step keeps its current meaning.

ALTER TABLE recipe_steps
  ADD COLUMN IF NOT EXISTS lead_days int NOT NULL DEFAULT 0 CHECK (lead_days >= 0),
  ADD COLUMN IF NOT EXISTS time_slot text CHECK (time_slot IN ('morning','afternoon','evening'));
