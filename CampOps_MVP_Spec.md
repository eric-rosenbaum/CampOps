# CampOps — Desktop Web App MVP Spec
*Full specification for Claude Code. Build this entirely on the first pass.*

---

## 1. Project Overview

CampOps is a purpose-built operations hub for summer camp Directors of Operations (DOE) and Facilities Managers (FM). The MVP is the **Facilities & Maintenance module** — a system to log, assign, track, and resolve maintenance issues, plus a pre/post-camp recurring checklist system.

This is a **desktop web application only**. A separate Swift iOS app (not in scope here) will handle photo capture and share the same Supabase backend.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | React 18 + TypeScript | Strict mode enabled |
| Build tool | Vite | Default config |
| Styling | Tailwind CSS v3 | Config extends design tokens below |
| State | Zustand | One store per domain slice |
| Routing | React Router v6 | |
| Backend | Supabase | Postgres + Storage + Auth + Realtime |
| Icons | Lucide React | |
| Date handling | date-fns | |
| Forms | React Hook Form | |

---

## 3. Design System

Extend the existing HTML mockup's visual language exactly. All design tokens below must be configured in `tailwind.config.js`.

### Color palette

```js
colors: {
  forest:      { DEFAULT: '#1a2e1a', mid: '#2d4a2d', light: '#3d6b3d' },
  sage:        { DEFAULT: '#7aab6e', light: '#a8c99f' },
  cream:       { DEFAULT: '#f5f2eb', dark: '#ede9df' },
  amber:       { DEFAULT: '#c47d08', bg: '#fef5e4', text: '#7d4e00' },
  red:         { DEFAULT: '#c0392b', bg: '#fdecea' },
  'green-muted': { bg: '#eaf3e8', text: '#1e6b1e' },
  border:      '#d4cfc4',
}
```

### Typography
- Font families: `DM Sans` (body), `DM Mono` (monospace/numbers) — load from Google Fonts
- Font sizes: 10px labels, 11px meta, 12px secondary, 13px body, 14px card titles, 15px panel titles, 17–18px page titles, 28px stat numbers
- Weights: 400 regular, 500 medium, 600 semibold

### Spacing & shape
- Border radius: cards 10px, buttons 7px, modal 14px, pills 20px, tags 4px
- Card border-left accent: 3px, colored by priority
- Sidebar width: 224px (fixed)
- Detail panel width: 310px (fixed)
- Content padding: 24px vertical, 28px horizontal

---

## 4. Application Structure

```
src/
  main.tsx
  App.tsx                    # Router setup
  lib/
    supabase.ts              # Supabase client
    types.ts                 # All TypeScript interfaces
  store/
    issuesStore.ts
    checklistStore.ts
    uiStore.ts               # selected item, modal state, active filters
  components/
    layout/
      Sidebar.tsx
      Topbar.tsx
      Layout.tsx
    shared/
      StatCard.tsx
      PriorityBadge.tsx
      StatusBadge.tsx
      TagPill.tsx
      ActivityFeed.tsx
      Button.tsx
      Modal.tsx
      SearchInput.tsx
      FilterPill.tsx
  pages/
    Dashboard.tsx
    IssuesRepairs.tsx
    PrePostCamp.tsx
    MyTasks.tsx
```

---

## 5. Navigation & Routing

Sidebar is always visible. Routes:

| Path | Page | Nav section |
|---|---|---|
| `/` | Dashboard | Today |
| `/my-tasks` | My Tasks | Today |
| `/issues` | Issues & Repairs | Facilities |
| `/pre-post` | Pre/Post Camp | Facilities |

The sidebar must show the active route highlighted with: left border `sage`, background `rgba(122,171,110,0.14)`, text `sage-light`.

Sidebar footer always shows: "Pinecrest Summer Camp" / "Jordan M. — Ops Director"

---

## 6. Data Models

All interfaces live in `src/lib/types.ts`.

### Role
```ts
type Role = 'doe' | 'facilities_manager' | 'maintenance_staff';
```

### User
```ts
interface User {
  id: string;
  name: string;
  role: Role;
  initials: string;
}
```

