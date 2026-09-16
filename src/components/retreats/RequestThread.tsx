/**
 * One request, as the conversation it is.
 *
 * The opening ask is the first bubble; everything after it is a message from one side or the
 * other, in order, with a box to say the next thing. Before this the camp got exactly one reply
 * and the group got none at all, so "yes, but can we move it to Friday?" had to happen over
 * email and left no trace on the booking.
 *
 * Shared by the Requests tab and the response modal so the camp reads the same thread wherever
 * it is standing.
 */
import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatChangeRequest, RetreatRequestMessage } from '@/lib/types';
import { inputClass, fmtStamp } from './retreatUi';

function Bubble({ side, name, body, at }: {
  side: 'camp' | 'group'; name: string | null; body: string; at: string | null;
}) {
  const fromCamp = side === 'camp';
  return (
    <div className={`flex ${fromCamp ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-card px-3.5 py-2.5 ${
        fromCamp ? 'bg-forest text-cream' : 'bg-cream-dark text-ink'
      }`}>
        <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${
          fromCamp ? 'text-sage-light' : 'text-ink-faint'
        }`}>
          {fromCamp ? (name ?? 'The camp') : (name ?? 'The group')}
          {at && <span className="font-medium normal-case tracking-normal"> · {fmtStamp(at)}</span>}
        </p>
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{body}</p>
      </div>
    </div>
  );
}

export function RequestThread({ request, messages, compact = false }: {
  request: RetreatChangeRequest;
  messages: RetreatRequestMessage[];
  /** Inside a modal, where the reply box belongs to the modal's own form. */
  compact?: boolean;
}) {
  const postRequestMessage = useRetreatStore((s) => s.postRequestMessage);
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');
  const [draft, setDraft] = useState('');

  function send() {
    if (!draft.trim()) return;
    postRequestMessage(request.id, draft, currentUser.name || null);
    setDraft('');
  }

  return (
    <div className="space-y-2.5">
      {/* The opening ask lives on the request row, not in the message list, so it is drawn
          here rather than fetched. It is the subject line of the thread. */}
      <Bubble
        side={request.origin === 'camp' ? 'camp' : 'group'}
        name={request.submittedBy}
        body={request.body}
        at={request.submittedAt}
      />
      {messages.map((m) => (
        <Bubble key={m.id} side={m.author} name={m.authorName} body={m.body} at={m.createdAt} />
      ))}

      {!compact && canManage && (
        <div className="pt-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, shift+enter breaks the line. These are two-sentence replies typed
              // between other jobs, and reaching for a button each time is the friction that
              // sends people back to email.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={2}
            placeholder="Reply to the group…"
            className={`${inputClass} resize-y`}
          />
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" onClick={send} disabled={!draft.trim()}>
              <Send className="w-3.5 h-3.5" /> Send
            </Button>
            <span className="text-[11px] text-ink-faint">
              They see it in their guest portal and can answer there.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
