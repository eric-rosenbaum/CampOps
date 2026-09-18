/**
 * Activity history, read in the reader's language.
 *
 * `issue_activity.action` is stored as an English sentence ("Assigned to Maria by Eric"), and it
 * must stay that way: SQL reads it back with `ilike '%resolved%'` for the season review, and the
 * iOS app writes the same sentences. So translation happens here, at display time, by
 * recognising the sentence shapes the app writes and re-saying them. A sentence nobody taught
 * this file is shown as it was stored — English, but never wrong.
 *
 * OWNER: the shell/shared agent fills this in with every shape the web, iOS and SQL write.
 */
export function translateActivity(action: string): string {
  return action;
}
