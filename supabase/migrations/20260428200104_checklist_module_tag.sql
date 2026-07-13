-- Add module_tag to checklist_tasks so tasks can be tagged to specific modules
-- (e.g. 'pool' makes the task appear in Pool Management → Pre/Post checklist)
ALTER TABLE checklist_tasks ADD COLUMN IF NOT EXISTS module_tag text;
