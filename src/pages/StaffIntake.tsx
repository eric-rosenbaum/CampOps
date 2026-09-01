import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { rpcIntakePrompt, rpcIntakeSubmit } from '@/lib/staffIntakeDb';

/**
 * The page a camp's staff member lands on, holding no login and no camp data.
 *
 * Everything it can learn comes from one RPC keyed on the token: the camp's name, and the
 * person's own name if the link was aimed at them. It cannot read the roster, and a wrong or
 * expired token simply finds nothing — it does not say whether the camp exists.
 *
 * The fields are the ones New York's permit forms ask about a person. There is nothing here about
 * background checks: a camp records that a check was run and when, through an admin who knows
 * what they are attesting to, and asking somebody to self-report their own criminal history into
 * a web form would be both useless as evidence and wrong to store.
 */
export function StaffIntake() {
  const { token = '' } = useParams();
  const [prompt, setPrompt] = useState<
    { campName: string; personName: string | null; isOpen: boolean } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'sent'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [sex, setSex] = useState('');
  const [education, setEducation] = useState('');
  const [experience, setExperience] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      const p = await rpcIntakePrompt(token);
      if (!live) return;
      if (!p) { setState('gone'); return; }
      setPrompt(p);
      setName(p.personName ?? '');
      setState('ready');
    })();
    return () => { live = false; };
  }, [token]);

  async function submit() {
    setError(null);
    if (!name.trim()) { setError('Please give your name.'); return; }
    setBusy(true);
    const ok = await rpcIntakeSubmit(token, {
      name: name.trim(), title, dateOfBirth: dateOfBirth || null, sex, education,
      qualifyingExperience: experience,
    });
    setBusy(false);
    if (ok) setState('sent');
    else setError('That did not go through. The link may have expired — ask your camp for a new one.');
  }

  if (state === 'loading') {
    return (
      <Shell>
        <Loader2 className="w-5 h-5 animate-spin text-ink-faint" />
      </Shell>
    );
  }

  if (state === 'gone') {
    return (
      <Shell>
        <h1 className="font-display text-[22px] text-forest">This link is no longer active</h1>
        <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">
          It may have expired or been replaced. Ask your camp for a current one.
        </p>
      </Shell>
    );
  }

  if (state === 'sent') {
    return (
      <Shell>
        <div className="inline-flex items-center gap-2 text-green-muted-text">
          <Check className="w-5 h-5" />
          <h1 className="font-display text-[22px]">Sent to {prompt?.campName}</h1>
        </div>
        <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">
          Your camp will add it to their records. Nothing further is needed from you.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-[24px] text-forest">{prompt?.campName}</h1>
      <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed max-w-[60ch]">
        Your camp needs a few details for its state permit paperwork. It takes a minute, and only
        the name is required.
      </p>

      <div className="mt-5 space-y-3">
        <Field label="Your name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Your role at camp">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Counselor, lifeguard, kitchen…" className={INPUT} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Date of birth"
            hint="Printed beside certified staff on the state's forms.">
            <input type="date" value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Sex" hint="The state's form prints two columns.">
            <select value={sex} onChange={(e) => setSex(e.target.value)} className={INPUT}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
        </div>
        <Field label="Education" hint="Highest level completed, or your school.">
          <input value={education} onChange={(e) => setEducation(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Camp or childcare experience"
          hint="Previous seasons, and what you did.">
          <textarea value={experience} onChange={(e) => setExperience(e.target.value)}
            rows={3} className={INPUT} />
        </Field>
      </div>

      {error && <p className="text-[12.5px] text-red-text mt-3">{error}</p>}

      <div className="mt-5">
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Send to {prompt?.campName}
        </Button>
      </div>

      <p className="text-[11.5px] text-ink-faint mt-5 leading-relaxed max-w-[62ch]">
        Your camp holds this for its health department permit. We never ask for, and never store,
        the result of a background check or a social security number.
      </p>
    </Shell>
  );
}

const INPUT = 'w-full bg-white border border-border rounded-btn px-3 py-2 text-[13px] '
  + 'focus:outline-none focus:border-sage';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // `#root` is itself a flex container, so a bare full-width div here shrinks to its content
    // and the card sits against the left edge. `w-full` makes it fill the row.
    <div className="min-h-screen w-full bg-paper flex items-start justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl bg-white border border-border rounded-card px-6 sm:px-8 py-7">
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-ink mb-1">
        {label}
        {required && <span className="text-red-text ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-ink-faint mt-1">{hint}</span>}
    </label>
  );
}
