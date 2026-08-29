-- How this camp keeps its written safety plan.
--
-- DOH-2040 is a checklist against a plan document, and camps arrive in two states. Some have a
-- plan they have used for years and want to keep it; asking them to retype seventy-three
-- sections is hostile and they will not do it. Others have nothing and need the plan written.
--
-- The builder previously asked for both a section body AND a page number, which only makes
-- sense if the plan lives somewhere else and we are also writing it. That contradiction is what
-- made the page a wall of boxes with no clear job.
--
-- Both modes end in a complete packet:
--   authored  the camp writes sections here, we render the plan and derive the page numbers
--   external  the camp keeps its own document and records only the page numbers, and attaches
--             its own PDF to the packet
--
-- Stored as a compliance answer because it is camp-and-season scoped like the rest of setup.
-- It is not an applicability key: no requirement gates on it.

alter table compliance_plan_sections
  add column if not exists derived_from text;

comment on column compliance_plan_sections.derived_from is
  'Set when the body started as a draft the platform assembled from facts the camp had already given us. Cleared once the camp edits it. Never counts as complete on its own.';
