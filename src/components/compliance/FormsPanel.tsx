import { useState } from 'react';
import { Download, FileText, Loader2, AlertTriangle, FolderDown, ArrowRight, Eye } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore, type AuthoritySummary } from '@/store/complianceStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useAuth } from '@/lib/auth';
import { dbRecordComplianceExport } from '@/lib/complianceDb';
import { NY_FORMS, generateForm, coverage, type PacketForm } from '@/lib/compliance/nyPacket';
import { FormDetail } from './FormDetail';
import {
  exportCompliancePacket, type ExportStatus, type EvidenceFailure,
} from '@/lib/compliance/exportPacket';
import { usePacketCamp, useReadinessFor } from '@/lib/compliance/usePacketCamp';

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
  'DOH-367': 'Fills from your setup answers, your directors, your staff roster and your sessions table. Still yours: the facility code your county assigns you, and the signatures.',
  'DOH-367a': 'Fills from your staff roster and their certification records. Anyone missing a date of birth leaves their row blank, so completing the roster completes the form.',
  'DOH-2040': 'Fills from your written plan: the Yes box and the page number for every section you have completed. The page numbers are worked out from the plan we render, so you never count them.',
  'DOH-2271': 'Fills from the certified statement questions under Your records. The signature and the date are the director\u2019s own and are not ours to pre-answer.',
  'DOH-2286': 'Fills from your pool and beach safety plan, the same way DOH-2040 fills from your camp plan. Write those sections and this completes itself.',
};

export function FormsPanel({ onGoToTab, openFormCode, onFormOpened }: {
  onGoToTab?: (tab: 'records' | 'plan' | 'documents') => void;
  /** A form another page asked us to open. */
  openFormCode?: string | null;
  onFormOpened?: () => void;
}) {
  const {
    planSections, campId, seasonId, requirements, enabledProfileIds,
    documents, statusFor, enabledProfiles, openDocument, answers,
    activeAuthorities, formsForAuthority, planRowKeys, formQuestions, formAnswers,
    sessionCapacity, activeFormCodes,
  } = useComplianceStore();
  const season = useChecklistStore((s) => s.season);
  const authorities = activeAuthorities();
  // Only the documents currently in scope. Parking one is a row in the catalog, not an edit here.
  const inScope = activeFormCodes();
  const forms = NY_FORMS.filter((f) => inScope.has(f.code));
  const [openForm, setOpenForm] = useState<string | null>(null);

  const readinessFor = useReadinessFor();

  const { currentUser } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportStatus | null>(null);
  const [failures, setFailures] = useState<EvidenceFailure[]>([]);

  const camp = usePacketCamp();

  /**
   * Open the filled form in a tab instead of saving it.
   *
   * Checking should not leave a trail of downloads in someone's folder. A director will look at
   * this several times before they are happy with it, and each look should cost nothing.
   */
  async function preview(form: PacketForm) {
    setBusy(`${form.code}-preview`);
    setError(null);
    try {
      const bytes = await generateForm(
        form, camp, planSections, answers, planRowKeys(), {}, formQuestions, formAnswers, sessionCapacity,
      );
      const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the preview.');
    } finally {
      setBusy(null);
    }
  }

  async function download(form: PacketForm, filled: boolean) {
    setBusy(`${form.code}-${filled}`);
    setError(null);
    try {
      let blob: Blob;
      let name: string;
      if (filled) {
        const bytes = await generateForm(
          form, camp, planSections, answers, planRowKeys(), {}, formQuestions, formAnswers,
          sessionCapacity,
        );
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
        ? forms.filter((f) => formsForAuthority(authority.authority.id)
            .some((af) => af.designation === f.code))
        : forms;

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
        formQuestions,
        formAnswers,
        sessionCapacity,
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

  // A request from elsewhere wins once, then hands control back to this panel's own state.
  const wanted = openFormCode ?? openForm;
  const opened = wanted ? forms.find((f) => f.code === wanted) ?? null : null;
  if (opened) {
    const r = readinessFor(opened);
    if (r) {
      return (
        <FormDetail
          form={opened}
          readiness={r}
          busy={busy !== null}
          onBack={() => { setOpenForm(null); onFormOpened?.(); }}
          onPreview={() => void preview(opened)}
          onDownload={() => void download(opened, true)}
          onOpenPlan={() => onGoToTab?.('plan')}
        />
      );
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
                {/* Forms sit outside met/outstanding, so a party whose only item is a form we
                    prepare was reading "nothing to hand over" next to the form we had just
                    filled in for them. */}
                <p className="text-[11.5px] text-ink-faint">
                  {a.met + a.outstanding + a.forms === 0
                    ? 'Nothing to hand over'
                    : [
                        a.forms > 0 && `${a.forms} form${a.forms === 1 ? '' : 's'}`,
                        (a.met + a.outstanding) > 0
                          && `${a.met + a.outstanding} requirement${a.met + a.outstanding === 1 ? '' : 's'}`
                          + (a.outstanding > 0 ? `, ${a.outstanding} still outstanding` : ', all on record'),
                      ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button size="sm" variant="ghost"
                      disabled={busy !== null || a.met + a.outstanding + a.forms === 0}
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
        {forms.map((form) => {
          const pct = coverage(
            form, camp, planSections, answers, planRowKeys(), formQuestions, formAnswers,
            sessionCapacity,
          );
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
                  {readinessFor(form) && (
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void preview(form)}>
                      {busy === `${form.code}-preview`
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Eye className="w-3.5 h-3.5" />}
                      Preview
                    </Button>
                  )}
                  <Button size="sm" disabled={busy !== null} onClick={() => download(form, true)}>
                    {busy === `${form.code}-true`
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Download className="w-3.5 h-3.5" />}
                    {/* "Filled" on a form with gaps in it is a small lie the camp finds out
                        about after they have opened the PDF. */}
                    {readinessFor(form) && !readinessFor(form)!.ready ? 'Partly filled' : 'Filled'}
                  </Button>
                </div>
              </div>

              {/* A form with a detail page says whether it is ready and offers the way in. The
                  rest still show a percentage, until each gets the same treatment. */}
              {readinessFor(form) ? (
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <span className={`px-2.5 py-1 rounded-btn text-[11.5px] font-semibold ${
                    readinessFor(form)!.ready
                      ? 'bg-green-muted-bg text-green-muted-text'
                      : 'bg-amber-bg text-amber-text'}`}>
                    {readinessFor(form)!.ready
                      ? 'Ready to file'
                      : `${readinessFor(form)!.outstanding} thing${readinessFor(form)!.outstanding === 1 ? '' : 's'} still to do`}
                  </span>
                  <button onClick={() => setOpenForm(form.code)}
                    className="text-[12.5px] text-sage hover:text-forest inline-flex items-center gap-1">
                    See what fills it and from where <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
