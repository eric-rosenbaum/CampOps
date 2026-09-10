-- A per-person quote is three numbers, and the total is what they come to.
--
-- The editor let a camp type any total it liked, which is how a proposal ended up saying
-- "50 people × 3 nights @ $120" beside $25,000 -- a number that is not 50 × 3 × 120 and that
-- nobody could explain a month later. Worse, the arithmetic and the figure disagreed on the
-- document the group signs.
--
-- For the common model the three inputs are stored and the base line is derived from them.
-- Extras and discounts stay free-form lines, because a firewood bundle or a shoulder-week
-- discount is not expressible as rate × people × nights and pretending otherwise would push
-- camps back to editing the total. Flat and per-cabin-night camps are untouched: their price
-- is genuinely one number.

alter table retreat_proposals
  add column if not exists people_count int,
  add column if not exists nights int;

comment on column retreat_proposals.people_count is
  'Heads the quote was priced on. Stored rather than read off the retreat, because a quote is a promise about the numbers as they stood when it was sent.';
comment on column retreat_proposals.nights is
  'Nights the quote was priced on, same reason.';

-- Backfill from what each existing proposal was actually built against.
update retreat_proposals p
set people_count = coalesce(p.people_count, r.final_headcount, r.headcount),
    nights = coalesce(p.nights, greatest(r.departure_date - r.arrival_date, 1))
from retreats r
where r.id = p.retreat_id and (p.people_count is null or p.nights is null);
