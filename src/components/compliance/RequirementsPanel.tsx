import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useComplianceStore } from '@/store/complianceStore';
import { RequirementList } from './RequirementList';
import type { ComplianceRequirement, ComplianceStatus, RequirementStatus } from '@/lib/types';

/**
 * Everything this camp owes, from every party.
 *
 * Deliberately a wider set than the one the header percentage is computed over. That number
 * counts obligations printed on a document we are currently showing, because a percentage has to
 * be computed over a set that does not move underneath it. But a compliance home base cannot list
 * only paperwork: the county's annual workshop is on no form and missing it means the permit is
 * denied, two written references per employee appear on nothing, and the AED agreement is a
 * county code duty with no document behind it.
 *
 * The hard part is that this is a hundred and fifty-nine rules and only seventeen of them are
 * printed on a form. The rest is the regulation itself. A flat list treats a reference corpus like
 * a to-do list, which is how a page ends up endless and useless at the same time.
 *
 * The organising question is not "can we track it" — that is a fact about our software — but
 * *when does a director deal with this*, which is how the year actually feels from inside a camp:
 *
 *   Before you open   annual, once, per session, seasonal. The pre-season push.
 *   While you run     daily, weekly, monthly. The operating rhythm, kept in logs.
 *   If it happens     on event, ongoing. Procedures, not tasks — nothing to do today.
 *   Checked on site   inspection and roster rules. No artifact exists to file, so these are never
 *                     counted against the camp; a sanitarian confirms them by walking the property.
 *
 * "Outstanding only" is on by default, which turns a hundred and fifty-nine rules into the handful
 * actually waiting on someone. Turning it off gives back the whole regulation as reference.
 *
 * Search cuts across every band, because someone who half-remembers a rule does not know which
 * band it is in.
 *
 * No manual memoization here on purpose — the React Compiler handles it, and hand-written
 * useMemo over a zustand store object is the shape that breaks it.
 */

/**
 * Evidence types with no artifact behind them.
 *
 * `inspection` is checked by eye on the property; `roster` is a structural fact about how the camp
 * is staffed. Neither produces a document a camp could file, so neither belongs in a list of
 * things to go and do.
 */
const ON_SITE_EVIDENCE = ['inspection', 'roster'];

/** When a director deals with it. Anything unrecognised falls to "Before you open". */
const WHEN: { id: string; title: string; note: string; frequencies: string[] }[] = [
  { id: 'preopen', title: 'Before you open',
    note: 'The pre-season push. Dated, and mostly what the county wants in the envelope.',
    frequencies: ['annual', 'once', 'per_session', 'seasonal'] },
  { id: 'running', title: 'While you run',
    note: 'The operating rhythm. Kept in logs through the season.',
    frequencies: ['daily', 'weekly', 'monthly'] },
  { id: 'ifhappens', title: 'If it happens',
    note: 'Procedures rather than tasks. Nothing to do today, but you are held to them.',
    frequencies: ['on_event', 'ongoing'] },
];

const CATEGORY_LABEL: Record<string, string> = {
  facility: 'Facility', personnel: 'People', supervision: 'Supervision',
  recreation: 'Activities', water: 'Water', medical: 'Medical', permit: 'Permit',
  records: 'Records', fire: 'Fire safety', plan: 'Written plan', training: 'Training',
  transportation: 'Transport', sewage: 'Sewage', food: 'Food service',
};

