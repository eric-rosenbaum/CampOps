import { useRef, useState } from 'react';
import { FileText, Upload, ExternalLink, PenLine, X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { UploadProgressBar } from '@/components/shared/UploadProgressBar';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import { planFileName, planIsWritten, writtenSectionCount } from '@/lib/compliance/planSource';
import type { UploadStatus } from '@/lib/uploadProgress';

/**
 * Where this camp's safety plan comes from, and how to change the answer.
 *
 * The builder asks a camp to write ninety-six sections. That is the right tool for a camp that
 * has no plan, and the wrong assumption about almost every camp: a returning one has a document
 * that has been edited for years, and DOH-367 asks which of three situations they are in
 * precisely because "the county already has it" is the normal case. So the upload is offered
 * first and the builder second, rather than the builder being the only door.
 *
 * The card states which document the packet will carry. That sentence is the whole point of it
 * — a camp about to file needs to know what is in the envelope, not what could be.
 */
export function PlanSourceCard({ onOpenPlan }: { onOpenPlan?: () => void }) {
  const {
    planDocument, planSections, planProgress, uploadPlanDocument, removePlanDocument,
    openDocument, planAnswers, planAnswerProgress,
  } = useComplianceStore();
  const { currentUser, can } = useAuth();
  const canManage = can('manageSafetyItems');

  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadStatus | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const doc = planDocument();
  const written = planIsWritten(planSections, planAnswers);
  const progressCounts = planProgress();
  const answerCounts = planAnswerProgress();
  // What the packet would carry, which is not the same as what the plan page calls progress: a
  // section ruled out is progress there and is not writing here. Answers to the state's template
  // count on their own, since a row exists only where the camp put something.
  const answered = Object.keys(planAnswers).length;
  const writtenCount = answered > 0 ? answered : writtenSectionCount(planSections);
  const unit = answered > 0 ? 'answer' : 'section';

  async function upload(file: File) {
    setError(null);
    setPending(file.name);
    setProgress({ stage: 'uploading', percent: 0, label: 'Uploading' });
    try {
      await uploadPlanDocument(
        file,
        { id: currentUser.id ?? null, name: currentUser.name ?? null },
        currentUser.name || null,
        setProgress,
      );
      setTimeout(() => { setProgress(null); setPending(null); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload did not complete.');
      setProgress(null);
      setPending(null);
    }
  }

  const picker = (
    <input
      ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.odt,.rtf"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void upload(f);
      }}
    />
  );

  return (
    <div className="bg-white rounded-card border border-border px-5 py-4">
      {picker}
      <p className="text-[13.5px] font-semibold text-forest">Your written safety plan</p>

      {doc ? (
        <>
          <div className="flex items-start gap-2.5 mt-2.5">
            <FileText className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <button
                onClick={async () => {
                  const u = await openDocument(doc.bucketPath);
                  if (u) window.open(u, '_blank', 'noopener');
                }}
                className="text-[13px] font-medium text-forest hover:underline text-left truncate block">
                {doc.title}
              </button>
              <p className="text-[11.5px] text-ink-faint mt-0.5">
                {doc.uploaderName ? `${doc.uploaderName} · ` : ''}{doc.createdAt.slice(0, 10)}
              </p>
            </div>
          </div>

          <p className="text-[12px] text-ink-soft mt-2.5 leading-relaxed">
            This is what goes in your packet, as <span className="font-mono">{planFileName(doc)}</span>,
            exactly as you uploaded it. We do not read inside it or change it.
          </p>

          {/* Said plainly, because it is the one thing about this arrangement a camp could get
              wrong: work they can see on the plan page is not in the envelope. */}
          {written && (
            <p className="text-[12px] text-amber-text mt-2 leading-relaxed">
              The {writtenCount} {unit}{writtenCount === 1 ? '' : 's'} written in CampCommand
              {writtenCount === 1 ? ' is' : ' are'} not sent while your own plan is here. Remove it
              and we go back to sending the plan you write.
            </p>
          )}

          {/* DOH-2040 asks for a page number against every component. We know them for a plan we
              rendered and cannot know them for one we did not, so the checklist prints what the
              camp typed and leaves the rest blank rather than guessing at a page. */}
          <p className="text-[11.5px] text-ink-faint mt-2 leading-relaxed">
            Page numbers on the DOH-2040 checklist come from a plan we render, so with your own
            document those rows are left for you to fill in.
          </p>

          {canManage && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Button size="sm" variant="ghost" disabled={progress !== null}
                      onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> Replace it
              </Button>
              {confirmRemove ? (
                <div className="inline-flex items-center gap-2">
                  <span className="text-[12px] text-ink-soft">Stop sending this plan?</span>
                  <Button size="sm" variant="danger"
                          onClick={async () => { setConfirmRemove(false); await removePlanDocument(); }}>
                    Remove
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Keep</Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                  <X className="w-3.5 h-3.5" /> Remove
                </Button>
              )}
            </div>
          )}
          {/* The file itself survives a removal, which is worth saying before they click it. */}
          {confirmRemove && (
            <p className="text-[11.5px] text-ink-faint mt-2">
              The file stays in your documents. Only its use as the plan stops.
            </p>
          )}
        </>
      ) : written ? (
        <>
          <p className="text-[12px] text-ink-soft mt-1.5 leading-relaxed">
            {answered > 0
              ? `${answerCounts.answered} of ${answerCounts.total} questions on the state's template answered.`
              : `${progressCounts.complete} of ${progressCounts.total} sections written.`}{' '}
            We render the plan from them, with a contents page, and it downloads with your packet —
            so the page numbers on the DOH-2040 checklist are ours to work out rather than yours.
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {onOpenPlan && (
              <Button size="sm" variant="ghost" onClick={onOpenPlan}>
                <PenLine className="w-3.5 h-3.5" /> Keep writing <ExternalLink className="w-3 h-3" />
              </Button>
            )}
            {canManage && (
              <Button size="sm" variant="ghost" disabled={progress !== null}
                      onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> Upload a plan you already have
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-[12px] text-ink-soft mt-1.5 leading-relaxed">
            Two ways to do this, and most camps already have the answer to the first. If you have a
            safety plan from a previous season, upload it and it goes with your application
            unchanged. If you are starting from nothing, write it here and we produce the document.
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {canManage && (
              <Button size="sm" disabled={progress !== null} onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> Upload the plan you already have
              </Button>
            )}
            {onOpenPlan && (
              <Button size="sm" variant="ghost" onClick={onOpenPlan}>
                <PenLine className="w-3.5 h-3.5" /> Write it in CampCommand <ExternalLink className="w-3 h-3" />
              </Button>
            )}
          </div>
          <p className="text-[11.5px] text-ink-faint mt-2.5 leading-relaxed">
            PDF or Word. If the county already holds a plan you have not changed, you do not need
            either: answer the question above with "sent in a previous year and still current".
          </p>
        </>
      )}

      {progress && <div className="mt-3"><UploadProgressBar status={progress} fileName={pending ?? undefined} /></div>}
      {error && <p className="text-[12.5px] text-red-text mt-2">{error}</p>}
    </div>
  );
}
