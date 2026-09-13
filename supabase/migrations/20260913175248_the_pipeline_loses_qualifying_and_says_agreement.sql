-- Two changes to the pipeline's stages.
--
-- 'qualifying' goes. It was a column a lead sat in while somebody decided whether it was real,
-- which is a thing a salesperson does in their head between reading an inquiry and answering it,
-- not a place a booking lives for a week. Anything in it becomes 'new', which is where it was
-- being worked from anyway.
--
-- 'proposal' becomes 'agreement', because the retreat agreement IS the proposal here -- one
-- document that quotes the stay and is signed to accept it -- and the pipeline was the last
-- place still calling it something else.
update retreats set lead_stage = 'new'       where lead_stage = 'qualifying';
update retreats set lead_stage = 'agreement' where lead_stage = 'proposal';

alter table retreats drop constraint if exists retreats_lead_stage_check;
alter table retreats add constraint retreats_lead_stage_check
  check (lead_stage in ('new','agreement','contract_out','won','lost'));
