import { useState } from 'react';
import { Download, FileText, Loader2, AlertTriangle, FolderDown } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore, type AuthoritySummary } from '@/store/complianceStore';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAuth } from '@/lib/auth';
import { dbRecordComplianceExport } from '@/lib/complianceDb';
import { NY_FORMS, generateForm, coverage, type PacketCamp, type PacketForm } from '@/lib/compliance/nyPacket';
import {
  exportCompliancePacket, type ExportStatus, type EvidenceFailure,
} from '@/lib/compliance/exportPacket';

/**
 * Blank forms to download, and the same forms filled with the camp's data.
 *
 * Two things a camp wants that are genuinely different: "give me the paperwork I have to file"
 * and "fill it in for me". Both live here, and the second one states honestly how much of each
 * form it could populate, because handing someone a form that looks finished but is half empty
 * is worse than handing them a blank.
 */
/**
 * What is left to do by hand on each form, named rather than implied.
 *
 * A bare "N% auto-filled" reads as a grade on the product. It is more useful to say which part
 * of the form we filled and which part nobody has the data for, so a director knows what they
 * are sitting down to complete.
 */
const FORM_GAP: Record<string, string> = {
  'DOH-367': 'Filled: camp description, dates and activity list. By hand: the per-session camper table and every staff qualification, which the platform does not hold.',
  'DOH-367a': 'By hand: staff names, dates of birth, education and certification dates. The platform does not hold staff records at this depth.',
  'DOH-2040': 'Filled from your written plan: the page number and Yes box for every section you have completed. Complete more sections and this fills itself.',
  'DOH-2271': 'By hand: the director\u2019s own certified statement. This one is a personal attestation and is not ours to pre-answer.',
  'DOH-2286': 'By hand: every question about your pool and beach safety plan, which is a separate document from your camp safety plan and is not tracked here yet.',
};

