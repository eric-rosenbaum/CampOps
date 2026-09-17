import { useEffect, useState } from 'react';
import { Check, Copy, Mail, Pencil, QrCode as QrIcon, RefreshCw, Printer } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Modal } from '@/components/shared/Modal';
import { QrCode } from '@/components/qr/QrPreview';
import { qrToSvg } from '@/lib/qr';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { FoodProgram } from '@/lib/foodRequestTypes';
import { dbRotateFoodProgramLink, dbSaveFoodProgram, dbSaveFoodRequestSettings } from '@/lib/foodRequestsDb';
import { formatNoticeRule } from '@/lib/foodRequests';
import { PROGRAM_COLORS, ProgramDot, foodRequestUrl, nextProgramColor } from './foodUi';

/** A ready-to-send email to a program's lead with their link, so the link actually reaches them. */
function leadMailto(p: FoodProgram, campName: string): string {
  const url = foodRequestUrl(p.requestToken);
  const subject = `${p.name}: how to ask the kitchen for food`;
  const body = `Hi ${p.leadName?.split(' ')[0] ?? 'there'},\n\nThis is ${p.name}'s link for asking the ${campName || 'camp'} kitchen for food. `
    + `No account needed. Share it with your counselors, or print the QR code:\n\n${url}\n\n`
    + `Send requests with enough notice, pick a pickup time, and you'll get an email when the kitchen approves it and when it's ready.\n\nThanks!`;
  return `mailto:${encodeURIComponent(p.leadEmail ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const input = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const label = 'block text-secondary font-medium text-ink mb-1';

/**
 * Kitchen Manager › Settings › Food requests: the programs that can ask, their no-login links,
 * and the kitchen's rules (notice, who gets told, where pickups happen).
 */
export function FoodProgramsSettings() {
  const programs = useCommissaryStore((s) => s.foodPrograms);
  const settings = useCommissaryStore((s) => s.foodRequestSettings);
  const camp = useCampStore((s) => s.currentCamp);
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const [editing, setEditing] = useState<FoodProgram | 'new' | null>(null);
  const [qrFor, setQrFor] = useState<FoodProgram | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copy(p: FoodProgram) {
    try {
      await navigator.clipboard.writeText(foodRequestUrl(p.requestToken));
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { setQrFor(p); }
  }

  return (
    <section data-testid="food-programs-settings">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-forest">Programs &amp; request links</h2>
          <p className="text-[12px] text-ink-soft">Programs ask the kitchen for food through their own link. No account needed.</p>
        </div>
        {canManage && <Button size="sm" className="flex-shrink-0 whitespace-nowrap" onClick={() => setEditing('new')}>+ Program</Button>}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-white">
        {programs.length === 0 && (
          <p className="px-4 py-5 text-center text-[13px] text-ink-faint">
            No programs yet. Add one (Cooking Club, Canoe trips…) to get a link its lead can share with counselors.
          </p>
        )}
        {programs.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-0" data-testid="food-program-row">
            <ProgramDot color={p.color} />
            <div className="min-w-0 flex-1 basis-40">
              <p className="flex items-center gap-2 truncate text-[13px] font-medium text-forest">
                {p.name}
                {!p.active && <span className="rounded-pill border border-border bg-cream-dark px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">Link off</span>}
              </p>
              <p className="truncate text-[11px] text-ink-faint">{[p.leadName, p.leadEmail].filter(Boolean).join(' · ') || 'No lead set'}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" disabled={!p.active} onClick={() => copy(p)}>
                {copiedId === p.id ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
              </Button>
              <Button size="sm" variant="ghost" disabled={!p.active} onClick={() => setQrFor(p)} aria-label={`QR code for ${p.name}`}>
                <QrIcon className="h-3.5 w-3.5" /> QR
              </Button>
              {p.leadEmail && p.active && (
                <a href={leadMailto(p, camp?.name ?? '')} data-testid="email-lead"
                  className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-forest hover:border-sage">
                  <Mail className="h-3.5 w-3.5" /> Email the link to {p.leadName?.split(' ')[0] ?? 'the lead'}
                </a>
              )}
              {canManage && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {camp && <KitchenRules campId={camp.id} canManage={canManage}
        cutoffHours={settings?.cutoffHours ?? 72} kitchenEmails={(settings?.kitchenEmails ?? []).join(', ')} pickupLocation={settings?.pickupLocation ?? ''} />}

      {editing && camp && <ProgramModal campId={camp.id} program={editing === 'new' ? null : editing}
        defaultColor={nextProgramColor(programs.map((p) => p.color))} onClose={() => setEditing(null)} />}
      {qrFor && <QrModal program={programs.find((p) => p.id === qrFor.id) ?? qrFor} campName={camp?.name ?? ''} canManage={canManage} onClose={() => setQrFor(null)} />}
    </section>
  );
}

function KitchenRules({ campId, canManage, cutoffHours, kitchenEmails, pickupLocation }: {
  campId: string; canManage: boolean; cutoffHours: number;
  /** Joined, so the effect below compares a string and not a fresh array every render. */
  kitchenEmails: string; pickupLocation: string;
}) {
  const [cutoff, setCutoff] = useState(String(cutoffHours));
  const [emails, setEmails] = useState(kitchenEmails);
  const [location, setLocation] = useState(pickupLocation);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  // A realtime reload of the saved row is the new baseline for the form.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync the form to the row the server now holds
    setCutoff(String(cutoffHours)); setEmails(kitchenEmails); setLocation(pickupLocation);
  }, [cutoffHours, kitchenEmails, pickupLocation]);

  async function save() {
    setError(null);
    const hours = Number(cutoff);
    if (!Number.isFinite(hours) || hours < 0 || hours > 720) { setError('Notice must be between 0 and 720 hours.'); return; }
    setState('saving');
    const err = await dbSaveFoodRequestSettings(campId, {
      cutoffHours: hours,
      kitchenEmails: emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
      pickupLocation: location,
    });
    if (err) { setError(err); setState('idle'); return; }
    setState('saved');
    setTimeout(() => setState('idle'), 2000);
  }

  return (
    <div className="mt-3 rounded-card border border-border bg-white px-4 py-4">
      <p className="mb-3 text-[13px] font-semibold text-forest">Kitchen rules</p>
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <div>
          <label className={label} htmlFor="food-cutoff">Notice needed (hours)</label>
          <input id="food-cutoff" className={input} inputMode="numeric" disabled={!canManage} value={cutoff}
            onChange={(e) => setCutoff(e.target.value.replace(/[^0-9.]/g, ''))} />
        </div>
        <div>
          <label className={label} htmlFor="food-location">Pickup location</label>
          <input id="food-location" className={input} disabled={!canManage} value={location} maxLength={200}
            placeholder="e.g. the kitchen back door" onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>
      <div className="mt-3">
        <label className={label} htmlFor="food-emails">Email new requests to</label>
        <input id="food-emails" className={input} disabled={!canManage} value={emails}
          placeholder="e.g. kitchen@yourcamp.org, chef@yourcamp.org" onChange={(e) => setEmails(e.target.value)} />
        <p className="mt-1 text-[11px] text-ink-faint">Separate addresses with commas. Left empty, the camp&rsquo;s first admin is told.</p>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">
        {Number(cutoff) > 0 ? <>Counselors are told the kitchen needs {formatNoticeRule(Number(cutoff))}. </> : null}
        A request with less is still accepted: it shows as Short notice for you, and the requester is warned before sending.
      </p>
      {error && <p role="alert" className="mt-2 text-[12px] text-red-text">{error}</p>}
      {canManage && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" disabled={state === 'saving'} onClick={save}>
            {state === 'saving' ? 'Saving…' : state === 'saved' ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save kitchen rules'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ProgramModal({ campId, program, defaultColor, onClose }: { campId: string; program: FoodProgram | null; defaultColor: string; onClose: () => void }) {
  const [name, setName] = useState(program?.name ?? '');
  const [leadName, setLeadName] = useState(program?.leadName ?? '');
  const [leadEmail, setLeadEmail] = useState(program?.leadEmail ?? '');
  const [leadPhone, setLeadPhone] = useState(program?.leadPhone ?? '');
  const [color, setColor] = useState<string | null>(program ? program.color : defaultColor);
  const [active, setActive] = useState(program?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const { error: err } = await dbSaveFoodProgram(campId, { id: program?.id ?? null, name, leadName, leadEmail, leadPhone, color, active });
    setSaving(false);
    if (err) { setError(err); return; }
    onClose();
  }

  return (
    <Modal title={program ? `Edit ${program.name}` : 'New program'} onClose={onClose} width="min(460px, calc(100vw - 24px))"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !name.trim()} onClick={save}>{saving ? 'Saving…' : 'Save program'}</Button>
        </div>
      )}>
      <div className="space-y-3">
        <div>
          <label className={label} htmlFor="prog-name">Name</label>
          <input id="prog-name" className={input} value={name} maxLength={80} placeholder="e.g. Cooking Club" autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="prog-lead">Lead</label>
            <input id="prog-lead" className={input} value={leadName} maxLength={120} placeholder="e.g. Robin Chen" onChange={(e) => setLeadName(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="prog-phone">Lead phone</label>
            <input id="prog-phone" className={input} value={leadPhone} maxLength={40} placeholder="e.g. 416-555-0100" onChange={(e) => setLeadPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="prog-email">Lead email</label>
          <input id="prog-email" className={input} type="email" value={leadEmail} maxLength={200} placeholder="e.g. robin@yourcamp.org" onChange={(e) => setLeadEmail(e.target.value)} />
        </div>
        <div>
          <p className={label}>Colour</p>
          <div className="flex flex-wrap gap-2">
            {PROGRAM_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c}
                className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
          <input type="checkbox" className="mt-0.5" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Link is on<span className="block text-[11.5px] text-ink-soft">Turn it off at the end of the season; past requests are kept.</span></span>
        </label>
        {error && <p role="alert" className="text-[12px] text-red-text">{error}</p>}
      </div>
    </Modal>
  );
}

function QrModal({ program, campName, canManage, onClose }: { program: FoodProgram; campName: string; canManage: boolean; onClose: () => void }) {
  const url = foodRequestUrl(program.requestToken);
  const [rotating, setRotating] = useState(false);

  function print() {
    const svg = qrToSvg(url);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const w = window.open('', '_blank');
    if (!w) { alert('Enable pop-ups to print the QR code.'); return; }
    w.document.write(`<!doctype html><html><head><title>${esc(program.name)} · food requests</title>
      <style>body{font-family:-apple-system,Segoe UI,sans-serif;text-align:center;color:#1D3A2E;padding:48px}
      h1{font-size:30px;margin:0} p{font-size:17px;color:#6B6357} .qr{width:360px;margin:28px auto}
      .url{font-family:ui-monospace,monospace;font-size:13px;word-break:break-all}</style></head>
      <body><p>${esc(campName)} · Kitchen</p><h1>Need food for ${esc(program.name)}?</h1>
      <p>Scan to ask the kitchen. No account needed.</p><div class="qr">${svg}</div><p class="url">${esc(url)}</p></body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  async function rotate() {
    if (!confirm(`Replace ${program.name}'s link? The old link and any printed QR codes stop working.`)) return;
    setRotating(true);
    const { error } = await dbRotateFoodProgramLink(program.id);
    setRotating(false);
    if (error) alert(error);
  }

  return (
    <Modal title={`${program.name} · request link`} onClose={onClose} width="min(420px, calc(100vw - 24px))"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          {canManage && (
            <Button variant="ghost" size="sm" className="mr-auto" disabled={rotating} onClick={rotate}>
              <RefreshCw className="h-3.5 w-3.5" /> {rotating ? 'Replacing…' : 'Replace link'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={print}><Printer className="h-3.5 w-3.5" /> Print</Button>
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      )}>
      <div className="text-center">
        <QrCode text={url} className="mx-auto w-56 max-w-full" />
        <a href={url} target="_blank" rel="noreferrer" data-testid="food-program-link"
          className="mt-3 block break-all font-mono text-[12px] text-forest underline underline-offset-2">{url}</a>
        <p className="mt-2 text-[12px] text-ink-soft">Anyone with this link can ask the kitchen for food for {program.name}. They see item names, never stock or prices.</p>
      </div>
    </Modal>
  );
}
