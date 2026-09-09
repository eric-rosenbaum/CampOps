// Paste the notes you typed during the call. Get a reviewed enquiry, never a silent one.
//
// The extraction NEVER creates anything. It fills a form, quotes the sentence each value came
// from, and says out loud what the notes did not answer. Provenance is the whole trick: without
// the source sentence beside each field a reviewer re-opens the email to check the robot's work,
// and the feature has saved nobody anything. With it, the usual outcome is one glance and Create.
import { useMemo, useRef, useState } from 'react';
import { Copy, Check, Loader2, HelpCircle, Sparkles } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import type { Retreat, RetreatContact, RetreatIntakeDraft } from '@/lib/types';
import { draftRetreatFromNotes, dbAddContact } from '@/lib/retreatsDb';
import { generateId, parseDateStr, todayStr } from '@/lib/utils';
import { inputClass, labelClass, GROUP_TYPE_OPTIONS } from './retreatUi';

const now = () => new Date().toISOString();

/** "Fri Oct 10, 2026" — the weekday matters, because a group that meant Saturday will spot it. */
function fmtLong(d: string | null): string {
  if (!d) return '';
  return parseDateStr(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Add days to a calendar day without ever touching UTC. */
function addDays(d: string, days: number): string {
  const dt = parseDateStr(d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

type EditableContact = { name: string; role: string; email: string; phone: string };

interface Props {
  onClose: () => void;
  /** Fired with the new retreat's id once it is created. */
  onCreated?: (retreatId: string) => void;
}

export function IntakePasteModal({ onClose, onCreated }: Props) {
  const { addRetreat, contacts, setContacts } = useRetreatStore();
  const { currentCamp } = useCampStore();

  const [raw, setRaw] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RetreatIntakeDraft | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Editable form (populated from the draft, then owned entirely by the human).
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState('other');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [flexibility, setFlexibility] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [estValue, setEstValue] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [notes, setNotes] = useState('');
  const [people, setPeople] = useState<EditableContact[]>([]);
  const [nextAction, setNextAction] = useState('');
  const [nextActionOn, setNextActionOn] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  /** Whether the draft came from a read. The review step is worded differently when typed. */
  const [fromAI, setFromAI] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  function copy(key: string, text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    }).catch(() => { /* clipboard denied; the text is on screen anyway */ });
  }

  /**
   * Skip the AI and type the enquiry in.
   *
   * The review form was previously unreachable without a successful read — `if (!draft)` returned
   * the paste step — so the error message's advice to "fill the form in by hand" was something
   * the interface could not actually do. An empty draft is a legitimate starting point: every
   * field on the next step is editable anyway, and provenance is simply absent because nothing
   * was inferred.
   */
  function startBlank() {
    setError(null);
    setFromAI(false);
    setDraft({
      groupName: null, groupType: null, contacts: [],
      arrivalDate: null, departureDate: null, dateFlexibility: null,
      headcount: null, mealsWanted: null, spacesMentioned: [],
      specialRequests: null, estimatedValue: null, leadSource: null,
      questions: [], provenance: {}, replyDraft: null,
    });
    setNextAction('Follow up on the enquiry');
    setNextActionOn(addDays(todayStr(), 1));
  }

  async function read() {
    if (!raw.trim()) return;
    setReading(true);
    setError(null);
    let d;
    try {
      d = await draftRetreatFromNotes(raw, currentCamp?.name ?? 'the camp');
    } catch (e) {
      setReading(false);
      setError(e instanceof Error ? e.message : 'The notes could not be read.');
      return;
    }
    setReading(false);
    setFromAI(true);
    setDraft(d);
    setGroupName(d.groupName ?? '');
    setGroupType(d.groupType ?? 'other');
    setArrival(d.arrivalDate ?? '');
    setDeparture(d.departureDate ?? '');
    setFlexibility(d.dateFlexibility ?? '');
    setHeadcount(d.headcount != null ? String(d.headcount) : '');
    setEstValue(d.estimatedValue != null ? String(d.estimatedValue) : '');
    setLeadSource(d.leadSource ?? '');
    setNotes([
      d.specialRequests ? `Special requests: ${d.specialRequests}` : '',
      d.mealsWanted ? `Meals: ${d.mealsWanted}` : '',
      d.spacesMentioned.length ? `Spaces mentioned: ${d.spacesMentioned.join(', ')}` : '',
    ].filter(Boolean).join('\n'));
    setPeople(d.contacts.map((c) => ({
      name: c.name, role: c.role ?? '', email: c.email ?? '', phone: c.phone ?? '',
    })));
    // The open questions ARE the follow-up. Pre-filling the next action means the lead cannot
    // land on the board without one, which is the failure this whole tab exists to prevent.
    setNextAction(d.questions.length ? 'Reply with the open questions' : 'Follow up on the enquiry');
    setNextActionOn(addDays(todayStr(), 1));
  }

  const followUpEmail = useMemo(() => {
    if (!draft) return '';
    if (draft.replyDraft) return draft.replyDraft;
    const to = draft.contacts[0]?.name?.split(' ')[0] ?? 'there';
    return [
      `Hi ${to},`, '',
      `Thanks for getting in touch about ${draft.groupName ?? 'your group'} — it sounds like a good fit for us.`,
      '',
      'Before I put a proposal together, could you let me know:',
      ...draft.questions.map((q) => `  • ${q}`),
      '', 'Happy to talk it through on the phone if that is easier.', '',
      'Best,',
    ].join('\n');
  }, [draft]);

  function create() {
    // Validate here rather than disabling the button. A disabled control with no message is the
    // worst of both: nothing happens, and the reason is a field the user has scrolled past.
    if (!groupName.trim()) {
      setCreateError('Give the group a name before creating the enquiry.');
      nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameRef.current?.focus({ preventScroll: true });
      return;
    }
    const ts = now();
    const id = generateId();
    const primary = people[0];
    const r: Retreat = {
      id,
      campId: '',
      groupName: groupName.trim() || 'Untitled enquiry',
      groupType,
      // An enquiry legitimately has no dates. The check constraint allows null only while the
      // status is 'inquiry', which is exactly what this is.
      arrivalDate: arrival || null,
      departureDate: departure || null,
      headcount: headcount.trim() === '' ? 0 : Number(headcount),
      pricingModel: 'per_person_night',
      ratePerPersonNight: null,
      flatRate: null,
      depositRequired: null,
      depositReceived: null,
      depositDue: null,
      coordinatorName: primary?.name.trim() || null,
      coordinatorEmail: primary?.email.trim() || null,
      coordinatorPhone: primary?.phone.trim() || null,
      status: 'inquiry',
      housingDeadline: null,
      headcountCutoff: null,
      finalHeadcount: null,
      finalHeadcountAt: null,
      finalHeadcountBy: null,
      housingSubmittedAt: null,
      housingSubmittedBy: null,
      dietaryFlags: null,
      notes: notes.trim() || null,
      leadStage: 'new',
      leadSource: leadSource.trim() || null,
      lostReason: null,
      nextAction: nextAction.trim() || null,
      nextActionOn: nextAction.trim() ? (nextActionOn || todayStr()) : null,
      ownerId: null,
      estimatedValue: estValue.trim() === '' ? null : Number(estValue),
      dateFlexibility: flexibility.trim() || null,
      // The raw paste rides along on the record, so provenance survives past this screen: in
      // six weeks "where did 48 come from?" is answerable without hunting for the email.
      intakeNotes: raw.trim() || null,
      portalToken: generateId() + generateId(),
      menuPublished: false,
      changeRequestsEnabled: true,
      feedbackOpens: null,
      createdAt: ts,
      updatedAt: ts,
    };
    addRetreat(r);

    const rows: RetreatContact[] = people
      .filter((p) => p.name.trim())
      .map((p, i) => ({
        id: generateId(), campId: '', retreatId: id,
        name: p.name.trim(),
        role: p.role.trim() || null,
        email: p.email.trim() || null,
        phone: p.phone.trim() || null,
        isPrimary: i === 0,
        notes: null,
        createdAt: ts, updatedAt: ts,
      }));
    if (rows.length) {
      // Optimistic, then realtime delivers the authoritative rows — the same contract every
      // other writer in this module works under.
      setContacts([...contacts, ...rows]);
      rows.forEach((row) => { void dbAddContact(row); });
    }

    onCreated?.(id);
    onClose();
  }

  // ── Paste step ────────────────────────────────────────────────────────────
  if (!draft) {
    return (
      <Modal title="New enquiry" onClose={onClose} width="min(620px, 94vw)">
        <p className="text-[12.5px] text-ink-soft mb-3">
          Paste your notes or the email thread and AI will fill the form in, or skip it and type
          the enquiry yourself.
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={reading ? 6 : 12}
          autoFocus
          disabled={reading}
          className={`${inputClass} font-mono text-[12px] leading-relaxed resize-y
                      ${reading ? 'opacity-60' : ''}`}
          placeholder={'e.g.\n\nCalled about Beth Shalom shabbaton. Rabbi Stein, 914-555-0132.\nAbout 48 people, second weekend in October, arriving Friday afternoon\nleaving Sunday after lunch. All meals, kosher. Wants the lakeside lodge\nfor Saturday sessions. Budget around 12k. Found us through Camp Ramah.'}
        />

        {reading && (
          <div className="mt-3 flex items-center gap-2.5 rounded-card border border-border
                          bg-cream px-4 py-3">
            <Sparkles className="cc-loading-breathe w-4 h-4 flex-none text-sage" aria-hidden="true" />
            <span className="cc-loading-shimmer text-[12.5px] font-semibold text-ink-soft">
              Reading your notes… this takes about half a minute.
            </span>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-card border border-red/30 bg-red-bg px-4 py-3">
            <p className="text-[12.5px] text-red-text">{error}</p>
            <button
              type="button"
              onClick={startBlank}
              className="mt-1.5 text-[12.5px] font-bold text-forest underline"
            >
              Enter it myself instead
            </button>
          </div>
        )}

        <div className="flex flex-wrap justify-between items-center gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={startBlank} disabled={reading}>
              Enter it myself
            </Button>
            <Button onClick={read} disabled={!raw.trim() || reading}>
              {reading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Reading…</>
                : <><Sparkles className="w-4 h-4" /> Read it with AI</>}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Review step ───────────────────────────────────────────────────────────
  const prov = draft.provenance ?? {};
  const datesResolved = Boolean(arrival || departure);

  return (
    <Modal
      title={fromAI ? 'Check this before it becomes an enquiry' : 'New enquiry'}
      onClose={onClose}
      width="min(720px, 94vw)"
    >
      {/* What they didn't tell us — first, because it is the most valuable thing on the screen
          and it is what the follow-up email will be made of. */}
      {draft.questions.length > 0 && (
        <div className="bg-amber-bg border border-amber/30 rounded-card p-4 mb-5">
          <p className="flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-[0.14em] text-amber-text mb-2">
            <HelpCircle className="w-3.5 h-3.5" /> They didn’t tell us
          </p>
          <ul className="space-y-1.5">
            {draft.questions.map((q, i) => (
              <li key={i} className="text-[13px] text-amber-text leading-snug flex gap-2">
                <span className="text-amber">•</span><span>{q}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => copy('email', followUpEmail)}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-text border border-amber/40 rounded-btn px-3 py-1.5 hover:bg-amber/10 transition-colors"
          >
            {copied === 'email' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === 'email' ? 'Copied' : 'Copy as a reply'}
          </button>
        </div>
      )}

      {/* Dates are the dangerous field. A resolved date presented on its own is a guess wearing
          a suit — so it is always shown next to the words they actually used, as a question. */}
      <div className={`rounded-card border p-4 mb-5 ${datesResolved ? 'border-blue/30 bg-blue-bg/60' : 'border-border bg-cream-dark/40'}`}>
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft mb-2">Dates</p>
        {datesResolved ? (
          <p className="text-[14px] text-forest font-semibold leading-snug">
            {fmtLong(arrival) || '?'} – {fmtLong(departure) || '?'}
            <span className="font-normal text-ink-soft"> — is that right?</span>
          </p>
        ) : (
          <p className="text-[14px] text-ink font-semibold">No dates yet.</p>
        )}
        {flexibility && (
          <p className="text-[12.5px] text-ink-soft mt-1 italic">They said: “{flexibility}”</p>
        )}
        {prov.arrivalDate && (
          <p className="text-[11.5px] text-ink-faint mt-1.5 border-l-2 border-border pl-2">“{prov.arrivalDate}”</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className={labelClass}>Arrival</label>
            <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Departure</label>
            <input type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelClass}>Their words about timing</label>
          <input
            value={flexibility} onChange={(e) => setFlexibility(e.target.value)} className={inputClass}
            placeholder="e.g. any weekend in October"
          />
        </div>
      </div>

      {/* Fields ------------------------------------------------------------- */}
      <div className="space-y-4">
        <Field label="Group name *" quote={prov.groupName}>
          <input
            ref={nameRef}
            value={groupName}
            onChange={(e) => { setGroupName(e.target.value); if (createError) setCreateError(null); }}
            className={`${inputClass} ${createError ? 'border-red' : ''}`}
            placeholder="Who is the enquiry from?"
          />
          {createError && <p className="mt-1 text-[12px] text-red-text">{createError}</p>}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Group type" quote={prov.groupType}>
            <select value={groupType} onChange={(e) => setGroupType(e.target.value)} className={inputClass}>
              {GROUP_TYPE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Headcount" quote={prov.headcount}>
            <input
              type="number" min="0" value={headcount} onChange={(e) => setHeadcount(e.target.value)}
              className={inputClass} placeholder="Not stated"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Estimated value" quote={prov.estimatedValue}>
            <input
              type="number" min="0" value={estValue} onChange={(e) => setEstValue(e.target.value)}
              className={inputClass} placeholder="Not stated"
            />
          </Field>
          <Field label="How they found us" quote={prov.leadSource}>
            <input
              value={leadSource} onChange={(e) => setLeadSource(e.target.value)}
              className={inputClass} placeholder="Not stated"
            />
          </Field>
        </div>

        {/* Contacts */}
        <div>
          <label className={labelClass}>People</label>
          {people.length === 0 && (
            <p className="text-[12px] text-ink-faint mb-2">
              {fromAI ? 'Nobody was named in the notes.' : 'Nobody added yet.'}
            </p>
          )}
          <div className="space-y-2">
            {people.map((p, i) => (
              <div key={i} className="border border-border rounded-card p-3 bg-cream-dark/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    value={p.name} placeholder="Name" className={inputClass}
                    onChange={(e) => setPeople((xs) => xs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  />
                  <input
                    value={p.role} placeholder="Role (coordinator, rabbi, treasurer)" className={inputClass}
                    onChange={(e) => setPeople((xs) => xs.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                  />
                  <input
                    value={p.email} placeholder="Email" className={inputClass}
                    onChange={(e) => setPeople((xs) => xs.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                  />
                  <input
                    value={p.phone} placeholder="Phone" className={inputClass}
                    onChange={(e) => setPeople((xs) => xs.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))}
                  />
                </div>
                {(prov[`contacts[${i}].email`] || prov[`contacts[${i}].name`] || prov[`contacts[${i}].phone`]) && (
                  <p className="text-[11px] text-ink-faint mt-2 border-l-2 border-border pl-2">
                    “{prov[`contacts[${i}].email`] ?? prov[`contacts[${i}].name`] ?? prov[`contacts[${i}].phone`]}”
                  </p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-ink-soft">
                    {i === 0 ? 'Primary — becomes the portal coordinator' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPeople((xs) => xs.filter((_, j) => j !== i))}
                    className="text-[11.5px] text-red hover:underline"
                  >Remove</button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPeople((xs) => [...xs, { name: '', role: '', email: '', phone: '' }])}
            className="mt-2 text-[12px] font-semibold text-forest hover:underline"
          >+ Add a person</button>
        </div>

        <Field label="Notes" quote={prov.specialRequests ?? prov.mealsWanted}>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className={`${inputClass} resize-y`} placeholder="Meals, spaces, special requests"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <div>
            <label className={labelClass}>Next action</label>
            <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>On</label>
            <input type="date" value={nextActionOn} onChange={(e) => setNextActionOn(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* The reply draft ---------------------------------------------------- */}
      {draft.replyDraft && (
        <div className="mt-5 border border-border rounded-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-cream-dark/50 border-b border-border">
            <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">
              <Sparkles className="w-3.5 h-3.5" /> Suggested reply
            </p>
            <button
              type="button"
              onClick={() => copy('reply', draft.replyDraft ?? '')}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest hover:underline"
            >
              {copied === 'reply' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === 'reply' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="px-3 py-2.5 text-[12.5px] text-ink whitespace-pre-wrap font-sans leading-relaxed max-h-56 overflow-y-auto">
            {draft.replyDraft}
          </pre>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between gap-2 mt-5 pt-4 border-t border-border">
        <Button variant="ghost" onClick={() => setDraft(null)}>
          {fromAI ? 'Back to the notes' : 'Back'}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={create}>Create enquiry</Button>
        </div>
      </div>
    </Modal>
  );
}

/** A field with the sentence its value was taken from underneath it. That quote is the feature. */
function Field({ label, quote, children }: {
  label: string;
  quote?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {quote && (
        <p className="text-[11.5px] text-ink-faint mt-1 border-l-2 border-border pl-2 leading-snug">
          “{quote}”
        </p>
      )}
    </div>
  );
}
