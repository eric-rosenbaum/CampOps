export type Role = 'doe' | 'facilities_manager' | 'maintenance_staff';

export interface User {
  id: string;
  name: string;
  role: Role;
  initials: string;
}

export type Priority = 'urgent' | 'high' | 'normal';

export type IssueStatus = 'unassigned' | 'assigned' | 'in_progress' | 'resolved';

export type ChecklistStatus = 'pending' | 'in_progress' | 'complete';

export type Location =
  | 'Waterfront'
  | 'Dining Hall'
  | 'Cabins'
  | 'Art Barn'
  | 'Aquatics'
  | 'Athletic Fields'
  | 'Main Lodge'
  | 'Health Center'
  | 'Other';

export type RecurringInterval = 'daily' | 'weekly' | 'monthly' | 'annually';

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  location: Location;
  priority: Priority;
  status: IssueStatus;
  assigneeId: string | null;
  reportedById: string;
  estimatedCostDisplay: string | null;
  estimatedCostValue: number | null;
  actualCost: number | null;
  photoUrl: string | null;
  dueDate: string | null;
  isRecurring: boolean;
  recurringInterval: RecurringInterval | null;
  createdAt: string;
  updatedAt: string;
  activityLog: ActivityEntry[];
}

export interface ChecklistTask {
  id: string;
  title: string;
  description: string;
  location: Location;
  priority: Priority;
  status: ChecklistStatus;
  assigneeId: string | null;
  phase: 'pre' | 'post';
  daysRelativeToOpening: number;
  dueDate: string | null;
  isRecurring: true;
  activityLog: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: string;
  name: string;
  openingDate: string;
  closingDate: string;
}
