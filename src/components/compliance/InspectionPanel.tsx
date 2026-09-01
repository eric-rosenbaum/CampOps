import { Printer } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useCampStore } from '@/store/campStore';
import { todayStr } from '@/lib/utils';
import type { ComplianceRequirement, ComplianceStatus } from '@/lib/types';

/**
 * A rehearsal for the visit, not another list of everything.
 *
 * The camp is inspected twice a year, at least once before it opens, and the thing that decides
 * the outcome is not the envelope that went to the county in April — it is whether the person
 * standing in the office can produce what is asked for. That is the whole job of this screen: the
 * night before, walk it top to bottom and find out what you cannot put your hands on.
 *
 * Two consequences follow, and both were wrong before.
 *
 * The permit package is excluded. Twelve Westchester requirements are things you post to the
 * county in the spring — the application, the $200 cheque, the notarised resolution — and a
 * sanitarian on your property asks for none of them. They rendered here twelve times over with
 * the identical line "Submit with the permit package", which was noise and was also false in this
 * context.
 *
 * And nothing here claims the camp passes. Each row says what is on record and what is not, which
 * is what makes it useful the night before rather than reassuring and wrong.
 */
type Group = { key: string; title: string; hint: string; categories: string[] };

const GROUPS: Group[] = [
  { key: 'staff', title: 'Staff files', hint: 'Asked for first, and the longest to produce.',
    categories: ['personnel', 'training'] },
  { key: 'plan', title: 'The written plan', hint: 'Approved copy, on site.',
    categories: ['plan'] },
  { key: 'logs', title: 'Logs and records', hint: 'Kept current through the season.',
    categories: ['records', 'medical', 'water', 'fire', 'sewage', 'food'] },
  { key: 'posted', title: 'Posted and on the property', hint: 'Checked by eye.',
    categories: ['permit', 'facility', 'supervision', 'recreation', 'transportation'] },
];

