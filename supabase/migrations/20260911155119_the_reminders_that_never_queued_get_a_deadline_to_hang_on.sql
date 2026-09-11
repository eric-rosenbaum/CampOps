-- Thirteen reminder rules were written, wired up, and three of them had never queued once.
--
-- agreement_*, deposit_* and housing_* each anchor to a deadline field -- an agreement's due_date,
-- retreats.deposit_due, retreats.housing_deadline. Every one of those was NULL on every retreat in
-- the system, so the planner skipped them silently, every night, forever. The two rules that did
-- fire (coi_*, spaces_*) are the two anchored to arrival_date, which is never null.
--
-- So this is not a missing feature. It is a feature waiting on a form field nobody fills in.
--
-- The form now defaults these visibly, so a camp sees the date and can change it before any email
-- quotes it. This backfills the retreats that already exist, on the same rule: a fixed number of
-- days before arrival, floored at today so a group booked next week does not acquire a deadline
-- that passed a fortnight ago. Only future bookings, and only where the camp left it blank.
update public.retreats r
   set deposit_due = greatest(r.arrival_date - 30, current_date)
 where r.deposit_due is null
   and r.arrival_date >= current_date
   and r.status not in ('cancelled', 'complete')
   and coalesce(r.deposit_required, 0) > 0;

update public.retreats r
   set housing_deadline = greatest(r.arrival_date - 14, current_date)
 where r.housing_deadline is null
   and r.arrival_date >= current_date
   and r.status not in ('cancelled', 'complete');

update public.retreats r
   set headcount_cutoff = greatest(r.arrival_date - 14, current_date)
 where r.headcount_cutoff is null
   and r.arrival_date >= current_date
   and r.status not in ('cancelled', 'complete');

-- The agreement is the odd one out: its deadline lives on the DOCUMENT, and the document is
-- created by attach_agreement_from_template() with a null due_date. So an agreement attached
-- automatically could never be chased automatically -- the two halves of the same feature did not
-- meet. Give it one when the retreat has a date to work back from.
update public.retreat_documents d
   set due_date = greatest(r.arrival_date - 30, current_date)
  from public.retreats r
 where r.id = d.retreat_id
   and d.doc_type = 'agreement'
   and d.due_date is null
   and d.status not in ('signed', 'approved')
   and r.arrival_date >= current_date
   and r.status not in ('cancelled', 'complete');

-- NOTE: this migration also replaced attach_agreement_from_template() to give new agreements a due
-- date, and in doing so dropped the `returning id into v_id` off its insert. The very next
-- migration puts it back. Left as it happened rather than edited out.
