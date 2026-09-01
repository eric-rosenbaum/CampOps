import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Check, Plus } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import { incidentReportDeadline } from '@/lib/complianceDb';
import type { ComplianceIncident, IncidentKind, IncidentCriterion } from '@/lib/types';

/**
 * Reportable incidents, and whether they were reported in time.
 *
 * 10 NYCRR 7-2.8(d) gives a camp 24 hours from when it knew, and names exactly which injuries and
 * illnesses start that clock. Three things are worse than 24 hours — a rabies exposure, an abuse
 * allegation and a suspected vaccine-preventable disease are reported immediately.
 *
 * The thing this screen does not do is collect names. The medical log with who was hurt belongs
 * to the health director and stays in the health office; what a sanitarian asks for is whether
 * the reportable ones were reported and when, and that is what is here. It also means an ordinary
 * staff member can file at 2am without opening a record full of a child's medical detail.
 */
const KIND_LABEL: Record<IncidentKind, string> = {
  injury: 'Injury',
  illness_outbreak: 'Illness outbreak',
  abuse_allegation: 'Allegation of abuse',
  fire: 'Fire',
  multiple_victim: 'Multiple victim injury',
  rabies_exposure: 'Potential rabies exposure',
  epinephrine: 'Epinephrine administered',
  vaccine_preventable: 'Vaccine-preventable disease',
  water_contamination: 'Water contamination',
  amusement_device: 'Amusement device injury',
  other: 'Other',
};

/** Which form each kind lands on, so the camp is not left hunting for it. */
const KIND_FORM: Partial<Record<IncidentKind, string>> = {
  injury: 'DOH-61a',
  illness_outbreak: 'DOH-61b',
  abuse_allegation: 'NYS-61',
  fire: 'NYS-61 Fire',
  multiple_victim: 'NYS-61h',
  rabies_exposure: 'NYS-61 Rabies',
  epinephrine: 'DOH-61e',
};

