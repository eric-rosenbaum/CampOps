-- Commissary sessions: per-meal head counts.
--
-- Attendance often differs by meal, some campers go home for dinner, some arrive
-- early for breakfast. meal_counts lets a session declare a head count PER meal
-- period. NULL (the default) means "same for every meal" = camper_count + staff_count,
-- preserving existing behavior. A JSON object keyed by meal period, e.g.
--   {"breakfast": 180, "lunch": 210, "dinner": 160}
-- Any meal absent from the object falls back to the session total. One-off changes
-- for a specific date are still handled by commissary_meal_events, which layer on top.

ALTER TABLE commissary_sessions
  ADD COLUMN IF NOT EXISTS meal_counts jsonb;
