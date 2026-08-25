import { campError, campLog } from './campLog';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  monotonic, stagePercent, watchUploadBytes, STAGE_LABEL,
  type UploadProgress,
} from './uploadProgress';

/**
 * One way in to storage, so every upload fails the same way and none of them fail silently.
 *
 * Two things went wrong before this existed, and both are handled here.
 *
 * The first is that a retry could turn a success into a failure. The fetch layer aborts a
 * request that has gone quiet and sends it again, which is right for a read and used to be
 * wrong for an upload: the storage API had already accepted the first attempt, so the retry
 * came back "Duplicate", and the caller reported a file that is sitting in the bucket as
 * having failed to upload. Every path here is unique to a single upload (a timestamp or a
 * uuid), so a duplicate can only ever be our own retry arriving second. That is a success,
 * and it is read as one.
 *
 * The second is that callers returned null on failure and the UI carried on regardless, which
 * is how a document row ended up in the database with no file behind it. This throws, so
 * ignoring a failed upload takes deliberate effort.
 */

/** The project-wide storage ceiling. Worth catching here so the message is about the file. */
const MAX_BYTES = 50 * 1024 * 1024;

export class UploadError extends Error {
  readonly detail: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = 'UploadError';
    this.detail = detail;
  }
}

/** A duplicate is our own retry landing after the first attempt was aborted mid-flight. */
function isDuplicate(err: { message?: string; statusCode?: string; status?: number }): boolean {
  const msg = (err.message ?? '').toLowerCase();
  return msg.includes('already exists') || msg.includes('duplicate');
}

function humanSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Put a file in a bucket. Resolves with the path on success, throws {@link UploadError}
 * otherwise. Never resolves for an upload that did not store the file.
 */
export async function uploadToBucket(
  client: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
  onProgress?: UploadProgress,
): Promise<string> {
  const report = monotonic(onProgress);
  if (file.size === 0) {
    throw new UploadError(`"${file.name}" is empty. Pick the file again and retry.`);
  }
  if (file.size > MAX_BYTES) {
    throw new UploadError(
      `"${file.name}" is ${humanSize(file.size)}. The limit is ${humanSize(MAX_BYTES)}.`,
    );
  }

  const started = Date.now();
  report({ stage: 'uploading', percent: 0, label: STAGE_LABEL.uploading });
  const stopWatching = watchUploadBytes(path, (loaded, total) => {
    report({
      stage: 'uploading',
      percent: stagePercent('uploading', total > 0 ? loaded / total : 0),
      label: STAGE_LABEL.uploading,
    });
  });

  const { error } = await client.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
    .catch((err: unknown) => ({ error: { message: String(err) } }))
    .finally(stopWatching);

  if (!error) {
    campLog(`[CampOps] upload ${bucket} ok · ${humanSize(file.size)} · ${Date.now() - started}ms`);
    report({ stage: 'uploading', percent: stagePercent('uploading', 1), label: STAGE_LABEL.uploading });
    return path;
  }

  if (isDuplicate(error)) {
    // The first attempt stored it and the response was lost. The bytes are there.
    campLog(`[CampOps] upload ${bucket} duplicate · treating the earlier attempt as the success`);
    report({ stage: 'uploading', percent: stagePercent('uploading', 1), label: STAGE_LABEL.uploading });
    return path;
  }

  campError(`[CampOps] upload ${bucket} failed`, error.message);
  report({ stage: 'failed', percent: 0, label: STAGE_LABEL.failed });
  throw new UploadError(uploadMessage(error.message, file.name), error);
}

/** Storage errors are written for API consumers. Say what the person can do about it. */
function uploadMessage(raw: string, fileName: string): string {
  const msg = (raw ?? '').toLowerCase();
  if (msg.includes('exceeded the maximum allowed size') || msg.includes('payload too large')) {
    return `"${fileName}" is too large to upload.`;
  }
  if (msg.includes('row-level security') || msg.includes('unauthorized') || msg.includes('403')) {
    return 'You do not have permission to upload files for this camp.';
  }
  if (msg.includes('no progress') || msg.includes('abort') || msg.includes('network')) {
    return `The connection dropped while uploading "${fileName}". Nothing was saved, so try again.`;
  }
  return `"${fileName}" could not be uploaded. ${raw}`;
}

/**
 * Prove the file can actually be read back, through the same signed-URL path a reader uses.
 *
 * "Storage returned 200" is a weaker claim than it looks: it says the write was accepted, not
 * that a later read will succeed. Policies, path encoding and bucket configuration can all let
 * a write through and then refuse the read, and the person who finds out is whoever clicks the
 * document a week later. Cheaper to find out now, while the progress bar is still on screen.
 *
 * Asks for a single byte. Servers that ignore Range send the whole object, so the body is
 * cancelled rather than read: we only ever needed the status line.
 */
export async function verifyReadable(
  client: SupabaseClient,
  bucket: string,
  path: string,
): Promise<boolean> {
  try {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      campError('[CampOps] verifyReadable could not sign', error?.message ?? 'no url');
      return false;
    }
    const res = await fetch(data.signedUrl, { headers: { Range: 'bytes=0-0' } });
    // Body is never needed. Cancelling avoids pulling a whole PDF down to check it exists.
    res.body?.cancel().catch(() => { /* already consumed or unsupported */ });
    if (!res.ok && res.status !== 206) {
      campError('[CampOps] verifyReadable got', String(res.status));
      return false;
    }
    return true;
  } catch (err) {
    campError('[CampOps] verifyReadable threw', err instanceof Error ? err.message : String(err));
    return false;
  }
}
