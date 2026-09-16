import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, UtensilsCrossed } from 'lucide-react';
import { RequestForm } from '@/components/foodRequests/RequestForm';
import { FoodStatusChip } from '@/components/foodRequests/foodUi';
import { publicGetFoodForm, publicSubmitFoodRequest, type PublicFoodForm } from '@/lib/foodRequestsDb';
import { draftToPayload, formatPickup } from '@/lib/foodRequests';

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
    <div className="min-h-screen w-full bg-cream px-4 pb-16 pt-6 sm:px-5 sm:pt-10">
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

        {form.upcoming.length > 0 && (
          <div className="mt-5 rounded-card border border-border bg-white px-3.5 py-3">
            <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft">Already asked for {form.program.name}</p>
            <ul className="space-y-1">
              {form.upcoming.slice(0, 5).map((u, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-[14px] text-ink">
                  <span>{formatPickup(u.pickup_date, u.pickup_time.slice(0, 5))}</span>
                  <FoodStatusChip status={u.status} />
                </li>
              ))}
            </ul>
          </div>
        )}

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
              navigate(`/food/status/${result.status_token}?sent=1`);
              return null;
            }}
          />
        </div>
      </div>
    </div>
  );
}
