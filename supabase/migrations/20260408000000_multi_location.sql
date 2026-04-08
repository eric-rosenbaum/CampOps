-- Migrate location (single text) → locations (text array) on issues and checklist_tasks

-- issues
ALTER TABLE issues ADD COLUMN locations text[] NOT NULL DEFAULT '{}';
UPDATE issues SET locations = ARRAY[location];
ALTER TABLE issues DROP COLUMN location;

-- checklist_tasks
ALTER TABLE checklist_tasks ADD COLUMN locations text[] NOT NULL DEFAULT '{}';
UPDATE checklist_tasks SET locations = ARRAY[location];
ALTER TABLE checklist_tasks DROP COLUMN location;
