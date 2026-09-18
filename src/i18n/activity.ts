/**
 * Activity history, read in the reader's language.
 *
 * `issue_activity.action` is stored as an English sentence ("Assigned to Maria by Eric"), and it
 * must stay that way: SQL reads it back with `ilike '%resolved%'` for the season review, and the
 * iOS app writes the same sentences. So translation happens here, at display time, by
 * recognising the sentence shapes the app writes and re-saying them. A sentence nobody taught
 * this file is shown as it was stored — English, but never wrong.
 *
 * ── The shapes (iOS mirrors this table in Swift; keep the two in step) ─────────────────────
 * Tried in order, first match wins, every pattern anchored ^…$ against the trimmed sentence.
 * Captures are passed as {{variables}} unchanged (people, crews and vendors are the camp's own
 * words), except `status`, which is mapped back to `common:status.*` through STATUS_WORDS — an
 * unknown status word leaves the whole sentence as stored.
 *
 *   key              pattern                                                         written by
 *   resolvedByCost   Marked resolved by (?<name>.+), actual cost (?<cost>\$[\d,.]+)  web IssueDetail
 *   resolvedBy       Marked (?:resolved|complete) by (?<name>.+)                     web IssueDetail (+ old)
 *   resolvedCost     Resolved, actual cost (?<cost>\$[\d,.]+)                        iOS resolve
 *   resolved         Resolved                                                         iOS resolve
 *   statusChangedBy  Status changed to (?<status>.+?) by (?<name>.+)                 web IssueDetail
 *   statusChanged    Changed status to (?<status>.+)                                 iOS updateStatus
 *   assignedBy       Assigned to (?<assignee>.+?) by (?<name>.+)                     web LogIssueModal, WorkOrderDetail
 *   assigned         Assigned to (?<assignee>.+)                                     iOS assign, LogIssue
 *   handedBy         Handed to (?<crew>.+?) by (?<name>.+)                           web WorkOrderDetail (crew)
 *   sentToCrew       Sent to (?<crew>.+)                                             iOS assign(toCrew), LogIssue
 *   unassignedBy     Unassigned by (?<name>.+)                                       web
 *   unassigned       Unassigned                                                       iOS
 *   logged           (?:Issue |Task )?[Ll]ogged by (?<name>.+)                       web LogIssueModal (+ old)
 *   loggedThis       Logged (?:this|issue)                                            iOS LogIssue (+ old)
 *   edited           (?:Issue )?[Ee]dited by (?<name>.+)                             web LogIssueModal (+ old)
 *   editedDetails    Edited (?:the|issue|task) details                                iOS LogIssue (+ old)
 *   reopenedBy       Reopened by (?<name>.+)                                         web
 *   reopened         Reopened this                                                    iOS
 *   flagged          Flagged from Building Systems by (?<name>.+)                    web + iOS building
 *   autoRecurring    Auto-created from recurring issue                                web issuesStore
 *   addedTask        Added task                                                       old iOS
 *   clearedVendor    Cleared the vendor                                               iOS setVendor
 *   waitingOn        Waiting on (?<vendor>.+)                                        web + iOS vendor
 *   calledIn         Called in (?<vendor>.+)                                         iOS setVendor
 *   setStatus        (?<name>.+?) set this to (?<status>.+)                          web WorkOrderDetail
 *   markedDone       (?<name>.+?) marked this done                                   web WorkOrderDetail
 *   undidClose       (?<name>.+?) undid closing this                                 web WorkOrderDetail
 *   tookOn           (?<name>.+?) took this (?:on|issue|task)                        web Campground, iOS (+ old)
 *   putBack          (?<name>.+?) put this back                                      iOS IssueList
 *   unassignedSelf   (?<name>.+?) unassigned themselves                              old iOS
 *   removedVendor    (?<name>.+?) removed the vendor                                 web WorkOrderDetail
 *   vendorDid        (?<name>.+?) recorded that (?<vendor>.+) did this               web WorkOrderDetail
 *   sentToVendor     (?<name>.+?) sent this to (?<vendor>.+)                         web WorkOrderDetail
 *
 * SQL writes no sentences of its own (checked 2026-09-18 against staging's pg_proc: only
 * sync_push, which stores what the phone sent, and delete_my_account touch issue_activity).
 *
 * Writers: a status inside a sentence must be the ENGLISH word (`activityStatusWord`), never a
 * localized label — "Ana set this to en curso" is a row no other reader can translate.
 */
import i18n, { currentLang, type Lang } from './index';
import type { IssueStatus } from '@/lib/types';
import type activityEn from './locales/en/activity.json';

type Key = keyof typeof activityEn;

