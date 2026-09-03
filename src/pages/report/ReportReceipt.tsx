/**
 * "What happened to the thing I reported?"
 *
 * No account, no login, no email address required — a link. This is the difference between a
 * suggestion box and a conversation, and it is the cheapest loyalty mechanism in the product: a
 * counselor who reports a broken screen door and later sees "Fixed — new screen, Tuesday" reports
 * the next one. A counselor who hears nothing does not.
 *
 * It shows only what `get_public_report_status` returns, which is deliberately narrow: the
 * report, where it stands, and any reply a staff member explicitly marked visible to the
 * reporter. Internal comments, assignees, costs and every other issue at the camp stay invisible,
 * because the holder of this link is not staff and this URL is not a credential.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { AlertCircle, CheckCircle2, Clock, MessageSquare } from 'lucide-react';
import { CampCommandMark } from '@/components/shared/CampCommandMark';
import { formatDate, relativeTime } from '@/lib/utils';

const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

interface Reply { body: string; at: string; from: string | null; }

interface ReportStatus {
  title: string;
  status: string;
  reported_at: string;
  resolved_at: string | null;
  location: string | null;
  camp_name: string;
  replies: Reply[];
}

/**
 * The status, said the way a person would say it.
 *
 * The database's vocabulary is for the queue ("waiting_on_vendor"). Somebody who reported a
 * leaking faucet needs to know whether anyone has picked it up, and "waiting on an outside
 * contractor" is both true and reassuring where the raw enum is neither.
 */
const PLAIN: Record<string, { label: string; detail: string; tone: 'open' | 'working' | 'done' }> = {
  unassigned: {
    label: 'Received',
    detail: 'It is on the camp’s list. Nobody has been put on it yet.',
    tone: 'open',
  },
  assigned: {
    label: 'Assigned',
    detail: 'Someone at camp has been given this to do.',
    tone: 'working',
  },
  in_progress: {
    label: 'Being worked on',
    detail: 'Someone is on it now.',
    tone: 'working',
  },
  waiting_on_vendor: {
    label: 'Waiting on a contractor',
    detail: 'Camp staff have looked at it and called someone in from outside.',
    tone: 'working',
  },
  waiting_on_part: {
    label: 'Waiting on a part',
    detail: 'It needs something that has been ordered and has not arrived.',
    tone: 'working',
  },
  resolved: {
    label: 'Fixed',
    detail: 'Camp staff have marked this done.',
    tone: 'done',
  },
};

export function ReportReceipt() {
  const { token } = useParams<{ token: string }>();
  // Stamped with the token it answers, so the loading state is derived rather than assigned —
  // no synchronous setState in an effect, and no flash of the previous report.
  const [resolved, setResolved] = useState<{ forToken: string; value: ReportStatus | null } | null>(null);
  const report = token
    ? (resolved && resolved.forToken === token ? resolved.value : undefined)
    : null;

  useEffect(() => {
    // Same mobile viewport treatment as the report form: this is opened on a phone, from a link
    // saved in a notes app, standing outside.
    const viewport = document.querySelector('meta[name="viewport"]');
    const original = viewport?.getAttribute('content') ?? '';
    viewport?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    return () => { viewport?.setAttribute('content', original); };
  }, []);

  useEffect(() => {
    if (!token) return;
    let live = true;
    supabasePublic.rpc('get_public_report_status', { p_token: token }).then(({ data, error }) => {
      if (!live) return;
      setResolved({ forToken: token, value: error || !data ? null : (data as ReportStatus) });
    });
    return () => { live = false; };
  }, [token]);

  if (report === undefined) {
    return (
      <div className="min-h-screen bg-paper w-full flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-border border-t-stone-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (report === null) {
    return (
      <div className="min-h-screen bg-paper w-full flex items-center justify-center p-4 sm:p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-ink-faint" />
          </div>
          <h1 className="text-[20px] font-bold text-ink mb-2">We can't find that report</h1>
          <p className="text-[14px] text-ink-faint leading-relaxed">
            Check the link — it is long and easy to cut short when it is copied. If it still does
            not work, the report may have been removed.
          </p>
        </div>
      </div>
    );
  }

  const plain = PLAIN[report.status] ?? {
    label: 'Received',
    detail: 'It is on the camp’s list.',
    tone: 'open' as const,
  };

  const toneClass =
    plain.tone === 'done' ? 'bg-green-muted-bg text-green-muted-text'
      : plain.tone === 'working' ? 'bg-amber-bg text-amber-text'
        : 'bg-cream-dark text-ink-soft';

  return (
    <div className="min-h-screen bg-paper w-full">
      <div className="bg-white border-b border-border px-5 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <CampCommandMark size={36} decorative className="flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest">Your report</p>
            <h1 className="text-[16px] font-bold text-ink leading-tight truncate">{report.camp_name}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-7 space-y-5">

        <div className="bg-white border border-border rounded-xl p-5">
          <div className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[12px] font-bold ${toneClass}`}>
            {plain.tone === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {plain.label}
          </div>

          <h2 className="text-[19px] font-bold text-ink leading-snug mt-3">{report.title}</h2>
          {report.location && (
            <p className="text-[13px] text-ink-faint mt-1">{report.location}</p>
          )}

          <p className="text-[14px] text-ink-soft leading-relaxed mt-3">{plain.detail}</p>

          <dl className="mt-4 pt-4 border-t border-border space-y-2 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Reported</dt>
              <dd className="text-ink text-right">
                {formatDate(report.reported_at)} · {relativeTime(report.reported_at)}
              </dd>
            </div>
            {report.resolved_at && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">Fixed</dt>
                <dd className="text-ink text-right">
                  {formatDate(report.resolved_at)} · {relativeTime(report.resolved_at)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/*
          Only replies a staff member deliberately marked visible to the reporter appear here.
          The work thread is a staff space and stays one; this is the part somebody chose to say
          out loud.
        */}
        {report.replies.length > 0 && (
          <div className="bg-white border border-border rounded-xl p-5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint uppercase tracking-widest mb-3">
              <MessageSquare className="w-3.5 h-3.5" />
              From the camp
            </p>
            <ul className="space-y-4">
              {report.replies.map((r, i) => (
                <li key={i} className="text-[14px] text-ink leading-relaxed">
                  <p className="whitespace-pre-wrap">{r.body}</p>
                  <p className="text-[12px] text-ink-faint mt-1">
                    {r.from ?? 'Camp staff'} · {relativeTime(r.at)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-center text-[12.5px] text-ink-faint leading-relaxed">
          Nothing here updates automatically — reopen this link any time to see where it stands.
        </p>
      </div>
    </div>
  );
}
