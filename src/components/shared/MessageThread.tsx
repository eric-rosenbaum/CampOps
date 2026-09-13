import { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';

/**
 * A two-party conversation, presentational.
 *
 * Built for the meeting-spaces thread, where an approval or a decline used to be a status badge
 * the group had no way to answer. Both sides render the same component from their own data and
 * their own client -- the pattern BuildingAccordion already uses across the ops/portal seam --
 * so "the camp said no, can we have the Barn instead" is one conversation, not two screens.
 *
 * `mine` is whose side you are on, not who wrote a message: the same thread reads from the left
 * on one side and the right on the other, which is the only cue that reliably tells a reader
 * which half of it is theirs.
 */

export interface ThreadMessage {
  id: string;
  /** 'system' is the product speaking — an approval, a decline. Rendered as neither side's. */
  authorKind: 'camp' | 'group' | 'system';
  authorName: string | null;
  body: string;
  /** Named when the message is about one room. */
  subject?: string | null;
  createdAt: string;
  /** Arrived after the reader last looked. Drawn with a rail so a scan finds it. */
  unread?: boolean;
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function MessageThread({
  messages, mine, onSend, placeholder, emptyMessage, disabled, busy, otherPartyName,
}: {
  messages: ThreadMessage[];
  /** Which side the reader is on. Their own messages sit right; the other side's sit left. */
  mine: 'camp' | 'group';
  onSend: (body: string) => void | Promise<void>;
  placeholder?: string;
  emptyMessage?: string;
  /** The stay is over, or the link expired. The thread stays readable, the box goes. */
  disabled?: boolean;
  busy?: boolean;
  otherPartyName?: string | null;
}) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const count = messages.length;

  // Land on the newest message, not the oldest. A thread that opens at the top makes the
  // reader scroll to find the thing that summoned them.
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [count]);

  async function send() {
    const body = draft.trim();
    if (!body || disabled) return;
    setDraft('');
    await onSend(body);
  }

  return (
    <div className="flex flex-col">
      <div className="max-h-[22rem] overflow-y-auto pr-1 space-y-2.5">
        {messages.length === 0 ? (
          <p className="text-[12.5px] text-ink-faint italic py-3">
            {emptyMessage ?? 'No messages yet.'}
          </p>
        ) : messages.map((m) => {
          const isMine = m.authorKind === mine;
          if (m.authorKind === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <div className={`max-w-[85%] rounded-xl border px-3.5 py-2.5 ${
                  m.unread ? 'border-amber/50 bg-amber-bg' : 'border-border bg-cream'
                }`}>
                  <p className="text-[12.5px] text-ink whitespace-pre-line leading-relaxed">{m.body}</p>
                  <p className="text-[10.5px] text-ink-faint mt-1">
                    {m.authorName ? `${m.authorName} · ` : ''}{when(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                isMine
                  ? 'bg-forest text-white'
                  : m.unread
                    ? 'bg-amber-bg border border-amber/50 text-ink'
                    : 'bg-cream border border-border text-ink'
              }`}>
                {m.subject && (
                  <p className={`text-[10.5px] font-semibold uppercase tracking-wide mb-0.5 ${
                    isMine ? 'text-white/70' : 'text-ink-faint'
                  }`}>
                    {m.subject}
                  </p>
                )}
                <p className="text-[12.5px] whitespace-pre-line leading-relaxed">{m.body}</p>
                <p className={`text-[10.5px] mt-1 ${isMine ? 'text-white/60' : 'text-ink-faint'}`}>
                  {!isMine && m.authorName ? `${m.authorName} · ` : ''}{when(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {!disabled && (
        <div className="flex items-end gap-2 mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            // Enter sends, shift+Enter is a new line: this is a chat box, and a coordinator
            // typing one sentence should not have to hunt for a button.
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            rows={2}
            placeholder={placeholder ?? (otherPartyName ? `Message ${otherPartyName}…` : 'Write a message…')}
            className="flex-1 min-w-0 text-[13px] bg-white border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-sage resize-y"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || busy}
            className="flex-shrink-0 inline-flex items-center gap-1.5 bg-forest text-white text-[13px] font-semibold rounded-xl px-3.5 py-2.5 hover:bg-forest-mid disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </button>
        </div>
      )}
    </div>
  );
}
