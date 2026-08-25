/**
 * Byte-level progress for uploads, and the stages that come after the bytes.
 *
 * A spinner that says "Uploading…" for forty seconds is indistinguishable from a hang, which
 * is how people end up pressing the button twice. The bar needs real numbers.
 *
 * It also deliberately does not finish at the end of the transfer. "The file reached storage"
 * is not the same claim as "this document exists and can be opened", and the gap between them
 * is exactly where the earlier bug lived: a file sat in the bucket while the row pointing at
 * it had no path. So the last stretch of the bar is spent writing the record, then fetching
 * the thing back through the same signed-URL path the reader will use. It only reaches 100%
 * once that read has actually returned bytes.
 */

export type UploadStage = 'uploading' | 'saving' | 'verifying' | 'done' | 'failed';

export interface UploadStatus {
  stage: UploadStage;
  /** 0–100. Monotonic within one attempt, so the bar never appears to go backwards. */
  percent: number;
  label: string;
}

export type UploadProgress = (status: UploadStatus) => void;

/**
 * How the bar is divided. Transfer owns most of it because it is the part that actually takes
 * time; the tail is short but it is the part that makes the number honest.
 */
export const STAGE_CEILING: Record<Exclude<UploadStage, 'failed'>, number> = {
  uploading: 70,
  saving: 85,
  verifying: 97,
  done: 100,
};

export const STAGE_LABEL: Record<UploadStage, string> = {
  uploading: 'Uploading',
  saving: 'Saving the record',
  verifying: 'Checking it opens',
  done: 'Done',
  failed: 'Failed',
};

/**
 * Wraps a caller's progress callback so the percentage can only ever climb.
 *
 * A retry restarts the transfer from zero, and a bar that snaps back to 12% reads as an error
 * even though the retry is the recovery working.
 */
export function monotonic(sink: UploadProgress | undefined): UploadProgress {
  let high = 0;
  return (status) => {
    if (!sink) return;
    if (status.stage === 'failed') { sink(status); return; }
    high = Math.max(high, status.percent);
    sink({ ...status, percent: high });
  };
}

/** Percentage for a stage that is `fraction` (0–1) of the way through itself. */
export function stagePercent(stage: Exclude<UploadStage, 'failed'>, fraction: number): number {
  const order: Exclude<UploadStage, 'failed'>[] = ['uploading', 'saving', 'verifying', 'done'];
  const i = order.indexOf(stage);
  const floor = i <= 0 ? 0 : STAGE_CEILING[order[i - 1]];
  const ceiling = STAGE_CEILING[stage];
  return Math.round(floor + (ceiling - floor) * Math.min(1, Math.max(0, fraction)));
}

// ─── Transfer progress from the fetch layer ──────────────────────────────────
//
// supabase-js owns the request, so the only place the bytes are visible is our XHR adaptor.
// Rather than reimplement the upload (and with it the auth, retry and timeout handling that
// lives there), the uploader registers interest in a path and the adaptor reports against it.
// A tiny module of its own so `supabase.ts` and `storageUpload.ts` can both use it without
// importing each other.

type ByteSink = (loaded: number, total: number) => void;

const watchers = new Map<string, ByteSink>();

/** Called by the uploader for the life of one request. Returns the unregister. */
export function watchUploadBytes(pathFragment: string, sink: ByteSink): () => void {
  watchers.set(pathFragment, sink);
  return () => { watchers.delete(pathFragment); };
}

/** Called by the fetch adaptor on every upload progress event. */
export function reportUploadBytes(url: string, loaded: number, total: number): void {
  if (watchers.size === 0) return;
  for (const [fragment, sink] of watchers) {
    // encodeURI, because the request URL has the path percent-encoded and the caller
    // registered the raw one.
    if (url.includes(fragment) || url.includes(encodeURI(fragment))) {
      sink(loaded, total);
      return;
    }
  }
}