export function InspectionPanel() {
  const requirements = useComplianceStore((s) => s.requirements);
  const enabledProfileIds = useComplianceStore((s) => s.enabledProfileIds);
  const statusFor = useComplianceStore((s) => s.statusFor);
  const staff = useSafetyStore((s) => s.staff);
  const certs = useSafetyStore((s) => s.certifications);
  const camp = useCampStore((s) => s.currentCamp);

  const today = todayStr();
  const enabled = new Set(enabledProfileIds);
  // Two exclusions, both about what the visit actually is.
  //
  // The permit package went to the county in the spring and is not produced on the property.
  //
  // `on_event` rules fire when something happens -- get plans approved before you build a pool,
  // file a new application when the operator changes. They are real duties and they belong on the
  // Requirements page, but a sanitarian standing in your office is not asking whether you would
  // notify them before building a beach you have no plans to build.
  const onSite = requirements.filter((r) =>
    enabled.has(r.profileId)
    && !r.inPermitPackage
    && r.frequency !== 'on_event'
    && statusFor(r.id)?.status !== 'not_applicable');

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: onSite
      .filter((r) => g.categories.includes(r.category))
      .map((r) => ({ requirement: r, status: statusFor(r.id)?.status }))
      .sort((a, b) => rank(a.status) - rank(b.status) || a.requirement.sortOrder - b.requirement.sortOrder),
  })).filter((g) => g.items.length > 0);

  const activeStaff = staff.filter((m) => m.isActive).length;
  const withCerts = new Set(certs.map((c) => c.staffId)).size;
  const expiredCerts = certs.filter((c) => c.expiryDate && c.expiryDate < today).length;
  const notOnRecord = grouped.reduce(
    (n, g) => n + g.items.filter((i) => i.status !== 'satisfied').length, 0);

  return (
    <div>
      <div className="bg-forest text-white rounded-card px-5 py-4 mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-white">Walk it before they do</h2>
          <p className="text-[12px] text-side mt-1 leading-relaxed max-w-[70ch]">
            Twice a year, at least once before you open. Everything below is something a sanitarian
            can ask to see on the property. Your permit application is not — that is the Hand-off tab.
          </p>
        </div>
        <Button size="sm" variant="ghost" className="bg-white border-white flex-shrink-0"
          onClick={() => printSheet(camp?.name ?? 'Camp', grouped)}>
          <Printer className="w-3.5 h-3.5" /> Print the walkthrough
        </Button>
      </div>

      <div className="bg-white border border-border rounded-card px-4 py-3 mb-4">
        <div className="flex gap-7 flex-wrap text-[12.5px]">
          <span><strong className="font-mono">{activeStaff}</strong> active staff</span>
          <span><strong className="font-mono">{withCerts}</strong> with certifications on file</span>
          {expiredCerts > 0 && (
            <span className="text-red-text font-semibold">
              <span className="font-mono">{expiredCerts}</span> expired certification
              {expiredCerts === 1 ? '' : 's'}
            </span>
          )}
          <span className={notOnRecord > 0 ? 'text-amber-text font-semibold' : 'text-green-muted-text font-semibold'}>
            <span className="font-mono">{notOnRecord}</span> you could not produce today
          </span>
        </div>
      </div>

      {/* One column per group, laid out as masonry so a short group does not leave a hole beside
          a long one. `columns` keeps each card whole with break-inside: avoid. */}
      <div className="lg:columns-2 lg:gap-4 space-y-4">
        {grouped.map((g) => (
          <div key={g.key}
            className="bg-white border border-border rounded-card overflow-hidden break-inside-avoid mb-4">
            <div className="px-4 py-2.5 border-b border-cream-dark">
              <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-soft">
                {g.title}
              </span>
              <span className="text-[11px] text-ink-faint ml-2">{g.hint}</span>
            </div>
            <div>
              {g.items.map(({ requirement, status }) => (
                <div key={requirement.id}
                  className="px-4 py-2.5 border-b border-cream-dark last:border-b-0 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-ink leading-snug">
                      {requirement.label}
                    </div>
                    {requirement.evidenceHint && (
                      <div className="text-[11px] text-ink-soft mt-0.5 leading-snug">
                        {requirement.evidenceHint}
                      </div>
                    )}
                  </div>
                  <StatusChip status={status} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Missing first: the point of this screen is what you cannot produce. */
function rank(s: ComplianceStatus | undefined): number {
  switch (s) {
    case 'missing': return 0;
    case 'needs_answer': return 1;
    case 'partial': return 2;
    case 'expiring': return 3;
    case 'satisfied': return 4;
    default: return 5;
  }
}

const CHIP: Record<string, [string, string]> = {
  satisfied: ['On record', 'bg-green-muted-bg text-green-muted-text'],
  expiring: ['Expiring', 'bg-amber-bg text-amber-text'],
  partial: ['Partly', 'bg-amber-bg text-amber-text'],
  missing: ['Not on record', 'bg-red-bg text-red-text'],
  needs_answer: ['Needs an answer', 'bg-amber-bg text-amber-text'],
};

function StatusChip({ status }: { status: ComplianceStatus | undefined }) {
  const [label, cls] = CHIP[status ?? 'missing'] ?? CHIP.missing;
  return (
    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-tag whitespace-nowrap flex-shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

/**
 * Print a walkthrough sheet, not the screen.
 *
 * `window.print()` on the app printed the sidebar, the tab bar and a cropped heading, because the
 * page was never laid out for paper. This builds the document instead — the same approach the
 * safety report uses — so what comes out is a clipboard sheet with a tick box against every line.
 */
function printSheet(
  campName: string,
  groups: { title: string; items: { requirement: ComplianceRequirement; status: ComplianceStatus | undefined }[] }[],
) {
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const rows = (items: { requirement: ComplianceRequirement; status: ComplianceStatus | undefined }[]) =>
    items.map(({ requirement, status }) => `
      <tr>
        <td class="box"></td>
        <td>
          <div class="label">${esc(requirement.label)}</div>
          ${requirement.evidenceHint ? `<div class="hint">${esc(requirement.evidenceHint)}</div>` : ''}
        </td>
        <td class="status ${status === 'satisfied' ? 'ok' : 'gap'}">
          ${status === 'satisfied' ? 'On record' : 'Not on record'}
        </td>
      </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${esc(campName)} — inspection walkthrough</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,'Times New Roman',serif;font-size:11px;color:#1a2e1a;padding:28px}
  h1{font-size:19px;margin-bottom:2px}
  .sub{font-size:11px;color:#666;margin-bottom:22px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:20px 0 6px;
     padding-bottom:4px;border-bottom:1.5px solid #1a2e1a}
  table{width:100%;border-collapse:collapse}
  td{padding:5px 6px;border-bottom:1px solid #eee;vertical-align:top}
  .box{width:16px}
  .box:after{content:'';display:block;width:11px;height:11px;border:1.2px solid #444;margin-top:2px}
  .label{font-weight:700}
  .hint{color:#666;font-size:10px;margin-top:1px}
  .status{width:108px;white-space:nowrap;text-align:right;font-size:10px;font-family:monospace}
  .status.gap{color:#a33}
  .status.ok{color:#4a6741}
  section{break-inside:avoid}
  @page{margin:1.2cm}
</style></head>
<body>
  <h1>${esc(campName)}</h1>
  <p class="sub">Inspection walkthrough &middot; ${new Date().toLocaleDateString()} &middot;
     tick each item you can physically produce</p>
  ${groups.map((g) => `<section><h2>${esc(g.title)}</h2><table>${rows(g.items)}</table></section>`).join('')}
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
