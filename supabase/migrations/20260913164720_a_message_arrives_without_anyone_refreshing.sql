-- A thread that needs a page refresh is not a thread.
--
-- Neither table was in the realtime publication, so a group ticking a room or writing a message
-- reached the camp's screen only when something else happened to reload the retreat domain.
-- For the space REQUESTS that was merely slow; for messages it defeats the point.
alter publication supabase_realtime add table retreat_space_messages;
alter publication supabase_realtime add table retreat_space_requests;
