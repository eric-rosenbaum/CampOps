import { useMemo, useRef, useState } from 'react';
import { Camera, Send, X } from 'lucide-react';
import type { Issue } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useCampgroundStore } from '@/store/campgroundStore';
import { useCampStore } from '@/store/campStore';
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
  const taRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Who has been named, by id.
   *
   * Kept alongside the text rather than parsed back out of it on send: two people called Sarah
   * would be one ambiguous string, and a rename would orphan the mention. The text carries the
   * name for reading; this carries who was meant.
   */
  const [mentioned, setMentioned] = useState<{ id: string; name: string }[]>([]);
  /** The @… fragment being typed, or null. Drives the picker. */
  const [query, setQuery] = useState<{ from: number; text: string } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const members = useCampStore((s) => s.members);
  const candidates = useMemo(() => {
    if (!query) return [];
    const q = query.text.toLowerCase();
    return members
      .filter((m) => m.isActive && m.role !== 'viewer' && m.userId !== currentUser.id)
      .filter((m) => (m.displayName ?? m.fullName ?? '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [members, query, currentUser.id]);

  /**
   * Spot an @ the caret is still inside.
   *
   * Only fires on an @ that starts a word, so an email address typed into a message does not
   * open a people picker halfway through it.
   */
  function syncQuery(text: string, caret: number) {
    const upto = text.slice(0, caret);
    const at = upto.lastIndexOf('@');
    if (at === -1) { setQuery(null); return; }
    if (at > 0 && !/\s/.test(upto[at - 1])) { setQuery(null); return; }
    const frag = upto.slice(at + 1);
    if (/[\n]/.test(frag)) { setQuery(null); return; }
    setQuery({ from: at, text: frag });
    setHighlight(0);
  }

  function choose(m: { userId: string; displayName: string | null; fullName: string | null }) {
    if (!query) return;
    const name = m.displayName ?? m.fullName ?? 'Someone';
    const before = body.slice(0, query.from);
    const after = body.slice(query.from + 1 + query.text.length);
    const next = `${before}@${name}${after.startsWith(' ') ? '' : ' '}${after}`;
    setBody(next);
    setMentioned((xs) => (xs.some((x) => x.id === m.userId) ? xs : [...xs, { id: m.userId, name }]));
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = before.length + 1 + name.length + 1;
      taRef.current?.focus();
      taRef.current?.setSelectionRange(pos, pos);
    });
  }

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

    // Someone picked and then deleted from the text is not mentioned. Without this, backspacing
    // over a name still pulls that person into a thread they were never named in.
    const stillNamed = mentioned.filter((m) => text.includes(`@${m.name}`)).map((m) => m.id);

    postComment(
      issue.id,
      text,
      { id: currentUser.id, name: currentUser.name },
      urls,
      canReachReporter && replyToReporter,
      stillNamed,
    );

    setBody('');
    setFiles([]);
    setPreviews([]);
    setMentioned([]);
    setQuery(null);
    setReplyToReporter(false);
    setSending(false);
  }

  return (
    <div className="rounded-card border border-border bg-white p-2.5">
      <div className="relative">
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => { setBody(e.target.value); syncQuery(e.target.value, e.target.selectionStart); }}
          onClick={(e) => syncQuery(body, e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setQuery(null), 120)}
          onKeyDown={(e) => {
            if (!query || candidates.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % candidates.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + candidates.length) % candidates.length); }
            else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(candidates[highlight]); }
            else if (e.key === 'Escape') { setQuery(null); }
          }}
          rows={2}
          placeholder="Add a message… @ to name someone"
          className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink
                     placeholder:text-ink-faint focus:outline-none"
        />

        {/* The people picker. Above the box, because the box sits at the bottom of a thread. */}
        {query && candidates.length > 0 && (
          <ul className="absolute bottom-full left-0 z-20 mb-1 w-60 overflow-hidden rounded-card
                         border border-border bg-white shadow-lg">
            {candidates.map((m, i) => (
              <li key={m.userId}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); choose(m); }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`block w-full px-3 py-1.5 text-left text-[12.5px] ${
                    i === highlight ? 'bg-forest/8 text-forest font-medium' : 'text-ink hover:bg-cream'
                  }`}
                >
                  {m.displayName ?? m.fullName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mentioned.filter((m) => body.includes(`@${m.name}`)).length > 0 && (
        <p className="mb-2 text-[11px] text-ink-soft">
          {mentioned.filter((m) => body.includes(`@${m.name}`)).map((m) => m.name).join(', ')}
          {' '}will see this at the top of Campground.
        </p>
      )}

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
