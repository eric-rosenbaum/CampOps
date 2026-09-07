import { useRef, useState } from 'react';
import { Camera, Send, X } from 'lucide-react';
import type { Issue } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useCampgroundStore } from '@/store/campgroundStore';
import { dbUploadPhoto } from '@/lib/db';
import { generateId } from '@/lib/utils';

const MAX_PHOTOS = 4;

interface Props {
  issue: Issue;
}

/**
 * Say something about this work order, with pictures.
 *
 * Photos go through the same bucket and the same uploader as the work order's own photo, so a
 * failed upload fails loudly here rather than posting a message that claims to have pictures
 * attached to it and does not.
 */
export function CommentComposer({ issue }: Props) {
  const { currentUser } = useAuth();
  const postComment = useCampgroundStore((s) => s.postComment);

  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * OFF by default, and only offered at all when there is somebody on the other end.
   *
   * A camp talking to itself about a report ("the guy who called this in has it backwards")
   * must never accidentally publish that to the person who scanned the sticker. Reaching the
   * reporter has to be a deliberate act, so it is a switch that starts closed every time.
   */
  const [replyToReporter, setReplyToReporter] = useState(false);
  const canReachReporter = issue.isPublicReport && Boolean(issue.reporterToken);

  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(picked: FileList) {
    const room = MAX_PHOTOS - files.length;
    if (room <= 0) return;
    const next = Array.from(picked).slice(0, room);
    setFiles((f) => [...f, ...next]);
    for (const file of next) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreviews((p) => [...p, ev.target?.result as string]);
      reader.readAsDataURL(file);
    }
  }

  function removeAt(index: number) {
    setFiles((f) => f.filter((_, i) => i !== index));
    setPreviews((p) => p.filter((_, i) => i !== index));
  }

  async function handleSend() {
    const text = body.trim();
    if (!text && files.length === 0) return;
    setSending(true);
    setError(null);

    const urls: string[] = [];
    for (const file of files) {
      // A unique key per photo: the writer names the object after what it is given, and four
      // uploads inside one message would otherwise be able to collide on the same path.
      const url = await dbUploadPhoto(file, `${issue.id}-c${generateId().slice(0, 8)}`);
      if (!url) {
        setSending(false);
        setError('A photo did not upload. Nothing was posted, so try again.');
        return;
      }
      urls.push(url);
    }

    postComment(
      issue.id,
      text,
      { id: currentUser.id, name: currentUser.name },
      urls,
      canReachReporter && replyToReporter,
    );

    setBody('');
    setFiles([]);
    setPreviews([]);
    setReplyToReporter(false);
    setSending(false);
  }

  return (
    <div className="rounded-card border border-border bg-white p-2.5">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Add a message…"
        className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink
                   placeholder:text-ink-faint focus:outline-none"
      />

      {previews.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {previews.map((src, i) => (
            <div key={src.slice(-40) + i} className="relative">
              <img src={src} alt="" className="h-14 w-14 rounded-card border border-border object-cover" />
              <button
                onClick={() => removeAt(i)}
                title="Remove this photo"
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full
                           bg-black/55 text-white transition-colors hover:bg-black/75"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canReachReporter && (
        <label className="mb-2 flex items-start gap-2 text-[12px] text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={replyToReporter}
            onChange={(e) => setReplyToReporter(e.target.checked)}
            className="mt-[3px] h-3.5 w-3.5 flex-none accent-sage"
          />
          <span>
            Reply to the person who reported this
            <span className="block text-[11px] text-ink-soft">
              Visible to the reporter. Everything else stays internal.
            </span>
          </span>
        </label>
      )}

      {error && <p className="mb-2 text-[11.5px] text-red">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={files.length >= MAX_PHOTOS || sending}
          title={files.length >= MAX_PHOTOS ? `Four photos is the limit` : 'Attach a photo'}
          className="grid h-[30px] w-[30px] flex-none place-items-center rounded-btn border border-border
                     text-forest transition-colors hover:border-sage disabled:opacity-40"
        >
          <Camera className="h-3.5 w-3.5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="text-[11px] text-ink-faint">
          {files.length > 0 ? `${files.length} of ${MAX_PHOTOS} photos` : ''}
        </span>
        <button
          onClick={handleSend}
          disabled={sending || (!body.trim() && files.length === 0)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-btn bg-forest px-3 py-1.5
                     text-[12.5px] font-bold text-paper transition-colors hover:bg-forest-mid
                     disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
