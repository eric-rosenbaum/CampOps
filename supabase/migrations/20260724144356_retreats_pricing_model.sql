alter table public.retreats
  add column if not exists pricing_model text not null default 'per_person_night'
    check (pricing_model in ('per_person_night', 'per_cabin_night', 'flat')),
  add column if not exists flat_rate numeric;

comment on column public.retreats.pricing_model is 'How this group is billed: per_person_night uses rate_per_person_night; per_cabin_night and flat use flat_rate.';
comment on column public.retreats.flat_rate is 'For per_cabin_night: rate per cabin per night. For flat: total facility fee for the stay.';
