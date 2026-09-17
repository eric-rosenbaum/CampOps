/**
 * Food requests: a program (Cooking Club, Canoe trips) asks the kitchen for food.
 *
 * Kept out of types.ts so the three prospect builds do not all append to the same file. Every
 * write goes through an RPC (see migration programs_can_ask_the_kitchen_for_food); these are the
 * read shapes.
 */

export type FoodRequestStatus =
  | 'submitted' | 'approved' | 'declined' | 'ready' | 'picked_up' | 'missed' | 'cancelled';

export type FoodLineState = 'ok' | 'changed' | 'unavailable';

export interface FoodProgram {
  id: string;
  campId: string;
  name: string;
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  color: string | null;
  /** The no-login link: /food/:requestToken */
  requestToken: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FoodRequest {
  id: string;
  campId: string;
  programId: string | null;
  requestedBy: string | null;
  requesterName: string;
  requesterEmail: string | null;
  requesterPhone: string | null;
  notifyBy: 'email' | 'text';
  source: 'app' | 'link';
  /** Camp-local calendar day, YYYY-MM-DD. */
  pickupDate: string;
  /** Camp-local wall-clock time, HH:MM. */
  pickupTime: string;
  purpose: string | null;
  headcount: number | null;
  status: FoodRequestStatus;
  /** Hours of notice, computed once at submit in the camp's time zone. */
  noticeHours: number;
  /** The cutoff in force when it was submitted. */
  cutoffHours: number;
  isLate: boolean;
  kitchenNote: string | null;
  changedByKitchen: boolean;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  pickedUpByName: string | null;
  missedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: 'requester' | 'kitchen' | null;
  statusToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface FoodRequestLine {
  id: string;
  requestId: string;
  campId: string;
  /** Null for a free-text line the kitchen has not linked to an item. */
  itemId: string | null;
  label: string;
  qtyRequested: number;
  unitLabel: string | null;
  unitInBase: number | null;
  qtyRequestedBase: number | null;
  qtyApproved: number | null;
  approvedUnitLabel: string | null;
  qtyApprovedBase: number | null;
  note: string | null;
  lineState: FoodLineState;
  /** Why the kitchen marked the line not available, or what to use instead. */
  kitchenReason: string | null;
  sortOrder: number;
}

export interface FoodRequestSettings {
  campId: string;
  cutoffHours: number;
  kitchenEmails: string[];
  pickupLocation: string | null;
}

/** What the request form sends, for both the signed-in and the no-login paths. */
export interface FoodRequestDraftLine {
  /** Set when picked from the kitchen's list; absent for a free-text line. */
  itemId?: string | null;
  label: string;
  qty: string;
  /** The item's unit when picked, or whatever the requester typed. */
  unitLabel: string;
  note?: string;
  /** What was typed in the amount box when it was more than a number ("enough for 2"). */
  qtyWords?: string;
}

export interface FoodRequestDraft {
  programId?: string | null;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  notifyBy: 'email' | 'text';
  pickupDate: string;
  pickupTime: string;
  purpose: string;
  headcount: string;
  lines: FoodRequestDraftLine[];
  /** What was typed for people when it was more than a number ("about 15"). */
  headcountWords?: string;
}

/** An item as the request form sees it: a name and a unit, never stock or price. */
export interface FoodFormItem {
  id: string;
  name: string;
  unit: string;
  category?: string | null;
}

/** A queued outbox row for one request, shown as "what they'll get". */
export interface FoodRequestMessage {
  id: string;
  ruleKey: string;
  recipientKind: string;
  toEmail: string;
  subject: string;
  bodyText: string | null;
  sendAfter: string;
  state: string;
  suppressedReason: string | null;
}
