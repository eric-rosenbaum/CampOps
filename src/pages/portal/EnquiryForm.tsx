import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabasePublic } from './portalShared';

/**
 * The front door for a group that has not booked anything yet.
 *
 * Everything else in Retreats assumes a retreat already exists — the guest portal is reached by a
 * token, and a token only exists once somebody at the camp has typed the booking in. So an
 * enquiry had to arrive as an email or a phone call and be transcribed, and the AI intake that
 * helps with that is still a person doing data entry from a message.
 *
 * This is the page that was missing. It writes an `inquiry`: the same row every other lead is,
 * so it lands in the pipeline, can be quoted from, and becomes a confirmed booking without
 * anyone retyping it.
 */

const GROUP_TYPES: { value: string; label: string }[] = [
  { value: 'synagogue', label: 'Synagogue or church' },
  { value: 'school', label: 'School' },
  { value: 'youth', label: 'Youth group' },
  { value: 'corporate', label: 'Company or team' },
  { value: 'alumni', label: 'Alumni group' },
  { value: 'family', label: 'Family' },
  { value: 'other', label: 'Something else' },
];

const field =
  'w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-[15px] text-ink ' +
  'focus:border-sage focus:outline-none';
const label = 'block text-[13px] font-semibold text-forest mb-1.5';

export function EnquiryForm() {
  const { token = '' } = useParams();
  const [camp, setCamp] = useState<{ camp_name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [groupName, setGroupName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [groupType, setGroupType] = useState('other');
  const [headcount, setHeadcount] = useState('');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [flexibility, setFlexibility] = useState('');
  const [message, setMessage] = useState('');

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabasePublic.rpc('camp_enquiry_page', { p_token: token });
      if (!live) return;
      setCamp((data as { camp_name: string } | null) ?? null);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const { error: err } = await supabasePublic.rpc('submit_camp_enquiry', {
      p_token: token,
      p_group_name: groupName,
      p_contact_name: contactName,
      p_email: email,
      p_phone: phone || null,
      p_group_type: groupType,
      p_headcount: headcount ? Number(headcount) : null,
      p_arrival: arrival || null,
      p_departure: departure || null,
      p_flexibility: flexibility || null,
      p_message: message || null,
    });
    setSending(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-cream">
        <Loader2 className="h-5 w-5 animate-spin text-forest" />
      </div>
    );
  }

  if (!camp) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-cream px-5">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-[20px] font-bold text-forest">This link is not recognised</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            It may have been withdrawn. Try the camp&rsquo;s website for a current one.
          </p>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-cream px-5">
        <div className="max-w-md text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-sage" />
          <h1 className="font-display text-[22px] font-bold text-forest">Thank you — that&rsquo;s with us</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            {camp.camp_name} has your enquiry and will be in touch. Nothing is booked yet, and
            nothing is owed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-cream px-5 py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-[26px] font-bold text-forest">Enquire at {camp.camp_name}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
          Enter all the information you know about your retreat. Missing or undecided information
          is fine!
        </p>

        <form onSubmit={submit} className="mt-7 space-y-5">
          <div>
            <label className={label} htmlFor="q-group">Your group *</label>
            <input id="q-group" required value={groupName} onChange={(e) => setGroupName(e.target.value)}
                   className={field} placeholder="Beth Am Youth Group" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="q-name">Your name *</label>
              <input id="q-name" required value={contactName} onChange={(e) => setContactName(e.target.value)}
                     className={field} />
            </div>
            <div>
              <label className={label} htmlFor="q-email">Email *</label>
              <input id="q-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     className={field} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="q-phone">Phone</label>
              <input id="q-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="q-type">What kind of group</label>
              <select id="q-type" value={groupType} onChange={(e) => setGroupType(e.target.value)} className={field}>
                {GROUP_TYPES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={label} htmlFor="q-count">Roughly how many people</label>
            <input id="q-count" inputMode="numeric" value={headcount}
                   onChange={(e) => setHeadcount(e.target.value.replace(/[^0-9]/g, ''))}
                   className={`${field} sm:w-40`} placeholder="35" />
          </div>

          {/* Dates are optional on purpose. A group says "a weekend in October" months before it
              says the 10th, and a form that demands exact dates turns that group away. */}
          <div>
            <label className={label}>When, if you know</label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)}
                     className={field} aria-label="Arrival" />
              <input type="date" value={departure} onChange={(e) => setDeparture(e.target.value)}
                     className={field} aria-label="Departure" />
            </div>
            <input value={flexibility} onChange={(e) => setFlexibility(e.target.value)}
                   className={`${field} mt-3`} placeholder="Or in words — “a weekend in October”" />
          </div>

          <div>
            <label className={label} htmlFor="q-msg">Anything else we should know</label>
            <textarea id="q-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
                      className={`${field} resize-y`}
                      placeholder="What you are planning, meals, anything you need." />
          </div>

          {error && (
            <p className="rounded-xl border border-red/30 bg-red-bg px-3.5 py-2.5 text-[13.5px] text-red">
              {error}
            </p>
          )}

          <button type="submit" disabled={sending}
                  className="w-full rounded-xl bg-forest px-4 py-3 text-[15px] font-bold text-paper
                             transition-colors hover:bg-forest-mid disabled:opacity-50">
            {sending ? 'Sending…' : 'Send enquiry'}
          </button>
        </form>
      </div>
    </div>
  );
}