const SHAPES: { key: Key; re: RegExp }[] = [
  { key: 'resolvedByCost', re: /^Marked resolved by (?<name>.+), actual cost (?<cost>\$[\d,.]+)$/ },
  { key: 'resolvedBy', re: /^Marked (?:resolved|complete) by (?<name>.+)$/ },
  { key: 'resolvedCost', re: /^Resolved, actual cost (?<cost>\$[\d,.]+)$/ },
  { key: 'resolved', re: /^Resolved$/ },
  { key: 'statusChangedBy', re: /^Status changed to (?<status>.+?) by (?<name>.+)$/ },
  { key: 'statusChanged', re: /^Changed status to (?<status>.+)$/ },
  { key: 'assignedBy', re: /^Assigned to (?<assignee>.+?) by (?<name>.+)$/ },
  { key: 'assigned', re: /^Assigned to (?<assignee>.+)$/ },
  { key: 'handedBy', re: /^Handed to (?<crew>.+?) by (?<name>.+)$/ },
  { key: 'sentToCrew', re: /^Sent to (?<crew>.+)$/ },
  { key: 'unassignedBy', re: /^Unassigned by (?<name>.+)$/ },
  { key: 'unassigned', re: /^Unassigned$/ },
  { key: 'logged', re: /^(?:Issue |Task )?[Ll]ogged by (?<name>.+)$/ },
  { key: 'loggedThis', re: /^Logged (?:this|issue)$/ },
  { key: 'edited', re: /^(?:Issue )?[Ee]dited by (?<name>.+)$/ },
  { key: 'editedDetails', re: /^Edited (?:the|issue|task) details$/ },
  { key: 'reopenedBy', re: /^Reopened by (?<name>.+)$/ },
  { key: 'reopened', re: /^Reopened this$/ },
  { key: 'flagged', re: /^Flagged from Building Systems by (?<name>.+)$/ },
  { key: 'autoRecurring', re: /^Auto-created from recurring issue$/ },
  { key: 'addedTask', re: /^Added task$/ },
  { key: 'clearedVendor', re: /^Cleared the vendor$/ },
  { key: 'waitingOn', re: /^Waiting on (?<vendor>.+)$/ },
  { key: 'calledIn', re: /^Called in (?<vendor>.+)$/ },
  { key: 'setStatus', re: /^(?<name>.+?) set this to (?<status>.+)$/ },
  { key: 'markedDone', re: /^(?<name>.+?) marked this done$/ },
  { key: 'undidClose', re: /^(?<name>.+?) undid closing this$/ },
  { key: 'tookOn', re: /^(?<name>.+?) took this (?:on|issue|task)$/ },
  { key: 'putBack', re: /^(?<name>.+?) put this back$/ },
  { key: 'unassignedSelf', re: /^(?<name>.+?) unassigned themselves$/ },
  { key: 'removedVendor', re: /^(?<name>.+?) removed the vendor$/ },
  { key: 'vendorDid', re: /^(?<name>.+?) recorded that (?<vendor>.+) did this$/ },
  { key: 'sentToVendor', re: /^(?<name>.+?) sent this to (?<vendor>.+)$/ },
];

/**
 * Status words as they appear inside stored sentences, normalised (lower case, `_` → space).
 * Covers the raw enum, the web's old `replace('_', ' ')` (which only replaced the FIRST
 * underscore, so "waiting on_vendor"), the English labels on both platforms ("Done", "Waiting on
 * a part") and the older "Resolved".
 */
const STATUS_WORDS: Record<string, IssueStatus> = {
  unassigned: 'unassigned',
  assigned: 'assigned',
  'in progress': 'in_progress',
  'waiting on vendor': 'waiting_on_vendor',
  'waiting on a vendor': 'waiting_on_vendor',
  'waiting on part': 'waiting_on_part',
  'waiting on a part': 'waiting_on_part',
  done: 'resolved',
  resolved: 'resolved',
};

/** The English word a WRITER puts in a sentence for a status: stable, and readable back. */
const ENGLISH_STATUS: Record<IssueStatus, string> = {
  unassigned: 'unassigned',
  assigned: 'assigned',
  in_progress: 'in progress',
  waiting_on_vendor: 'waiting on vendor',
  waiting_on_part: 'waiting on a part',
  resolved: 'done',
};

export function activityStatusWord(status: IssueStatus): string {
  return ENGLISH_STATUS[status];
}

function statusKey(word: string): IssueStatus | null {
  const norm = word.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
  return STATUS_WORDS[norm] ?? null;
}

/**
 * The stored sentence in `lang` (default: the interface language). English is returned exactly
 * as stored — it already is English, and rewording it would make the history disagree with what
 * the phone and the database say.
 */
export function translateActivity(action: string, lang: Lang = currentLang()): string {
  if (lang === 'en' || !action) return action;
  const text = action.trim();
  for (const { key, re } of SHAPES) {
    const m = re.exec(text);
    if (!m) continue;
    const vars: Record<string, string> = { ...(m.groups ?? {}) };
    if (vars.status !== undefined) {
      const s = statusKey(vars.status);
      if (!s) return action;
      vars.status = i18n.getFixedT(lang, 'common')(`status.${s}`);
    }
    // Keys come from the typed SHAPES table; the loose signature is only for the variables.
    const say = i18n.getFixedT(lang, 'activity') as unknown as (k: Key, v: Record<string, string>) => string;
    return say(key, vars);
  }
  return action;
}
