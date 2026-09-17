import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Loader2, UtensilsCrossed } from 'lucide-react';
import { RequestForm } from '@/components/foodRequests/RequestForm';
import { FoodStatusChip } from '@/components/foodRequests/foodUi';
import {
  publicGetFoodForm, publicGetFoodStatus, publicSubmitFoodRequest, type PublicFoodForm, type PublicFoodStatus,
} from '@/lib/foodRequestsDb';
import { FOOD_STATUS_LABELS, draftToPayload, formatPickup } from '@/lib/foodRequests';
import { deviceRequestsFor, forgetDeviceRequest, rememberDeviceRequest } from '@/lib/foodDeviceRequests';

type Mine = { statusToken: string; status: PublicFoodStatus };

/**
 * The requests this phone sent on this link, read fresh from their status pages. Newest 6: a
 * counselor looks for this week's, not June's.
 */
function useMyRequests(programToken: string) {
  const [mine, setMine] = useState<Mine[] | null>(null);
  useEffect(() => {
    let live = true;
    const saved = deviceRequestsFor(programToken).slice(0, 6);
    Promise.all(saved.map(async (s) => {
      try {
        const status = await publicGetFoodStatus(s.statusToken);
        if (!status) { forgetDeviceRequest(s.statusToken); return null; }
        return { statusToken: s.statusToken, status };
      } catch { return null; }
    })).then((rows) => { if (live) setMine(rows.filter((r): r is Mine => !!r)); });
    return () => { live = false; };
  }, [programToken]);
  return mine;
}

/**
 * /food/:token — a program's no-login link to the kitchen.
 *
 * The person holding the phone is a counselor who has never seen CampCommand and is standing in
 * a cabin with twelve kids. No account, no instructions: the program's name at the top, what the
 * kitchen needs to know, and a button. Everything it can learn comes from one anon RPC that
 * returns item names and units and nothing about stock, prices or other programs.
 */
export function PublicFoodRequest() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<PublicFoodForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const mine = useMyRequests(token);

  useEffect(() => {
    let live = true;
    publicGetFoodForm(token)
      .then((f) => { if (!live) return; setForm(f); setState(f ? 'ready' : 'not_found'); })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-cream">
        <Loader2 className="h-5 w-5 animate-spin text-forest" />
      </div>
    );
  }

  if (state !== 'ready' || !form) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-cream px-5">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-[20px] font-bold text-forest">
            {state === 'error' ? 'We could not reach the kitchen' : 'This link is not active'}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            {state === 'error'
              ? 'Check your connection and try again.'
              : 'It may have been replaced with a new one. Ask the kitchen or your program lead for the current link.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    // Deep bottom padding: the Send button must clear the environment badge pinned bottom-left on
    // staging, and a phone's home indicator everywhere.
    <div className="min-h-screen w-full bg-cream px-4 pb-28 pt-6 sm:px-5 sm:pt-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-5 flex items-center gap-2.5">
          {form.camp.logo_url
            ? <img src={form.camp.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            : <span className="grid h-8 w-8 place-items-center rounded-full bg-forest text-paper"><UtensilsCrossed className="h-4 w-4" /></span>}
          <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-sage">{form.camp.name} · Kitchen</span>
        </div>

        <h1 className="font-display text-[26px] font-bold leading-tight text-forest">
          Food for {form.program.name}
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
          Tell the kitchen what you need and when you&rsquo;ll pick it up. You&rsquo;ll get an email when it&rsquo;s approved and when it&rsquo;s ready.
        </p>

        {mine && mine.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-card border border-sage/40 bg-white" data-testid="my-device-requests">
            <p className="border-b border-border px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-forest">Your requests on this phone</p>
            <ul>
              {mine.map(({ statusToken, status: s }) => (
                <li key={statusToken} className="border-b border-border last:border-0">
                  <Link to={`/food/status/${statusToken}`} data-testid="my-device-request"
                    className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5 text-[14px] text-ink hover:bg-cream active:bg-cream">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-forest">{formatPickup(s.pickup_date, s.pickup_time.slice(0, 5))}</span>
                      {s.purpose && <span className="block truncate text-[12.5px] text-ink-soft">{s.purpose}</span>}
                    </span>
                    <FoodStatusChip status={s.status} label={FOOD_STATUS_LABELS[s.status] === 'Waiting for the kitchen' ? 'Waiting' : undefined} />
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-faint" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(() => {
          // Everyone else's, so two counselors don't ask for the same campfire twice. A first name
          // and a status only: these rows open nothing, because only the asker holds the link.
          const mineRefs = new Set((mine ?? []).map((m) => m.status.ref));
          const others = form.upcoming.filter((u) => !mineRefs.has(u.ref));
          if (others.length === 0) return null;
          return (
            <div className="mt-4 rounded-card border border-border bg-white px-3.5 py-3" data-testid="others-requests">
              <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft">Already asked by others for {form.program.name}</p>
              <ul className="space-y-1.5">
                {others.slice(0, 5).map((u) => (
                  <li key={u.ref} className="flex items-center justify-between gap-3 text-[14px] text-ink">
                    <span className="min-w-0">
                      {formatPickup(u.pickup_date, u.pickup_time.slice(0, 5))}
                      {u.asked_by && <span className="text-ink-soft"> · {u.asked_by}</span>}
                    </span>
                    <FoodStatusChip status={u.status} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        <div className="mt-6">
          <RequestForm
            items={form.items}
            timeZone={form.camp.timezone}
            cutoffHours={Number(form.cutoff_hours)}
            pickupLocation={form.pickup_location}
            askContact
            onSubmit={async (draft) => {
              const { error, result } = await publicSubmitFoodRequest(token, draftToPayload(draft));
              if (error || !result) return error ?? 'Something went wrong. Please try again.';
              rememberDeviceRequest(token, result.status_token);
              navigate(`/food/status/${result.status_token}?sent=1`);
              return null;
            }}
          />
        </div>
      </div>
    </div>
  );
}