export function IncidentsPanel() {
  const { incidents, incidentCriteria, saveIncident, markIncidentReported, authorityForms } =
    useComplianceStore();
  const { currentUser, can } = useAuth();
  const canManage = can('manageSafetyItems');
  const [adding, setAdding] = useState(false);

  const open = useMemo(
    () => incidents.filter((i) => i.reportable && !i.reportedAt),
    [incidents],
  );
  const closed = useMemo(
    () => incidents.filter((i) => !i.reportable || i.reportedAt),
    [incidents],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[14px] font-semibold text-forest">Reportable incidents</h3>
          <p className="text-[11.5px] text-ink-soft mt-0.5">
            Reported within 24 hours of when you knew. Rabies, abuse and vaccine-preventable
            disease are immediate.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Record an incident
          </Button>
        )}
      </div>

      {adding && (
        <IncidentForm
          criteria={incidentCriteria}
          onCancel={() => setAdding(false)}
          onSave={async (patch) => {
            await saveIncident(patch, currentUser.name || null);
            setAdding(false);
          }}
        />
      )}

      {open.length > 0 && (
        <div className="bg-red-bg border border-red rounded-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-red/30">
            <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-red-text">
              On the clock
            </span>
          </div>
          {open.map((i) => (
            <IncidentRow key={i.id} incident={i} criteria={incidentCriteria}
              onReport={canManage ? (to, method) =>
                markIncidentReported(i.id, to, method, currentUser.name || null) : undefined} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="bg-white border border-border rounded-card overflow-hidden">
          {closed.map((i) => (
            <IncidentRow key={i.id} incident={i} criteria={incidentCriteria} />
          ))}
        </div>
      )}

      {incidents.length === 0 && !adding && (
        <div className="bg-white border border-border rounded-card px-5 py-8 text-center">
          <Check className="w-6 h-6 text-sage mx-auto mb-2" />
          <p className="text-[13px] text-ink-soft">Nothing recorded this season.</p>
        </div>
      )}

      <div className="bg-white border border-border rounded-card px-4 py-3">
        <p className="text-[11.5px] text-ink-soft leading-relaxed">
          Forms:{' '}
          {authorityForms.filter((f) => f.isIncidentForm && f.isActive).map((f, idx, all) => (
            <span key={f.id}>
              {f.sourceUrl
                ? <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer"
                     className="font-mono text-[11px] text-sage hover:text-forest">{f.designation}</a>
                : <span className="font-mono text-[11px]">{f.designation}</span>}
              {idx < all.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

/**
 * The wall clock, ticking.
 *
 * A 24-hour deadline that only re-evaluates when something else happens to re-render is a
 * deadline that quietly stays green past midnight. Once a minute is plenty for a day-long clock
 * and keeps the component pure — reading Date.now() straight in render is both impure and, here,
 * wrong.
 */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function IncidentRow({ incident, criteria, onReport }: {
  incident: ComplianceIncident;
  criteria: IncidentCriterion[];
  onReport?: (reportedTo: string, method: string) => Promise<void>;
}) {
  const [reporting, setReporting] = useState(false);
  const now = useNow();
  const due = incident.reportDueAt ? new Date(incident.reportDueAt) : null;
  const overdue = due !== null && !incident.reportedAt && due.getTime() < now;

  return (
    <div className="px-4 py-3 border-b border-cream-dark last:border-b-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-ink">{KIND_LABEL[incident.kind]}</span>
            {KIND_FORM[incident.kind] && (
              <span className="font-mono text-[10.5px] text-ink-faint">
                {KIND_FORM[incident.kind]}
              </span>
            )}
            {incident.reportable && !incident.reportedAt && (
              <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-tag ${
                overdue ? 'bg-red text-white' : 'bg-amber-bg text-amber-text'}`}>
                {overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {overdue ? 'Overdue' : 'Due'} {due?.toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            {incident.reportedAt && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-tag bg-green-muted-bg text-green-muted-text">
                <Check className="w-3 h-3" /> Reported
              </span>
            )}
            {!incident.reportable && (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-tag bg-cream-dark text-ink-soft">
                Logged, not reportable
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-ink-soft mt-1">
            Discovered {new Date(incident.discoveredAt).toLocaleString(undefined,
              { dateStyle: 'medium', timeStyle: 'short' })}
            {incident.subject ? ` · ${incident.subject}` : ''}
          </div>
          {incident.severity.length > 0 && (
            <div className="text-[11px] text-ink-faint mt-1">
              {/* 7-2.8(d)'s own wording. A code like `head_neck_spine` is our storage key, not a
                  thing to show a director reading their own incident log. */}
              {incident.severity
                .map((code) => criteria.find((c) => c.code === code)?.label ?? code)
                .join(' · ')}
            </div>
          )}
          {incident.narrative && (
            <p className="text-[12px] text-ink-soft mt-1.5 leading-relaxed">{incident.narrative}</p>
          )}
          {incident.reportedAt && (
            <div className="text-[11px] text-ink-soft mt-1 font-mono">
              {new Date(incident.reportedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              {incident.reportedTo ? ` → ${incident.reportedTo}` : ''}
              {incident.reportMethod ? ` (${incident.reportMethod})` : ''}
            </div>
          )}
        </div>

        {onReport && !incident.reportedAt && (
          reporting ? (
            <ReportForm onCancel={() => setReporting(false)}
              onSubmit={async (to, method) => { await onReport(to, method); setReporting(false); }} />
          ) : (
            <Button size="sm" onClick={() => setReporting(true)}>Mark reported</Button>
          )
        )}
      </div>
    </div>
  );
}

function ReportForm({ onSubmit, onCancel }: {
  onSubmit: (to: string, method: string) => Promise<void>; onCancel: () => void;
}) {
  const [to, setTo] = useState('Westchester County DOH');
  const [method, setMethod] = useState('telephone');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Reported to"
        className="text-[12.5px] bg-white border border-border rounded-btn px-2.5 py-1.5 w-52" />
      <select value={method} onChange={(e) => setMethod(e.target.value)}
        className="text-[12.5px] bg-white border border-border rounded-btn px-2.5 py-1.5">
        <option value="telephone">Telephone</option>
        <option value="email">Email</option>
        <option value="fax">Fax</option>
        <option value="portal">Portal</option>
        <option value="in_person">In person</option>
      </select>
      <Button size="sm" disabled={busy || !to.trim()}
        onClick={async () => { setBusy(true); try { await onSubmit(to.trim(), method); } finally { setBusy(false); } }}>
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function IncidentForm({ criteria, onSave, onCancel }: {
  criteria: { code: string; label: string; appliesTo: string }[];
  onSave: (p: { kind: IncidentKind; discoveredAt: string; severity: string[];
    subject: ComplianceIncident['subject']; narrative: string | null; formCode: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<IncidentKind>('injury');
  const [subject, setSubject] = useState<ComplianceIncident['subject']>('camper');
  const [severity, setSeverity] = useState<string[]>([]);
  const [narrative, setNarrative] = useState('');
  const [busy, setBusy] = useState(false);

  // Fixed at the moment the form opened, so the deadline shown is the deadline saved.
  const [discoveredAt] = useState(() => new Date().toISOString());
  // Shown live, because the answer changes as boxes are ticked and a camp should see the clock
  // start rather than discover it after saving.
  const verdict = incidentReportDeadline(kind, severity, discoveredAt);

  return (
    <div className="bg-white border border-border rounded-card p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11.5px] font-medium text-ink">What happened</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)}
            className="mt-1 w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2">
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11.5px] font-medium text-ink">Who</span>
          <select value={subject ?? 'camper'}
            onChange={(e) => setSubject(e.target.value as ComplianceIncident['subject'])}
            className="mt-1 w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2">
            <option value="camper">Camper</option>
            <option value="staff">Staff</option>
            <option value="volunteer">Volunteer</option>
            <option value="visitor">Visitor</option>
            <option value="multiple">More than one person</option>
            <option value="none">Nobody hurt</option>
          </select>
        </label>
      </div>

      <div className="mt-3">
        <span className="text-[11.5px] font-medium text-ink">
          Does any of this apply? This is what decides whether it is reportable.
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 mt-1.5">
          {criteria
            .filter((c) => c.appliesTo === 'any' || c.appliesTo === subject)
            .map((c) => (
              <label key={c.code} className="flex items-start gap-2 text-[12.5px] cursor-pointer">
                <input type="checkbox" checked={severity.includes(c.code)}
                  onChange={() => setSeverity((prev) => prev.includes(c.code)
                    ? prev.filter((x) => x !== c.code) : [...prev, c.code])}
                  className="w-3.5 h-3.5 accent-forest flex-shrink-0 mt-0.5" />
                <span className="text-ink-soft">{c.label}</span>
              </label>
            ))}
        </div>
      </div>

      <label className="block mt-3">
        <span className="text-[11.5px] font-medium text-ink">What happened, without names</span>
        <textarea rows={2} value={narrative} onChange={(e) => setNarrative(e.target.value)}
          placeholder="Fell from the low ropes element, taken to hospital for observation."
          className="mt-1 w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 resize-y leading-relaxed" />
      </label>

      <div className={`mt-3 px-3 py-2 rounded-btn text-[12px] leading-relaxed ${
        verdict.reportable ? 'bg-amber-bg text-amber-text' : 'bg-cream-dark text-ink-soft'}`}>
        {verdict.reportable
          ? verdict.immediate
            ? 'Reportable immediately to your permit-issuing official.'
            : 'Reportable within 24 hours of now.'
          : 'Not reportable on what you have ticked. It is still logged.'}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Button size="sm" disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                kind, discoveredAt, severity, subject,
                narrative: narrative.trim() || null,
                formCode: KIND_FORM[kind] ?? null,
              });
            } finally { setBusy(false); }
          }}>
          Record it
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