Seed with these three users (no real auth for MVP — role is selected via a dropdown in the topbar or settings):
```ts
const SEED_USERS: User[] = [
  { id: 'u1', name: 'Jordan M.', role: 'doe', initials: 'JM' },
  { id: 'u2', name: 'Tom H.',    role: 'facilities_manager', initials: 'TH' },
  { id: 'u3', name: 'Dana K.',   role: 'maintenance_staff', initials: 'DK' },
  { id: 'u4', name: 'Mike L.',   role: 'maintenance_staff', initials: 'ML' },
];
```

### Priority
```ts
type Priority = 'urgent' | 'high' | 'normal';
```

Priority colors:
- urgent → red border-left + red dot
- high → amber border-left + amber dot
- normal → sage border-left + sage dot

### Status (Issues)
```ts
type IssueStatus = 'unassigned' | 'assigned' | 'in_progress' | 'resolved';
```

### Issue
```ts
interface Issue {
  id: string;
  title: string;
  description: string;
  location: Location;
  priority: Priority;
  status: IssueStatus;
  assigneeId: string | null;
  reportedById: string;
  estimatedCost: number | null;
  actualCost: number | null;
  photoUrl: string | null;
  dueDate: string | null;          // ISO date string
  isRecurring: boolean;
  recurringInterval: RecurringInterval | null;
  createdAt: string;               // ISO datetime
  updatedAt: string;
  activityLog: ActivityEntry[];
}
```

### ChecklistTask
```ts
interface ChecklistTask {
  id: string;
  title: string;
  description: string;
  location: Location;
  priority: Priority;
  status: ChecklistStatus;         // 'pending' | 'in_progress' | 'complete'
  assigneeId: string | null;
  phase: 'pre' | 'post';           // pre-camp or post-camp
  daysRelativeToOpening: number;   // negative = before opening, positive = after closing
  dueDate: string | null;          // computed from season opening date
  isRecurring: true;               // always true for checklist tasks
  activityLog: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
}
```

### ActivityEntry
```ts
interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;                  // human-readable string e.g. "Assigned to Tom H."
  timestamp: string;               // ISO datetime
}
```

### Location
```ts
type Location =
  | 'Waterfront'
  | 'Dining Hall'
  | 'Cabins'
  | 'Art Barn'
  | 'Aquatics'
  | 'Athletic Fields'
  | 'Main Lodge'
  | 'Health Center'
  | 'Other';
```

### RecurringInterval
```ts
type RecurringInterval = 'daily' | 'weekly' | 'monthly' | 'annually';
```

### Season
```ts
interface Season {
  id: string;
  name: string;                    // e.g. "Summer 2025"
  openingDate: string;             // ISO date — all pre-camp due dates computed from this
  closingDate: string;
}
```

---

## 7. State Management (Zustand)

### issuesStore
```ts
{
  issues: Issue[];
  selectedIssueId: string | null;
  filter: 'all' | 'urgent' | 'unassigned' | 'in_progress' | 'resolved';
  searchQuery: string;
  // actions
  setFilter: (f) => void;
  setSearch: (q) => void;
  selectIssue: (id) => void;
  addIssue: (issue) => void;
  updateIssue: (id, patch) => void;
  resolveIssue: (id, actualCost?) => void;
  addActivityEntry: (issueId, entry) => void;
  // computed (as selectors)
  filteredIssues: () => Issue[];
  urgentCount: () => number;
  openCount: () => number;
  resolvedCount: () => number;
  totalCosts: () => number;
}
```

### checklistStore
```ts
{
  tasks: ChecklistTask[];
  season: Season | null;
  activePhase: 'pre' | 'post';
  selectedTaskId: string | null;
  filter: 'all' | 'pending' | 'in_progress' | 'complete';
  // actions
  setSeason: (s) => void;
  setPhase: (p) => void;
  setFilter: (f) => void;
  selectTask: (id) => void;
  addTask: (task) => void;
  updateTask: (id, patch) => void;
  completeTask: (id) => void;
  addActivityEntry: (taskId, entry) => void;
  activateNewSeason: (openingDate, closingDate) => void; // resets statuses, recomputes due dates
  // computed
  filteredTasks: () => ChecklistTask[];
  completionPercent: () => number;  // overall
  completionByLocation: () => Record<Location, { total: number; complete: number }>;
}
```

