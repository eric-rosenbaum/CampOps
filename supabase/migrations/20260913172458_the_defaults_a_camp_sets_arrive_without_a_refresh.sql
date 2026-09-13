-- The campground domain reloads off a realtime channel bound to its tables. A default the camp
-- has just chosen has to reach the approve screen the same way everything else does.
alter publication supabase_realtime add table camp_work_defaults;
