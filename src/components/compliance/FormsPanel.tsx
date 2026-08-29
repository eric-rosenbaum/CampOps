import { useState } from 'react';
import { Download, FileText, Loader2, AlertTriangle, FolderDown } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
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
export function FormsPanel() {
  const {
    planSections, campId, seasonId, requirements, enabledProfileIds,
    documents, statusFor, enabledProfiles, openDocument,
  } = useComplianceStore();
  const { currentCamp } = useCampStore();
  const season = useChecklistStore((s) => s.season);
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportStatus | null>(null);
  const [failures, setFailures] = useState<EvidenceFailure[]>([]);

  const camp: PacketCamp = {
    campName: currentCamp?.name ?? 'Camp',
    county: 'Westchester',
    address: [currentCamp?.addressLine1, currentCamp?.city, currentCamp?.state]
      .filter(Boolean).join(', '),
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
        const bytes = await generateForm(form, camp, planSections);
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
  async function downloadPacket() {
    setBusy('packet');
    setError(null);
    setFailures([]);
    setProgress({ stage: 'cover', percent: 0, label: 'Building the cover sheet' });
    try {
      const profiles = enabledProfiles();
      const enabled = new Set(enabledProfileIds);
      const result = await exportCompliancePacket({
        camp,
        seasonName: season?.name ?? null,
        profiles,
        requirements: requirements
          .filter((r) => enabled.has(r.profileId))
          .sort((a, b) => a.reqCode.localeCompare(b.reqCode)),
        statusFor,
        documents,
        planSections,
        signUrl: openDocument,
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
        <p className="text-[14px] font-semibold text-forest">Your Westchester permit packet</p>
        <p className="text-[12.5px] text-ink-soft mt-1.5 leading-relaxed">
          These are the official New York State forms, unmodified. We draw your data onto them at
          the printed positions, so what your county receives is the form they expect. Check every
          filled form before you submit it — some fields still need a wet signature.
        </p>

        <div className="flex items-center gap-2.5 mt-3.5 flex-wrap">
          <Button size="sm" disabled={busy !== null} onClick={downloadPacket}>
            {busy === 'packet'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FolderDown className="w-3.5 h-3.5" />}
            Whole packet as a zip
          </Button>
          <span className="text-[11.5px] text-ink-faint">
            Every form, the files you have attached, an index of what covers what, and your
            written plan.
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
          const pct = coverage(form, camp, planSections);
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
                <span className="font-mono text-[11.5px] text-ink-soft">{pct}% auto-filled</span>
              </div>
              {pct < 60 && (
                <p className="text-[11.5px] text-amber-text mt-1.5 inline-flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  Most of this form still needs completing by hand. We fill what the platform holds.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