export function FormsPanel() {
  const {
    planSections, campId, seasonId, requirements, enabledProfileIds,
    documents, statusFor, enabledProfiles, openDocument, answers,
    activeAuthorities, formsForAuthority, planRowKeys,
  } = useComplianceStore();
  const { currentCamp } = useCampStore();
  const season = useChecklistStore((s) => s.season);
  const safetyStaff = useSafetyStore((s) => s.staff);
  const authorities = activeAuthorities();
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportStatus | null>(null);
  const [failures, setFailures] = useState<EvidenceFailure[]>([]);

  // The forms ask for these three by name, and the safety roster already has them. Matched on
  // title rather than a dedicated field, so a camp that has not filled its roster simply leaves
  // the line blank for a person to write in, which is the correct outcome.
  const byTitle = (re: RegExp) =>
    safetyStaff.find((m) => m.isActive && re.test(m.title))?.name;

  const camp: PacketCamp = {
    campName: currentCamp?.name ?? 'Camp',
    county: 'Westchester',
    address: [currentCamp?.addressLine1, currentCamp?.city, currentCamp?.state]
      .filter(Boolean).join(', '),
    town: currentCamp?.city ?? undefined,
    directorName: byTitle(/^camp director$|^director$/i),
    healthDirectorName: byTitle(/health director/i),
    aquaticsDirectorName: byTitle(/aquatics? director/i),
    openDate: season?.openingDate,
    closeDate: season?.closingDate,
  };

  async function download(form: PacketForm, filled: boolean) {
    setBusy(`${form.code}-${filled}`);
    setError(null);
    try {
      let blob: Blob;
      let name: string;
      if (filled) {
        const bytes = await generateForm(form, camp, planSections, answers, planRowKeys());
        blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
        name = `${form.file}-${(camp.campName || 'camp').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
      } else {
        const res = await fetch(`/forms/ny/${form.file}.pdf`);
        blob = await res.blob();
        name = `${form.file}-blank.pdf`;
      }
      save(blob, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate that form.');
    } finally {
      setBusy(null);
    }
  }

  // A blob URL opened via a click is the only download path that works in every browser
  // without a server round-trip.
  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * Everything at once: the forms, the files behind them, and the index that ties the two
   * together. Built here rather than server-side because the evidence is already readable by
   * this user through signed URLs, and nothing has to be stored again to hand it over.
   */
  /**
   * One party's packet.
   *
   * Passing an authority filters the requirements, the evidence index and the forms down to
   * what that party actually asked for. The fire department gets the fire safety plan, not
   * three hundred pages of county paperwork, which is the point of organising any of this by
   * reviewer.
   */
  async function downloadPacket(authority?: AuthoritySummary) {
    setBusy(authority ? `packet-${authority.authority.id}` : 'packet');
    setError(null);
    setFailures([]);
    setProgress({ stage: 'cover', percent: 0, label: 'Building the cover sheet' });
    try {
      const profiles = enabledProfiles();
      const enabled = new Set(enabledProfileIds);
      const scoped = requirements
        .filter((r) => enabled.has(r.profileId))
        .filter((r) => !authority || r.authorityId === authority.authority.id)
        .sort((a, b) => a.reqCode.localeCompare(b.reqCode));

      // Only the forms this party issues. A party with none gets a packet of records and the
      // written plan, which is the whole of what they asked for.
      const scopedForms = authority
        ? NY_FORMS.filter((f) => formsForAuthority(authority.authority.id)
            .some((af) => af.designation === f.code))
        : NY_FORMS;

      // A scoped packet carries only the evidence attached to that party's requirements. The
      // fire department has no business receiving the camp's workers compensation certificate,
      // and sending it anyway is the over-sharing this whole structure exists to prevent. The
      // full packet still includes everything, unlinked files included, because that one is for
      // the camp's own records.
      const scopedIds = new Set(scoped.map((r) => r.id));
      const scopedDocuments = authority
        ? documents.filter((d) => d.requirementIds.some((id) => scopedIds.has(id)))
        : documents;

      const result = await exportCompliancePacket({
        camp,
        seasonName: season?.name ?? null,
        profiles,
        requirements: scoped,
        statusFor,
        documents: scopedDocuments,
        planSections,
        answers,
        planRowKeys: planRowKeys(),
        signUrl: openDocument,
        authorityName: authority?.authority.name,
        forms: scopedForms,
      }, setProgress);

      save(result.blob, result.fileName);
      setFailures(result.failures);

      if (campId && seasonId) {
        const readers = new Set(profiles.map((p) => p.reader));
        await dbRecordComplianceExport(
          campId, seasonId,
          profiles.map((p) => p.code).join('+') || 'none',
          readers.size === 1 ? [...readers][0] : null,
          currentUser.name || null,
        );
      }
      setTimeout(() => setProgress(null), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The packet did not build.');
      setProgress(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="bg-white rounded-card border border-border px-5 py-4 mb-4">
        <p className="text-[14px] font-semibold text-forest">Hand-off packets</p>
        <p className="text-[12.5px] text-ink-soft mt-1.5 leading-relaxed max-w-[75ch]">
          One zip per party, holding only what that party asked for: their forms filled from your
          data, the files you attached against their requirements, an index of what covers what,
          and your written plan. The forms are the official ones, unmodified, with your data drawn
          at the printed positions. Check every one before you file it — some still need a wet
          signature.
        </p>

        <div className="mt-4 space-y-2">
          {authorities.map((a) => (
            <div key={a.authority.id}
                 className="flex items-center gap-3 flex-wrap border border-border rounded-card px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-forest">{a.authority.name}</p>
                <p className="text-[11.5px] text-ink-faint">
                  {a.met + a.outstanding === 0
                    ? 'Nothing to hand over'
                    : `${a.met + a.outstanding} requirement${a.met + a.outstanding === 1 ? '' : 's'}` +
                      (a.outstanding > 0 ? ` · ${a.outstanding} still outstanding` : ' · all on record')}
                </p>
              </div>
              <Button size="sm" variant="ghost"
                      disabled={busy !== null || a.met + a.outstanding === 0}
                      onClick={() => downloadPacket(a)}>
                {busy === `packet-${a.authority.id}`
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FolderDown className="w-3.5 h-3.5" />}
                Their packet
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5 mt-4 pt-3.5 border-t border-cream-dark flex-wrap">
          <Button size="sm" disabled={busy !== null} onClick={() => downloadPacket()}>
            {busy === 'packet'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FolderDown className="w-3.5 h-3.5" />}
            Everything in one zip
          </Button>
          <span className="text-[11.5px] text-ink-faint">
            For your own records, or when a reviewer asks for the lot.
          </span>
        </div>

        {progress && (
          <div className="flex items-center gap-2.5 mt-3">
            <div className="h-1.5 flex-1 rounded-full bg-cream-dark overflow-hidden">
              <div className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                progress.stage === 'failed' ? 'bg-red' : 'bg-sage'}`}
                style={{ width: `${progress.percent}%` }} />
            </div>
            <span className="font-mono text-[11.5px] text-ink-soft tabular-nums">
              {progress.label} {progress.percent}%
            </span>
          </div>
        )}

        {failures.length > 0 && (
          <div className="rounded-card border border-amber/30 bg-amber-bg px-4 py-3 mt-3">
            <p className="text-[12.5px] text-amber-text inline-flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              The zip is complete apart from these files. They are named in evidence-index.csv so
              nothing looks covered when it is not.
            </p>
            <ul className="mt-2 space-y-0.5">
              {failures.map((f) => (
                <li key={f.fileName} className="text-[11.5px] text-amber-text">
                  {f.title} · {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-card border border-red/30 bg-red-bg px-4 py-3 mb-4">
          <p className="text-[13px] text-red-text">{error}</p>
        </div>
      )}

      <div className="space-y-2">
        {NY_FORMS.map((form) => {
          const pct = coverage(form, camp, planSections, answers, planRowKeys());
          return (
            <div key={form.code} className="bg-white rounded-card border border-border px-4 py-3.5">
              <div className="flex items-start gap-3 flex-wrap">
                <FileText className="w-4 h-4 text-ink-faint mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-forest">
                    {form.code} <span className="font-normal text-ink-soft">· {form.title}</span>
                  </p>
                  <p className="text-[11.5px] text-ink-faint mt-0.5 font-mono">
                    version {form.map.form_version} · {form.map.fields.length} fields mapped
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => download(form, false)}>
                    Blank
                  </Button>
                  <Button size="sm" disabled={busy !== null} onClick={() => download(form, true)}>
                    {busy === `${form.code}-true`
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Download className="w-3.5 h-3.5" />}
                    Filled
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2.5 mt-3">
                <div className="h-1.5 flex-1 rounded-full bg-cream-dark overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 60 ? 'bg-sage' : 'bg-amber'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="font-mono text-[11.5px] text-ink-soft">{pct}% of your fields</span>
              </div>
              {pct < 60 && (
                <p className="text-[11.5px] text-amber-text mt-1.5 inline-flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {FORM_GAP[form.code] ?? 'Most of this form still needs completing by hand. We fill what the platform holds.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
