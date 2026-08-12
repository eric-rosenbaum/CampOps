// Data layer for white-glove implementation hand-offs: the files a camp sends us during
// setup so our team can load their data (locations, staff, rosters, vendor guides).
//
// Two halves, both camp-scoped by RLS: the file itself in the private `implementation-files`
// bucket, and a metadata row so the camp can see a receipt of everything they've sent.
// There is deliberately no delete here — uploads are permanent (see the migration).
import { supabase } from './supabase';
import { campError } from './campLog';
import { getCampId } from './db';
import type { ImplementationFile, ImplementationCategory } from './types';

const BUCKET = 'implementation-files';

function rowToFile(r: Record<string, unknown>): ImplementationFile {
  return {
    id: r.id as string,
    campId: r.camp_id as string,
    category: r.category as ImplementationCategory,
    name: r.name as string,
    path: r.path as string,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    contentType: (r.content_type as string) ?? null,
    note: (r.note as string) ?? null,
    uploadedBy: (r.uploaded_by as string) ?? null,
    uploaderName: (r.uploader_name as string) ?? null,
    uploaderEmail: (r.uploader_email as string) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Everything this camp has sent us, newest first. */
export async function dbListImplementationFiles(): Promise<ImplementationFile[]> {
  const { data, error } = await supabase
    .from('implementation_files')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { campError('load implementation files', error.message); return []; }
  return (data ?? []).map(r => rowToFile(r as Record<string, unknown>));
}

/**
 * Upload one hand-off file and record it. The storage path leads with the camp id because
 * the bucket policy reads tenancy out of the first path segment.
 * Returns the stored row, or null if either half failed.
 */
export async function dbUploadImplementationFile(
  file: File,
  category: ImplementationCategory,
  note: string | null,
  uploader: { id: string; name: string; email: string },
): Promise<ImplementationFile | null> {
  const campId = getCampId();
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${campId}/${category}/${id}-${safeName}`;

  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (upErr) { campError('upload implementation file', upErr.message); return null; }

  const { data, error } = await supabase.from('implementation_files').insert({
    id, camp_id: campId, category, name: file.name, path,
    size_bytes: file.size, content_type: file.type || null, note: note || null,
    uploaded_by: uploader.id || null,
    uploader_name: uploader.name || null,
    uploader_email: uploader.email || null,
  }).select('*').single();

  if (error) {
    // Metadata is what makes the file findable, so a row we couldn't write leaves an
    // orphan. The bucket has no delete policy by design, so we can't clean it up from
    // here — log loudly instead and let the upload be retried.
    campError('record implementation file', `${error.message} (orphaned object at ${path})`);
    return null;
  }
  return rowToFile(data as Record<string, unknown>);
}

/** Short-lived signed URL to download a hand-off file (the bucket is private). */
export async function dbSignImplementationFile(f: ImplementationFile): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 300);
  if (error) { campError('open implementation file', error.message); return null; }
  // Downloads are worth a trail of their own — the upload is already covered by the
  // audit trigger on implementation_files.
  supabase.rpc('log_audit_event', {
    p_camp_id: f.campId,
    p_action: 'download_implementation_file',
    p_target_table: 'implementation_files',
    p_target_id: f.id,
  });
  return data?.signedUrl ?? null;
}