export function RequirementsPanel({ onOpenForm }: { onOpenForm?: (formCode: string) => void }) {
  const requirements = useComplianceStore((s) => s.requirements);
  const statuses = useComplianceStore((s) => s.statuses);
  const enabledProfileIds = useComplianceStore((s) => s.enabledProfileIds);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [outstandingOnly, setOutstandingOnly] = useState(true);
  const [openBand, setOpenBand] = useState<Record<string, boolean>>({ preopen: true });

  const byRequirement = new Map<string, RequirementStatus>(
    statuses.map((s) => [s.requirementId, s]),
  );
  const statusOf = (r: ComplianceRequirement): ComplianceStatus | undefined =>
    byRequirement.get(r.id)?.status;

  const enabled = new Set(enabledProfileIds);
  const all = requirements
    .filter((r) => enabled.has(r.profileId) && statusOf(r) !== 'not_applicable')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const q = query.trim().toLowerCase();
  const matches = (r: ComplianceRequirement) => {
    if (category && r.category !== category) return false;
    if (!q) return true;
    return `${r.label} ${r.summary ?? ''} ${r.citation ?? ''} ${r.reqCode}`.toLowerCase().includes(q);
  };

  const onSite = (r: ComplianceRequirement) => ON_SITE_EVIDENCE.includes(r.evidenceType);
  const done = (r: ComplianceRequirement) => statusOf(r) === 'satisfied';

  // "Outstanding" never hides an on-site rule: there is no artifact to put on record, so
  // filtering them by status would quietly delete the half of the regulation a sanitarian
  // actually walks through.
  const shown = all.filter(matches)
    .filter((r) => !outstandingOnly || onSite(r) || !done(r));

  const bandOf = (r: ComplianceRequirement) => {
    if (onSite(r)) return 'onsite';
    return WHEN.find((w) => w.frequencies.includes(r.frequency ?? ''))?.id ?? 'preopen';
  };

  const bands = [
    ...WHEN.map((w) => ({ ...w, items: shown.filter((r) => bandOf(r) === w.id) })),
    {
      id: 'onsite',
      title: 'Checked on site',
      note: 'No document proves these. A sanitarian confirms them by walking the property, so they are never counted against you.',
      items: shown.filter(onSite),
    },
  ];

  // Categories present in the unfiltered set, so the chips do not vanish as you filter by them.
  const categories = [...new Set(all.map((r) => r.category))]
    .sort((a, b) => (CATEGORY_LABEL[a] ?? a).localeCompare(CATEGORY_LABEL[b] ?? b));

  return (
    <div>
      <div className="flex gap-2 flex-wrap items-center mb-3">
        <div className="relative flex-1 min-w-[13rem]">
          <Search className="w-3.5 h-3.5 text-ink-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all your obligations"
            className="w-full rounded-input border border-border pl-8 pr-2.5 py-1.5 text-[12.5px]
                       focus:border-sage focus:outline-none"
          />
        </div>
        <Chip on={outstandingOnly} onClick={() => setOutstandingOnly((v) => !v)}>
          Outstanding only
        </Chip>
        <span className="font-mono text-[11.5px] text-ink-soft whitespace-nowrap">
          {shown.length} of {all.length}
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        <Chip on={category === null} onClick={() => setCategory(null)}>Everything</Chip>
        {categories.map((c) => (
          <Chip key={c} on={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {CATEGORY_LABEL[c] ?? c}
            <span className={`ml-1.5 font-mono ${category === c ? 'text-side' : 'text-ink-faint'}`}>
              {all.filter((r) => r.category === c).length}
            </span>
          </Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-[13px] text-ink-faint italic py-8 text-center">
          Nothing matches that.
        </p>
      ) : (
        <div className="space-y-3">
          {bands.filter((b) => b.items.length > 0).map((band) => {
            // Searching opens everything: a hit hidden inside a collapsed band reads as no hit.
            const open = q.length > 0 || openBand[band.id];
            return (
              <section key={band.id} className="bg-white border border-border rounded-card overflow-hidden">
                <button
                  onClick={() => setOpenBand((s) => ({ ...s, [band.id]: !open }))}
                  aria-expanded={open}
                  className="w-full px-4 py-3 flex items-start gap-2.5 text-left hover:bg-paper-raised transition-colors"
                >
                  <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 text-ink-soft transition-transform ${
                    open ? 'rotate-90' : ''}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="text-[13.5px] font-semibold text-forest">{band.title}</h3>
                      <span className="font-mono text-[11px] text-ink-soft">{band.items.length}</span>
                    </div>
                    <p className="text-[11.5px] text-ink-soft mt-0.5 leading-relaxed max-w-[76ch]">
                      {band.note}
                    </p>
                  </div>
                </button>
                {open && (
                  <div className="px-3 pb-3">
                    <RequirementList requirements={band.items} onOpenForm={onOpenForm} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`px-2.5 py-1 rounded-pill text-[11.5px] font-semibold border transition-colors ${
        on ? 'bg-forest text-white border-forest'
           : 'bg-white text-ink-soft border-border hover:border-sage'}`}>
      {children}
    </button>
  );
}
