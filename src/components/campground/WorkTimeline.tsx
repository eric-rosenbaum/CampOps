import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import type { Issue, IssueComment } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useCampgroundStore, commentsFor } from '@/store/campgroundStore';
import { useCampStore } from '@/store/campStore';
import { Avatar } from '@/components/shared/Avatar';
import { relativeTime } from '@/lib/utils';

/**
 * ONE stream, not two tabs.
 *
 * A History tab beside a Comments tab is exactly the interface where messages go to be missed:
 * the person who needs to read "the part is on back order until the 14th" is looking at the
 * status field, not hunting for a second tab. So system events and human messages share one
 * chronological column, and the difference between them is weight — events are a dot and a
 * line of small grey text, messages are an avatar and full-size ink.
 *
 * Oldest first, newest at the bottom, next to the composer. That is how every message thread a
 * camp already uses reads.
 */

type Row =
  | { kind: 'event'; id: string; at: string; text: string; who: string }
  | { kind: 'message'; id: string; at: string; comment: IssueComment };

interface Props {
  issue: Issue;
}

export function WorkTimeline({ issue }: Props) {
  const { currentUser } = useAuth();
  const comments = useCampgroundStore((s) => s.comments);
  const removeComment = useCampgroundStore((s) => s.removeComment);

  const rows = useMemo<Row[]>(() => {
    const events: Row[] = issue.activityLog.map((e) => ({
      kind: 'event', id: e.id, at: e.timestamp, text: e.action, who: e.userName,
    }));
    const messages: Row[] = commentsFor(comments, issue.id).map((c) => ({
      kind: 'message', id: c.id, at: c.createdAt, comment: c,
    }));
    return [...events, ...messages].sort((a, b) => a.at.localeCompare(b.at));
  }, [issue.activityLog, comments, issue.id]);

  if (rows.length === 0) {
    return <p className="text-[12px] italic text-ink-soft">Nothing has happened yet.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) =>
        row.kind === 'event' ? (
          <div key={row.id} className="flex gap-2.5">
            <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-sage-light" />
            <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-ink-soft">
              {row.text}
              <span className="text-ink-faint"> · {relativeTime(row.at)}</span>
            </p>
          </div>
        ) : (
          <Message
            key={row.id}
            comment={row.comment}
            mine={row.comment.authorId === currentUser.id}
            onDelete={() => removeComment(row.comment.id)}
          />
        ),
      )}
    </div>
  );
}

/**
 * The product's own voice, when it posts a note into a thread.
 *
 * Shared rather than typed out at each site: the database writes this exact string for an
 * author-less system note, and the UI has to recognise the same one to badge it correctly.
 */
const SYSTEM_AUTHOR = 'CampCommand';

/**
 * Who a message is from, resolved against the camp's current roster.
 *
 * The stored name is written from the account at post time and can no longer be asserted by a
 * caller -- but a person renamed afterwards would still drift, so the roster wins whenever it has
 * an answer. Names only fall back to what was stored when there is nothing to resolve against: an
 * author with no account, or somebody since removed from the camp.
 */
function attribution(
  comment: IssueComment,
  members: { userId: string; displayName: string | null; fullName: string }[],
): { name: string; badge: 'reporter' | 'system' | null } {
  if (comment.authorId === null) {
    return comment.authorName === SYSTEM_AUTHOR
      ? { name: SYSTEM_AUTHOR, badge: 'system' }
      : { name: comment.authorName, badge: 'reporter' };
  }
  const m = members.find((x) => x.userId === comment.authorId);
  return { name: m ? (m.displayName ?? m.fullName) : comment.authorName, badge: null };
}

function Message({ comment, mine, onDelete }: {
  comment: IssueComment;
  mine: boolean;
  onDelete: () => void;
}) {
  const members = useCampStore((s) => s.members);
  const who = attribution(comment, members);

  return (
    <div className="group flex gap-2.5 rounded-card bg-paper px-3 py-2.5">
      <Avatar name={who.name} size={26} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-bold text-forest">{who.name}</span>
          {/* No account behind it. Said plainly, because a bare name beside a staff member's name
              reads as a colleague -- which is how a thread ends up showing somebody the camp has
              no record of. */}
          {who.badge === 'reporter' && (
            <span className="rounded-tag border border-red px-[4px] py-px text-[9px] font-bold uppercase tracking-[0.1em] text-red">
              Reporter
            </span>
          )}
          {who.badge === 'system' && (
            <span className="rounded-tag border border-border px-[4px] py-px text-[9px] font-bold uppercase tracking-[0.1em] text-ink-faint">
              Automatic
            </span>
          )}
          <span className="text-[11px] text-ink-faint">{relativeTime(comment.createdAt)}</span>
          {comment.editedAt && <span className="text-[11px] text-ink-faint">· edited</span>}
          {mine && (
            <button
              onClick={onDelete}
              title="Delete this message"
              className="ml-auto flex-none text-ink-faint opacity-0 transition-opacity
                         hover:text-red group-hover:opacity-100 focus:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
          {renderMentions(comment.body)}
        </p>
        {comment.photoUrls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {comment.photoUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt="Attached to this message"
                  className="h-16 w-16 rounded-card border border-border object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {comment.visibleToReporter && (
          <p className="mt-1 text-[11px] font-semibold text-green-muted-text">
            Sent to the person who reported this
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Show an @name as a name rather than as punctuation someone typed.
 *
 * Deliberately cosmetic: who was actually mentioned lives in `comment.mentions`, and this only
 * decides what the sentence looks like. A message that says "@Dave" because someone typed it by
 * hand still reads as a name here, and still notifies nobody -- which is the right way round.
 */
function renderMentions(body: string) {
  const parts = body.split(/(@[\p{L}][\p{L}\p{M}'-]*(?: [\p{L}][\p{L}\p{M}'-]*)?)/gu);
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <strong key={i} className="font-semibold text-forest">{part}</strong>
      : part);
}