### uiStore
```ts
{
  currentUserId: string;           // defaults to 'u1' (Jordan M., DOE)
  isLogIssueModalOpen: boolean;
  isLogTaskModalOpen: boolean;
  isSeasonModalOpen: boolean;
  openLogIssueModal: () => void;
  openLogTaskModal: () => void;
  openSeasonModal: () => void;
  closeAllModals: () => void;
  setCurrentUser: (id) => void;
}
```

---

## 8. Seed Data

Provide enough seed data to make every page feel real and usable. Seed in `src/lib/seedData.ts` and load into Zustand on app init.

### Issues seed (minimum 8 issues, varied statuses/priorities)
```ts
[
  {
    id: 'i1',
    title: 'Dock ramp — broken plank, safety hazard',
    description: 'Third plank from the end is cracked through. Campers using the dock for kayak launch this afternoon. Needs to be roped off or repaired before the 2pm activity block.',
    location: 'Waterfront',
    priority: 'urgent',
    status: 'assigned',
    assigneeId: 'u2',
    reportedById: 'u4',
    estimatedCost: 380,
    actualCost: null,
    photoUrl: null,
    dueDate: TODAY,
    isRecurring: false,
    recurringInterval: null,
    createdAt: TODAY_MINUS_2H,
    activityLog: [
      { id: 'a1', userId: 'u1', userName: 'Jordan M.', action: 'Assigned to Tom H. for repair', timestamp: TODAY_MINUS_1H },
      { id: 'a2', userId: 'u4', userName: 'Mike L.', action: 'Issue logged with photo attached', timestamp: TODAY_MINUS_2H },
    ],
  },
  {
    id: 'i2',
    title: 'Walk-in refrigerator not holding temperature',
    description: 'Temp reading 48°F, should be below 40°F. Compressor making intermittent clicking noise. Health code risk — food safety issue.',
    location: 'Dining Hall',
    priority: 'urgent',
    status: 'unassigned',
    assigneeId: null,
    reportedById: 'u3',
    estimatedCost: 900,   // mid of 600–1200 range for stored value; display as range in UI
    actualCost: null,
    dueDate: TODAY,
    activityLog: [...],
  },
  {
    id: 'i3',
    title: 'Cabin 7 — screen door off hinges',
    priority: 'high', status: 'assigned', assigneeId: 'u2',
    estimatedCost: 45, location: 'Cabins', ...
  },
  {
    id: 'i4',
    title: 'Art barn roof leak above supply storage',
    priority: 'high', status: 'assigned', assigneeId: null,   // vendor TBD
    estimatedCost: 1600, location: 'Art Barn', ...
  },
  {
    id: 'i5',
    title: 'Pool pump making unusual noise',
    priority: 'normal', status: 'in_progress', assigneeId: 'u2',
    estimatedCost: 200, location: 'Aquatics', ...
  },
  {
    id: 'i6',
    title: 'Main lodge — two light fixtures out',
    priority: 'normal', status: 'resolved', assigneeId: 'u2',
    estimatedCost: 30, actualCost: 28, location: 'Main Lodge', ...
  },
  {
    id: 'i7',
    title: 'Athletic field irrigation head broken',
    priority: 'normal', status: 'unassigned', assigneeId: null,
    estimatedCost: 120, location: 'Athletic Fields', ...
  },
  {
    id: 'i8',
    title: 'Health center — exam table padding torn',
    priority: 'high', status: 'in_progress', assigneeId: 'u2',
    estimatedCost: 85, location: 'Health Center', ...
  },
]
```

Fill all missing fields with realistic strings and ISO timestamps. Resolved issues count = 24 (add additional resolved items or derive the count).

### Checklist seed (minimum 12 tasks, mix of pre and post, varied completion)

