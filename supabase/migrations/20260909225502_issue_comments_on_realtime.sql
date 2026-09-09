-- A message on a work order should appear for everyone looking at it.
--
-- The campground subscription has always listed issue_comments among the tables it watches, but
-- the table was never added to the publication, so nothing arrived: two people on the same job
-- typed at each other and saw silence until one of them reloaded. Same omission that kept
-- applied checklists from showing up.

alter publication supabase_realtime add table issue_comments;
alter table issue_comments replica identity full;

-- Read receipts too, so an unread marker clears on the reader's other devices instead of
-- staying lit until they reload.
alter publication supabase_realtime add table issue_comment_reads;
alter table issue_comment_reads replica identity full;
