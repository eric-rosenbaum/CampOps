/**
 * The requests sent from this phone, remembered in localStorage so a counselor can find their way
 * back to one without digging through email. Before this the form's "Already asked" list showed
 * bare dates that could not be opened, and a request someone had cancelled or the kitchen declined
 * simply disappeared from it.
 *
 * Only this device's own status tokens are kept. Every access is wrapped: storage can be blocked
 * (private windows, some in-app browsers) and the form must work the same without it.
 */
const KEY = 'campcommand-food-requests-v1';
const MAX = 20;

export interface DeviceRequest {
  programToken: string;
  statusToken: string;
  sentAt: string;
}

function readAll(): DeviceRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((r): r is DeviceRequest => !!r && typeof r.programToken === 'string' && typeof r.statusToken === 'string')
      : [];
  } catch {
    return [];
  }
}

export function rememberDeviceRequest(programToken: string, statusToken: string, now: Date = new Date()) {
  try {
    const rest = readAll().filter((r) => r.statusToken !== statusToken);
    const next = [{ programToken, statusToken, sentAt: now.toISOString() }, ...rest].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage blocked: the status page link in the email still works */ }
}

/** Newest first, for one program's link. */
export function deviceRequestsFor(programToken: string): DeviceRequest[] {
  return readAll().filter((r) => r.programToken === programToken).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** A request the kitchen deleted (or a demo reset) no longer resolves; stop listing it. */
export function forgetDeviceRequest(statusToken: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readAll().filter((r) => r.statusToken !== statusToken)));
  } catch { /* storage blocked */ }
}