Pre-camp examples:
- "Inspect all cabin beds and mattresses" — Cabins — priority high — daysRelativeToOpening: -21
- "Waterfront dock safety inspection" — Waterfront — urgent — daysRelativeToOpening: -14
- "Test all smoke and CO detectors" — Main Lodge — urgent — daysRelativeToOpening: -7
- "Deep clean dining hall kitchen equipment" — Dining Hall — high — daysRelativeToOpening: -10
- "Pool chemistry baseline and shock treatment" — Aquatics — urgent — daysRelativeToOpening: -5
- "Restock health center supplies" — Health Center — normal — daysRelativeToOpening: -3
- "Paint touch-up on cabin exteriors" — Cabins — normal — daysRelativeToOpening: -14
- "Athletic field line marking" — Athletic Fields — normal — daysRelativeToOpening: -2

Post-camp examples:
- "Drain and winterize pool" — Aquatics — high — daysRelativeToOpening: +3
- "Deep clean all cabins" — Cabins — high — daysRelativeToOpening: +2
- "Inventory and store athletic equipment" — Athletic Fields — normal — daysRelativeToOpening: +5
- "Roof and gutter inspection before winter" — Main Lodge — high — daysRelativeToOpening: +7

### Season seed
```ts
{ id: 's1', name: 'Summer 2025', openingDate: '2025-06-23', closingDate: '2025-07-18' }
```

---

## 9. Pages — Detailed Specs

---

### 9.1 Issues & Repairs (`/issues`)

**Layout**: 3-column — sidebar (fixed) | content area (flex-1, scrollable) | detail panel (310px fixed, right)

#### Topbar
- Title: "Issues & repairs"
- Subtitle: "Session 2 · Jun 23 – Jul 18 · {openCount} open issues"
- Right: "Export report" ghost button (no-op for MVP) + "+ Log issue" primary button (opens modal)

#### Stats row (4 cards)
| Stat | Value | Hint | Color |
|---|---|---|---|
| Urgent | urgentCount | "Needs action today" | red value |
| Open | openCount | "Assigned or pending" | default |
| Resolved | resolvedCount | "This session" | default |
| Repair costs | $totalCosts | "This session so far" | amber value |

Total costs = sum of `actualCost ?? estimatedCost` for all non-resolved issues + `actualCost` for resolved ones.

#### Filter bar
Pills: All | Urgent | Unassigned | In progress | Resolved
One active at a time. Right side: search input (filters by title and location, case-insensitive).

#### Issue list
Sorted: urgent first, then high, then normal. Within priority, unresolved before resolved. Within that, newest first.

Each card shows:
- Left accent border color by priority (red/amber/sage)
- Colored dot (red/amber/green)
- Title (bold, 14px)
- "Reported by {name} · {relative time}" (e.g. "2 hrs ago", "Yesterday", "Jun 21")
- Tags: location tag (always), status tag (open/assigned/in_progress/resolved), cost tag (if estimatedCost set, show "Est. $X" or "Est. $X–Y" for ranges; if resolved, show actual "$X")
- Right side: assignee name (red + "Unassigned" if null) + formatted date

Clicking a card selects it (ring outline, `box-shadow: 0 0 0 2px forest`) and populates the detail panel. First card is selected by default.

#### Detail panel (right, fixed 310px)
Shows details of selected issue. Sections:

**Header**
- Title
- "{location} · Logged {relative date} by {reporterName}"

**Status section**
- Priority: colored text (Urgent/High/Normal)
- Status: `<select>` dropdown — changing it updates store + appends activity log entry "Status changed to X by {currentUser}"
- Assigned to: name, or red "Unassigned" link-style text that opens reassign dropdown

**Description**
Full description text.

**Photo**
If `photoUrl` is set, show `<img>`. If null, show placeholder box "📷 No photo attached".

**Cost**
- Estimated: formatted dollar amount, or "—" if null
- Actual: formatted dollar amount, or "— pending resolution" in muted text

**Due date**
- Show formatted date, or "No due date set"

**Activity log**
Chronological list (newest first). Each entry: green dot + action text + "{userName} · {relative time}".

**Footer**
- "Mark resolved" primary button — opens a small inline form to enter actual cost, then resolves and appends activity log entry
- "Edit" ghost button — opens the same Log Issue modal pre-populated with this issue's data

