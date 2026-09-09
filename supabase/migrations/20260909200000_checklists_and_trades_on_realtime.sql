-- The campground subscription lists issue_checklist_items among its tables and the store's
-- applyTemplate said "realtime brings the rows back" -- but the table was never added to the
-- publication, so nothing came back. Applying a checklist looked like it did nothing until
-- something else forced a full reload, which is exactly what people reported: steps appearing
-- much later, on some work orders and not others.

alter publication supabase_realtime add table issue_checklist_items;
alter publication supabase_realtime add table work_checklist_templates;
alter publication supabase_realtime add table camp_trades;

-- Updates need the full old row for the client to match what it already holds.
alter table issue_checklist_items replica identity full;
alter table work_checklist_templates replica identity full;
alter table camp_trades replica identity full;