---

### 9.2 Log Issue Modal

Opens on "+ Log issue" or "Edit". Full-screen overlay, centered modal (440px wide).

**Fields:**
| Field | Type | Required | Notes |
|---|---|---|---|
| Title | text input | yes | |
| Location | select | yes | all Location values |
| Priority | select | yes | Normal default |
| Description | textarea | no | |
| Assign to | select | no | Unassigned + all users |
| Due date | date input | no | |
| Cost estimate | text input | no | accepts "$380" or "600-1200" |
| Recurring | checkbox | no | if checked, show interval select: Daily/Weekly/Monthly/Annually |
| Photo | file input styled as upload zone | no | stores file reference; actual upload to Supabase Storage optional for MVP |

**On submit:**
1. Validate required fields
2. Create Issue object with `createdAt = now`, `status = assigneeId ? 'assigned' : 'unassigned'`
3. Append activity log entry: "Issue logged by {currentUser}"
4. If assignee set: append "Assigned to {assigneeName} by {currentUser}"
5. Add to store, close modal, select new issue

---

### 9.3 Pre/Post Camp (`/pre-post`)

**Layout**: Same 3-column as Issues & Repairs.

#### Topbar
- Title: "Pre/Post camp checklist"
- Subtitle: "{season.name} · Opening {formattedOpeningDate}"
- Right: "New season" ghost button (opens Season modal) + "+ Add task" primary button

#### Phase toggle
Prominent tab-style toggle directly below topbar, full width: **Pre-camp** | **Post-camp**
Active tab: forest background, white text. Inactive: ghost.

#### Progress section (unique to this page)
**Overall progress bar:**
```
Camp opening readiness        47% complete
[████████████░░░░░░░░░░░░░]   8 of 12 tasks complete
```
Bar: sage fill on cream background, full width, 8px height, rounded.

**By-location breakdown** (below bar, in a grid — 2 columns):
Each location that has tasks shows:
```
Waterfront    ████░░░  2/3
Aquatics      ██████░  3/3 ✓
Cabins        ██░░░░░  1/4
```
Only show locations that have tasks for the active phase.

#### Filter bar
Pills: All | Pending | In progress | Complete
Search input on right.

#### Task list
Same card structure as issues. Differences:
- No cost tags
- Show relative due date: "Due in 3 days", "Due today", "Overdue 2 days" (color overdue red)
- Show "Recurring annually" tag on all tasks (since all checklist tasks recur)

#### Detail panel
Same structure as Issues panel. Differences:
- No cost section
- Show "Phase: Pre-camp" or "Post-camp"
- Show "Recurs: Annually" as a row in status section
- Footer: "Mark complete" button instead of "Mark resolved"

#### Season modal ("New season")
Fields:
- Season name (text, e.g. "Summer 2026")
- Opening date (date picker)
- Closing date (date picker)

On submit: call `activateNewSeason(openingDate, closingDate)` which:
1. Recomputes `dueDate` for all tasks from `daysRelativeToOpening`
2. Resets all task statuses to 'pending'
3. Appends activity log entry "New season activated by {currentUser}"
4. Updates season in store

---

### 9.4 Dashboard (`/`)

**Layout**: 2-column — sidebar (fixed) | full content area (no detail panel)

#### Topbar
- Title: "Dashboard"
- Subtitle: "{season.name} · {today formatted}"

#### Stats row (6 cards, 3+3 or 2 rows of 3)
| Stat | Source |
|---|---|
| Urgent issues | issuesStore.urgentCount |
| Open issues | issuesStore.openCount |
| Resolved issues | issuesStore.resolvedCount |
| Pre-camp progress | checklistStore.completionPercent for phase=pre |
| Post-camp progress | checklistStore.completionPercent for phase=post |
| Repair costs | issuesStore.totalCosts |

#### Two-section layout below stats

**Left column (60%)**: "Open issues" — same card list as Issues page but limited to non-resolved, sorted by priority. Show max 5; "View all →" link to `/issues`.

**Right column (40%)**: 
- "Pre-camp tasks" mini-list — top 4 incomplete pre-camp tasks sorted by due date
- Progress bar (mini version matching the one on Pre/Post page)
- "View all →" link to `/pre-post`

---

### 9.5 My Tasks (`/my-tasks`)

**Layout**: 2-column — sidebar | content (no detail panel)

Filters issues and checklist tasks where `assigneeId === currentUserId`.

#### Topbar
- Title: "My tasks"
- Subtitle: "{currentUserName} · {X} tasks assigned"

#### Two sections with headers

**Section 1: My open issues** — issue cards (same component as Issues page, compact). Show all assigned to current user that are not resolved.

**Section 2: My checklist tasks** — task cards (same component as Pre/Post page, compact). Show all assigned to current user that are not complete.

Each section has its own "None assigned" empty state.

---

## 10. Shared Components

### StatCard
Props: `label`, `value`, `hint`, `variant?: 'default' | 'red' | 'amber'`
Value rendered in DM Mono 28px. Variant changes value color.

### PriorityBadge
Props: `priority: Priority`
Renders colored pill: urgent=red, high=amber, normal=sage.

### StatusBadge
Props: `status: IssueStatus | ChecklistStatus`
Color coding: unassigned=red, assigned=amber, in_progress=amber, resolved/complete=green.

### ActivityFeed
Props: `entries: ActivityEntry[]`
Renders chronological list with green dots, action text, relative timestamps.
Relative time logic:
- < 1 hour: "X mins ago"
- < 24 hours: "X hrs ago"
- Yesterday: "Yesterday"
- This week: day name "Monday"
- Older: "Jun 21"

### FilterPill
Props: `label`, `active`, `onClick`

### Modal
Wrapper: overlay, centered, 440px, close on backdrop click or Escape key.

---

## 11. Business Logic

### Permission rules (role-based, enforced in UI only for MVP)
| Action | DOE | FM | Staff |
|---|---|---|---|
| Create issue/task | ✓ | ✓ | ✗ |
| Assign to anyone | ✓ | ✓ | ✗ |
| Update status | ✓ | ✓ | ✓ |
| Add activity note | ✓ | ✓ | ✓ |
| Enter actual cost | ✓ | ✓ | ✗ |
| Activate new season | ✓ | ✓ | ✗ |
| Mark resolved/complete | ✓ | ✓ | ✓ |

For MVP, enforce by disabling UI controls based on `currentUserId`'s role. No server-side enforcement needed yet.

### Status transitions (Issues)
```
unassigned → assigned (when assignee set)
assigned → in_progress (manual)
in_progress → resolved (via "Mark resolved" button)
resolved → in_progress (reopen — "Reopen" button appears on resolved issues)
```
Every transition appends an ActivityEntry.

### Recurring issues
If `isRecurring: true` on an issue, when it is resolved, automatically create a new copy of the issue with:
- Same title, description, location, priority, assigneeId, estimatedCost, recurringInterval
- status: 'assigned' (or 'unassigned' if no assignee)
- createdAt: now
- Activity log: single entry "Auto-created from recurring issue"
- dueDate: computed from original dueDate + recurringInterval

### Cost display
- If `estimatedCost` stored as a number (e.g. 900), check if there's a corresponding range hint. For MVP, store cost as a string in the Issue to allow "600–1200" format, parse to number only for totals.
- Actually: store `estimatedCostDisplay: string | null` for display (e.g. "$380" or "$600–1,200") and `estimatedCostValue: number | null` for math.

---

## 12. Supabase Schema

Create these tables. Run migrations in `supabase/migrations/`.

```sql
-- users (simplified, no real auth)
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('doe', 'facilities_manager', 'maintenance_staff')),
  initials text not null
);

-- seasons
create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  opening_date date not null,
  closing_date date not null,
  created_at timestamptz default now()
);

-- issues
create table issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text not null,
  priority text not null check (priority in ('urgent', 'high', 'normal')),
  status text not null check (status in ('unassigned', 'assigned', 'in_progress', 'resolved')),
  assignee_id uuid references users(id),
  reported_by_id uuid references users(id),
  estimated_cost_display text,
  estimated_cost_value numeric,
  actual_cost numeric,
  photo_url text,
  due_date date,
  is_recurring boolean default false,
  recurring_interval text check (recurring_interval in ('daily', 'weekly', 'monthly', 'annually')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- issue_activity
create table issue_activity (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references issues(id) on delete cascade,
  user_id uuid references users(id),
  user_name text not null,
  action text not null,
  created_at timestamptz default now()
);

-- checklist_tasks
create table checklist_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text not null,
  priority text not null check (priority in ('urgent', 'high', 'normal')),
  status text not null check (status in ('pending', 'in_progress', 'complete')),
  assignee_id uuid references users(id),
  phase text not null check (phase in ('pre', 'post')),
  days_relative_to_opening integer not null,
  due_date date,
  is_recurring boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- checklist_activity
create table checklist_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references checklist_tasks(id) on delete cascade,
  user_id uuid references users(id),
  user_name text not null,
  action text not null,
  created_at timestamptz default now()
);
```

Enable Row Level Security but set permissive policies for MVP (all authenticated or anonymous reads/writes OK — real auth hardening is post-MVP).

---

## 13. Supabase Integration Notes

- Initialize client in `src/lib/supabase.ts` using env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- For MVP, stores can be seeded from `seedData.ts` on first load if DB is empty
- Use Supabase Realtime to subscribe to `issues` and `checklist_tasks` table changes — any insert/update should sync to the store automatically
- Photo uploads: accept file in modal, upload to Supabase Storage bucket `issue-photos`, store public URL in `photo_url`
- All DB operations should have try/catch with console.error for MVP (no toast/error UI required but nice to have)

---

## 14. Key Interaction Details

### Card selection
- Clicking any issue/task card selects it and highlights it with `box-shadow: 0 0 0 2px #1a2e1a`
- Detail panel updates immediately
- First item in filtered list is auto-selected on page load and filter change

### Filter behavior
- Filter pills and search work together (AND logic)
- Filter = "Urgent" shows only issues with priority='urgent'
- Filter = "Unassigned" shows only issues with status='unassigned'
- Filter = "In progress" shows only status='in_progress'
- Filter = "Resolved" shows only status='resolved'

### Relative timestamps
- Always show relative time on cards ("2 hrs ago", "Yesterday", "Jun 21")
- Detail panel header shows absolute date+time

### Empty states
Each filtered view should have a friendly empty state if no results:
- "No urgent issues right now 🌲" etc.

### Responsive behavior
This is desktop-only. Minimum supported width: 1100px. No mobile breakpoints needed.

---

## 15. File & Folder Conventions

- All components: PascalCase `.tsx` files
- All stores: camelCase `Store.ts` files
- Seed data: `src/lib/seedData.ts` — exports `SEED_ISSUES`, `SEED_TASKS`, `SEED_USERS`, `SEED_SEASON`
- Environment: `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Use absolute imports via `@/` alias (configure in `vite.config.ts` and `tsconfig.json`)

---

## 16. What NOT to Build (Post-MVP)

Do not build these — they are explicitly out of scope for this version:
- Real authentication / login flow
- Email or push notifications
- Vendor / contractor management
- Cost budget tracking and reporting
- Staff scheduling
- Incident log
- Export to PDF/CSV (button can exist, no-op is fine)
- Mobile responsive layout
- The Swift iOS app (separate project)

---

## 17. Definition of Done

The MVP is complete when:
1. All 4 routes render with real seed data
2. Issues can be logged via modal, assigned, status-changed, and resolved — with activity log updating on each action
3. Checklist tasks can be added, assigned, and marked complete — with progress bars updating live
4. Detail panel reflects selected item and is fully interactive
5. Dashboard shows live counts from both stores
6. My Tasks filters correctly by current user
7. New season flow resets checklist and recomputes due dates
8. Supabase is wired and data persists on page refresh
9. No TypeScript errors (`tsc --noEmit` passes)
10. Visual design matches the existing HTML mockup exactly — same fonts, colors, spacing, card structure, sidebar, and detail panel layout
