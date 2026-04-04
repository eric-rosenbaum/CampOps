# CampOps — iOS Swift App Spec
*Full specification for Claude Code. This app lives in the same monorepo as the web app and shares the same Supabase backend. Build this entirely on the first pass.*

---

## 1. Project Overview

CampOps iOS is the field companion to the CampOps desktop web app. Its primary job is to let maintenance staff check their assigned tasks and update status from anywhere on camp, and to let the DOE or FM snap a photo of a problem and log an issue in under 30 seconds.

The web app is the command center. The iOS app is the field tool. They share the same Supabase database — any change made on mobile is immediately visible on desktop and vice versa.

**Primary users:**
- Maintenance staff — check their assigned tasks, update status, mark complete
- DOE / Facilities Manager — log new issues in the field with photos, monitor urgent issues

---

## 2. Monorepo Structure

The project is a single repository. This iOS app lives at `/ios/` alongside the web app at `/web/`.

```
campops/
  web/                          # React web app (separate spec)
  ios/
    CampOps.xcodeproj
    CampOps/
      App/
        CampOpsApp.swift
        ContentView.swift
      Models/
        Issue.swift
        ChecklistTask.swift
        User.swift
        Season.swift
        ActivityEntry.swift
        AppEnums.swift
      Services/
        SupabaseService.swift
        LocalStorageService.swift
        SyncService.swift
        PhotoService.swift
      ViewModels/
        HomeViewModel.swift
        IssueListViewModel.swift
        IssueDetailViewModel.swift
        LogIssueViewModel.swift
        MyTasksViewModel.swift
      Views/
        Home/
          HomeView.swift
          HomeStatsCard.swift
          UrgentIssueRow.swift
        Issues/
          IssueListView.swift
          IssueCard.swift
          IssueDetailView.swift
          IssueFilterBar.swift
        LogIssue/
          LogIssueView.swift
          PhotoCaptureView.swift
          LocationPickerView.swift
          PriorityPickerView.swift
          AssigneePickerView.swift
        MyTasks/
          MyTasksView.swift
          TaskRow.swift
        Shared/
          PriorityBadge.swift
          StatusBadge.swift
          ActivityFeedView.swift
          UserAvatarView.swift
          EmptyStateView.swift
          LoadingView.swift
      Resources/
        Assets.xcassets
        Info.plist
      Config/
        Supabase.plist          # SUPABASE_URL and SUPABASE_ANON_KEY (gitignored)
  supabase/
    migrations/                 # Shared — same schema used by both apps
  README.md
```

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | Swift 5.9+ | |
| UI framework | SwiftUI | iOS 16+ minimum deployment target |
| Backend | Supabase Swift SDK (`supabase-swift`) | Same project as web app |
| Local persistence | SwiftData | iOS 17+ — for offline queue |
| Image handling | PhotosUI + AVFoundation | Native camera and photo library |
| Async | Swift Concurrency (async/await) | No Combine |
| Package manager | Swift Package Manager | |

### Swift Package Dependencies

Add via SPM in Xcode:

```
https://github.com/supabase/supabase-swift  — branch: main
```

No other third-party dependencies. Use native SwiftUI and Foundation for everything else.

---

## 4. Design System

The iOS app uses the same brand identity as the web app — same colors, same camp-nature personality — adapted for native iOS conventions. Do not fight iOS conventions to match the web pixel-for-pixel. Match the brand, respect the platform.

### Color palette

Define all colors in `Assets.xcassets` as named colors, supporting both light and dark mode.

```swift
// Define these as Color extensions in a Colors.swift file
extension Color {
    // Brand
    static let forest      = Color("Forest")        // #1a2e1a
    static let forestMid   = Color("ForestMid")     // #2d4a2d
    static let sage        = Color("Sage")           // #7aab6e
    static let sageLight   = Color("SageLight")     // #a8c99f
    static let cream       = Color("Cream")          // #f5f2eb
    static let creamDark   = Color("CreamDark")     // #ede9df

    // Semantic
    static let priorityUrgent = Color("PriorityUrgent")  // #c0392b
    static let priorityHigh   = Color("PriorityHigh")    // #c47d08
    static let priorityNormal = Color("PriorityNormal")  // #7aab6e

    // Backgrounds
    static let urgentBg    = Color("UrgentBg")      // #fdecea
    static let amberBg     = Color("AmberBg")       // #fef5e4
    static let greenBg     = Color("GreenBg")       // #eaf3e8
}
```

Dark mode variants for each color:
- `forest` dark: `#a8c99f` (invert to light sage for dark backgrounds)
- `cream` dark: `#1c2b1c`
- `creamDark` dark: `#243824`
- Semantic colors stay roughly the same in dark mode, slightly brighter

### Typography

```swift
extension Font {
    static let campTitle    = Font.system(size: 20, weight: .semibold)
    static let campHeadline = Font.system(size: 17, weight: .semibold)
    static let campBody     = Font.system(size: 15, weight: .regular)
    static let campCaption  = Font.system(size: 13, weight: .regular)
    static let campMicro    = Font.system(size: 11, weight: .medium)
    static let campMono     = Font.system(size: 14, weight: .regular).monospaced()
}
```

### Spacing

Use these constants throughout:

```swift
enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
}
```

### Corner radius

```swift
enum Radius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let pill: CGFloat = 20
}
```

### Priority accent colors

Used for left-border strips on cards and dot indicators:
- `.urgent` → `Color.priorityUrgent`
- `.high` → `Color.priorityHigh`
- `.normal` → `Color.priorityNormal`

---

## 5. Data Models

These must be **exactly consistent** with the web app's TypeScript types and the Supabase schema. Column names in Supabase use `snake_case`; Swift models use `camelCase` with `CodingKeys` mapping.

### AppEnums.swift

```swift
enum UserRole: String, Codable {
    case doe = "doe"
    case facilitiesManager = "facilities_manager"
    case maintenanceStaff = "maintenance_staff"
}

enum Priority: String, Codable, CaseIterable {
    case urgent = "urgent"
    case high = "high"
    case normal = "normal"

    var displayName: String {
        switch self {
        case .urgent: return "Urgent"
        case .high: return "High"
        case .normal: return "Normal"
        }
    }

    var color: Color {
        switch self {
        case .urgent: return .priorityUrgent
        case .high: return .priorityHigh
        case .normal: return .priorityNormal
        }
    }
}

enum IssueStatus: String, Codable, CaseIterable {
    case unassigned = "unassigned"
    case assigned = "assigned"
    case inProgress = "in_progress"
    case resolved = "resolved"

    var displayName: String {
        switch self {
        case .unassigned: return "Unassigned"
        case .assigned: return "Assigned"
        case .inProgress: return "In progress"
        case .resolved: return "Resolved"
        }
    }
}

enum ChecklistStatus: String, Codable, CaseIterable {
    case pending = "pending"
    case inProgress = "in_progress"
    case complete = "complete"

    var displayName: String {
        switch self {
        case .pending: return "Pending"
        case .inProgress: return "In progress"
        case .complete: return "Complete"
        }
    }
}

enum CampLocation: String, Codable, CaseIterable {
    case waterfront = "Waterfront"
    case diningHall = "Dining Hall"
    case cabins = "Cabins"
    case artBarn = "Art Barn"
    case aquatics = "Aquatics"
    case athleticFields = "Athletic Fields"
    case mainLodge = "Main Lodge"
    case healthCenter = "Health Center"
    case other = "Other"
}

enum RecurringInterval: String, Codable {
    case daily = "daily"
    case weekly = "weekly"
    case monthly = "monthly"
    case annually = "annually"
}

enum ChecklistPhase: String, Codable {
    case pre = "pre"
    case post = "post"
}
```

### User.swift

```swift
struct CampUser: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let role: UserRole
    let initials: String

    // No CodingKeys needed — column names match
}
```

Seed users (same as web app — hardcoded for MVP, no auth):

```swift
extension CampUser {
    static let seedUsers: [CampUser] = [
        CampUser(id: "u1", name: "Jordan M.", role: .doe,               initials: "JM"),
        CampUser(id: "u2", name: "Tom H.",    role: .facilitiesManager, initials: "TH"),
        CampUser(id: "u3", name: "Dana K.",   role: .maintenanceStaff,  initials: "DK"),
        CampUser(id: "u4", name: "Mike L.",   role: .maintenanceStaff,  initials: "ML"),
    ]
}
```

### ActivityEntry.swift

```swift
struct ActivityEntry: Codable, Identifiable {
    let id: String
    let userId: String
    let userName: String
    let action: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId    = "user_id"
        case userName  = "user_name"
        case action
        case createdAt = "created_at"
    }
}
```

### Issue.swift

```swift
struct Issue: Codable, Identifiable {
    let id: String
    var title: String
    var description: String?
    var location: CampLocation
    var priority: Priority
    var status: IssueStatus
    var assigneeId: String?
    var reportedById: String
    var estimatedCostDisplay: String?
    var estimatedCostValue: Double?
    var actualCost: Double?
    var photoUrl: String?
    var dueDate: Date?
    var isRecurring: Bool
    var recurringInterval: RecurringInterval?
    var createdAt: Date
    var updatedAt: Date
    // Activity log fetched separately — not a column in issues table
    var activityLog: [ActivityEntry] = []

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case description
        case location
        case priority
        case status
        case assigneeId           = "assignee_id"
        case reportedById         = "reported_by_id"
        case estimatedCostDisplay = "estimated_cost_display"
        case estimatedCostValue   = "estimated_cost_value"
        case actualCost           = "actual_cost"
        case photoUrl             = "photo_url"
        case dueDate              = "due_date"
        case isRecurring          = "is_recurring"
        case recurringInterval    = "recurring_interval"
        case createdAt            = "created_at"
        case updatedAt            = "updated_at"
    }
}

// Computed helpers
extension Issue {
    var isOverdue: Bool {
        guard let due = dueDate, status != .resolved else { return false }
        return due < Date()
    }

    var isDueToday: Bool {
        guard let due = dueDate else { return false }
        return Calendar.current.isDateInToday(due)
    }

    var displayAssigneeName: String {
        // Resolved by ViewModel — look up name from users list
        assigneeId == nil ? "Unassigned" : ""
    }
}
```

### ChecklistTask.swift

```swift
struct ChecklistTask: Codable, Identifiable {
    let id: String
    var title: String
    var description: String?
    var location: CampLocation
    var priority: Priority
    var status: ChecklistStatus
    var assigneeId: String?
    var phase: ChecklistPhase
    var daysRelativeToOpening: Int
    var dueDate: Date?
    var isRecurring: Bool           // always true
    var createdAt: Date
    var updatedAt: Date
    var activityLog: [ActivityEntry] = []

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case description
        case location
        case priority
        case status
        case assigneeId             = "assignee_id"
        case phase
        case daysRelativeToOpening  = "days_relative_to_opening"
        case dueDate                = "due_date"
        case isRecurring            = "is_recurring"
        case createdAt              = "created_at"
        case updatedAt              = "updated_at"
    }
}
```

### Season.swift

```swift
struct Season: Codable, Identifiable {
    let id: String
    let name: String
    let openingDate: Date
    let closingDate: Date

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case openingDate = "opening_date"
        case closingDate = "closing_date"
    }
}
```

---

## 6. No-Auth User Selection

No login screen for MVP. The app launches directly into the main tab view.

A "current user" is stored in `UserDefaults` as a user ID string. On first launch it defaults to `"u1"` (Jordan M., DOE).

The user can switch their identity from the Profile tab (bottom tab bar, last tab). This screen shows a list of the 4 seed users with their name, role, and initials avatar. Tapping one sets them as the current user. This is for testing and validation only — real auth replaces this in a future version.

The current user ID drives:
- My Tasks filter (show only tasks assigned to currentUserId)
- Activity log attribution ("Assigned by Jordan M.")
- Permission rules (which actions are available in the UI)

---

## 7. Offline / Optimistic Local Storage

This is a critical feature. Camp properties frequently have spotty cell service.

### Strategy

**Optimistic updates**: Every user action (log issue, update status, add note, mark complete) is applied to the local in-memory state immediately, without waiting for the network. The user sees the change instantly.

**Offline queue**: Every action that requires a network write is also added to a persistent offline queue (stored in SwiftData). When network connectivity is restored, the queue is drained in order.

**Conflict resolution**: Last-write-wins. If a conflict occurs on sync, the server value wins and the local state is updated to match. For MVP, this is acceptable — true conflicts (two people editing the same record simultaneously) are rare.

### Implementation

#### OfflineQueue (SwiftData model)

```swift
@Model
class OfflineOperation {
    var id: String            // UUID
    var operationType: String // "create_issue" | "update_issue_status" |
                              // "update_task_status" | "add_activity" |
                              // "upload_photo" | "resolve_issue" | "complete_task"
    var payload: Data         // JSON-encoded operation data
    var createdAt: Date
    var retryCount: Int
    var lastError: String?

    init(id: String, operationType: String, payload: Data, createdAt: Date) {
        self.id = id
        self.operationType = operationType
        self.payload = payload
        self.createdAt = createdAt
        self.retryCount = 0
    }
}
```

#### SyncService.swift

```swift
// Responsibilities:
// 1. Monitor network reachability (use NWPathMonitor)
// 2. When online: drain OfflineOperation queue in FIFO order
// 3. On app foreground: trigger full data refresh from Supabase
// 4. Expose @Published var isOnline: Bool for UI indicators

class SyncService: ObservableObject {
    @Published var isOnline: Bool = true
    @Published var pendingOperationCount: Int = 0

    // Called by ViewModels after every local state mutation
    func enqueue(_ operation: OfflineOperation) { ... }

    // Called on connectivity restore and app foreground
    func drainQueue() async { ... }

    // Refreshes all data from Supabase into ViewModels
    func fullSync() async { ... }
}
```

#### Network indicator

Show a subtle banner at the top of the app when `isOnline == false`:
```
[ ⚠ No connection — changes will sync when back online ]
```
Banner uses amber background (`#fef5e4`), amber text (`#7d4e00`), 13pt font, dismisses automatically when connectivity restores.

#### What is queued vs. what requires connectivity

| Action | Offline behavior |
|---|---|
| Log new issue (no photo) | Queue → show in list immediately |
| Log new issue (with photo) | Queue photo upload separately; show issue immediately with `photoUrl: nil` |
| Update issue status | Queue → apply immediately |
| Update task status | Queue → apply immediately |
| Mark issue resolved | Queue → apply immediately |
| Mark task complete | Queue → apply immediately |
| Add activity note | Queue → show in feed immediately |
| Load issues list | Show cached data; indicate "last updated X" |
| Load task list | Show cached data |

#### Local cache

On successful Supabase fetch, persist results to `UserDefaults` as JSON-encoded arrays keyed by `"cached_issues"` and `"cached_tasks"`. On next app launch (before the first network response), load from cache so the app is never empty.

---

## 8. Supabase Integration

### Configuration

Store credentials in `CampOps/Config/Supabase.plist` (gitignored — add to `.gitignore`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
    <key>SUPABASE_URL</key>
    <string>https://your-project.supabase.co</string>
    <key>SUPABASE_ANON_KEY</key>
    <string>your-anon-key</string>
</dict>
</plist>
```

### SupabaseService.swift

```swift
// Singleton. Initialized once in CampOpsApp.swift.
// Exposes typed async functions for all DB operations.

class SupabaseService {
    static let shared = SupabaseService()
    private let client: SupabaseClient

    // MARK: — Issues
    func fetchAllIssues() async throws -> [Issue]
    func fetchIssue(id: String) async throws -> Issue
    func createIssue(_ issue: Issue) async throws -> Issue
    func updateIssueStatus(id: String, status: IssueStatus, updatedAt: Date) async throws
    func resolveIssue(id: String, actualCost: Double?, updatedAt: Date) async throws
    func fetchActivityLog(issueId: String) async throws -> [ActivityEntry]
    func addActivityEntry(issueId: String, entry: ActivityEntry) async throws

    // MARK: — Checklist Tasks
    func fetchAllTasks() async throws -> [ChecklistTask]
    func updateTaskStatus(id: String, status: ChecklistStatus, updatedAt: Date) async throws
    func completeTask(id: String, updatedAt: Date) async throws
    func fetchTaskActivityLog(taskId: String) async throws -> [ActivityEntry]
    func addTaskActivityEntry(taskId: String, entry: ActivityEntry) async throws

    // MARK: — Photos
    func uploadPhoto(imageData: Data, issueId: String) async throws -> String  // returns public URL

    // MARK: — Users
    func fetchUsers() async throws -> [CampUser]

    // MARK: — Season
    func fetchCurrentSeason() async throws -> Season?
}
```

All functions use `async throws`. Call sites use `do/catch` in ViewModels. Never call Supabase directly from Views.

### Realtime subscriptions

Subscribe to `issues` and `checklist_tasks` table changes on app launch. When a change arrives (insert or update from the web app or another device), update the in-memory arrays in the relevant ViewModel.

```swift
// In IssueListViewModel.init():
supabase.channel("issues")
    .on(.postgresChanges, filter: .init(event: .all, schema: "public", table: "issues")) { payload in
        await self.handleRemoteChange(payload)
    }
    .subscribe()
```

---

## 9. ViewModels

All ViewModels are `@MainActor` classes conforming to `ObservableObject`. They own the in-memory state and coordinate between `SupabaseService` and `SyncService`.

### HomeViewModel

```swift
@MainActor class HomeViewModel: ObservableObject {
    @Published var urgentIssues: [Issue] = []
    @Published var myTasksToday: [Issue] = []         // issues assigned to currentUser due today
    @Published var myChecklistTasks: [ChecklistTask] = []  // tasks assigned to currentUser
    @Published var isLoading: Bool = false
    @Published var currentUser: CampUser = .seedUsers[0]

    // Stats (derived from full data, not just what's shown)
    @Published var urgentCount: Int = 0
    @Published var openCount: Int = 0
    @Published var preCompletionPercent: Double = 0.0

    func load() async { ... }
    func refreshCurrentUser() { ... }   // re-reads from UserDefaults
}
```

### IssueListViewModel

```swift
@MainActor class IssueListViewModel: ObservableObject {
    @Published var allIssues: [Issue] = []
    @Published var selectedFilter: IssueFilter = .all
    @Published var searchQuery: String = ""
    @Published var isLoading: Bool = false

    enum IssueFilter: String, CaseIterable {
        case all, urgent, unassigned, inProgress, resolved
        var displayName: String { ... }
    }

    var filteredIssues: [Issue] {
        // apply selectedFilter and searchQuery to allIssues
        // sort: urgent first, then high, then normal
        // within priority: unresolved before resolved, newest first
    }

    func load() async { ... }
    func updateStatus(issueId: String, newStatus: IssueStatus) async { ... }
}
```

### IssueDetailViewModel

```swift
@MainActor class IssueDetailViewModel: ObservableObject {
    @Published var issue: Issue
    @Published var activityLog: [ActivityEntry] = []
    @Published var isLoadingActivity: Bool = false
    @Published var isSaving: Bool = false
    @Published var resolveSheetVisible: Bool = false
    @Published var actualCostInput: String = ""

    init(issue: Issue) { ... }

    func loadActivity() async { ... }
    func updateStatus(_ status: IssueStatus) async { ... }
    func resolve(actualCost: Double?) async { ... }
    func addNote(_ text: String) async { ... }
    func assignTo(userId: String?) async { ... }
}
```

### LogIssueViewModel

```swift
@MainActor class LogIssueViewModel: ObservableObject {
    // Form state
    @Published var title: String = ""
    @Published var descriptionText: String = ""
    @Published var location: CampLocation = .other
    @Published var priority: Priority = .normal
    @Published var assigneeId: String? = nil
    @Published var capturedImage: UIImage? = nil
    @Published var photoSource: PhotoSource = .none

    // Submission state
    @Published var isSubmitting: Bool = false
    @Published var submitSuccess: Bool = false
    @Published var submitError: String? = nil

    enum PhotoSource { case none, camera, library }

    var isValid: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty && location != .other }

    func submit(reportedById: String) async { ... }
    // Creates Issue, queues offline operation if needed, uploads photo separately
}
```

### MyTasksViewModel

```swift
@MainActor class MyTasksViewModel: ObservableObject {
    @Published var myIssues: [Issue] = []
    @Published var myChecklistTasks: [ChecklistTask] = []
    @Published var isLoading: Bool = false

    // Loads all issues and tasks where assigneeId == currentUserId
    func load(userId: String) async { ... }
    func updateIssueStatus(_ issueId: String, status: IssueStatus) async { ... }
    func updateTaskStatus(_ taskId: String, status: ChecklistStatus) async { ... }
}
```

---

## 10. Screens — Detailed Specs

---

### 10.1 Root / Tab Structure

`ContentView.swift` renders a `TabView` with 4 tabs. No splash screen. App opens directly to Home tab.

```swift
TabView(selection: $selectedTab) {
    HomeView()
        .tabItem { Label("Home", systemImage: "house.fill") }
        .tag(0)
    LogIssueView()
        .tabItem { Label("Log Issue", systemImage: "plus.circle.fill") }
        .tag(1)
    MyTasksView()
        .tabItem { Label("My Tasks", systemImage: "checklist") }
        .tag(2)
    IssueListView()
        .tabItem { Label("Issues", systemImage: "list.bullet.clipboard") }
        .tag(3)
}
.tint(Color.sage)
```

Tab bar tint: `Color.sage`. Active tab icon and label in sage. Inactive in system gray.

The "Log Issue" tab item uses `systemImage: "plus.circle.fill"` — make its icon slightly larger than the others by wrapping it in a custom `TabItem` view that applies `.imageScale(.large)`.

---

### 10.2 Home Screen

**ViewModel**: `HomeViewModel`

**Navigation title**: "Good morning, {firstName}" (use "morning/afternoon/evening" based on current hour). Large title style.

**Layout** (ScrollView, vertical):

#### Offline banner
If `syncService.isOnline == false`, show at very top:
```
[ ⚠ No connection — changes will sync when back online ]
```
Amber background, `Color.priorityHigh` text, 13pt, full width, 12pt vertical padding. Animates in/out.

#### Stats row
Three `HomeStatCard` cards in an `HStack`, equal width, scrollable horizontally if needed:

| Card | Value | Color |
|---|---|---|
| Urgent | urgentCount | Red |
| Open issues | openCount | Default |
| Pre-camp progress | "\(preCompletionPercent)%" | Sage |

`HomeStatCard` design:
- White background, 12pt corner radius, subtle shadow (`Color.black.opacity(0.06), radius: 4, y: 2`)
- Label: 11pt, medium weight, all-caps, muted text color
- Value: 28pt, monospaced, bold
- Padding: 16pt

#### Section: "My tasks today"
Section header: "My tasks today" (17pt semibold) + count badge (sage background, white text, pill shape).

If `myTasksToday` is empty, show `EmptyStateView` with text "Nothing due today 🌲".

Otherwise show a list of `TaskRow` items (see component spec). Each row has a quick status-change button — tapping the circle toggles between `assigned` → `in_progress` → `resolved` with haptic feedback.

Tapping anywhere else on the row navigates to `IssueDetailView`.

#### Section: "Urgent issues"
Section header: "Urgent" in red, 15pt semibold.

Shows up to 3 most recent urgent, unresolved issues as `UrgentIssueRow` cards. Each card:
- Left red accent strip (3pt wide)
- Title (15pt semibold)
- Location + assignee name (13pt muted)
- "Unassigned" in red if no assignee
- Tap → `IssueDetailView`

If no urgent issues: hide this section entirely (don't show an empty state — just omit the section).

---

### 10.3 Log Issue Screen

**ViewModel**: `LogIssueViewModel`

**Navigation title**: "Log issue"

This is the most important screen. Design for speed. A user should be able to complete this in under 30 seconds.

**Layout** (ScrollView with sticky bottom submit button):

#### Step 1 — Photo (top of form, full width)

A large tappable zone (200pt tall, full width, `Color.creamDark` background, 12pt radius, dashed border in `Color.sage`):
- If no photo: centered camera icon (`systemImage: "camera.fill"`, 32pt, sage color) + "Tap to add photo" caption below + two smaller buttons: "Take photo" and "Choose from library"
- If photo selected: show `Image(uiImage: capturedImage).scaledToFill()` clipped to the zone, with an "×" remove button in the top-right corner

Camera opens `UIImagePickerController` (wrapped in a `UIViewControllerRepresentable`). Library opens `PhotosPicker` from PhotosUI.

Compress image before storing: resize to max 1200px on longest side, JPEG quality 0.8.

#### Step 2 — Title

`TextField("What needs to be fixed?", text: $viewModel.title)`
Large, prominent. 17pt placeholder. Required — submit button disabled if empty.

#### Step 3 — Location

`LocationPickerView` — a horizontal scrolling row of tappable location chips (pill buttons):
```
[ Waterfront ] [ Dining Hall ] [ Cabins ] [ Art Barn ] [ Aquatics ] ...
```
Selected chip: forest background, white text. Unselected: creamDark background, forest text. 12pt text, 8pt horizontal padding, 6pt vertical padding, 20pt corner radius.

All `CampLocation` cases shown. Scroll horizontally if they don't fit.

#### Step 4 — Priority

`PriorityPickerView` — three large tappable cards side by side:
```
[ 🔴 Urgent ]  [ 🟡 High ]  [ 🟢 Normal ]
```
Each card: colored icon dot + label, equal width, 44pt tall, 10pt radius. Selected: colored border (2pt) + tinted background. Unselected: gray border.

#### Step 5 — Description (optional)

`TextEditor` with placeholder text "Add more detail (optional)". 80pt minimum height. Light gray background, 10pt radius.

Placeholder text implemented via `ZStack` overlay since `TextEditor` doesn't natively support placeholder.

#### Step 6 — Assign to (optional)

`AssigneePickerView` — shows a "Assign to someone" row that expands (or navigates to a sheet) showing the list of users with their initials avatar, name, and role. Tapping selects them. Shows "Unassigned" option at top.

Selected assignee shown as a pill: `[JM] Jordan M. ×`

#### Submit button (sticky at bottom)

Fixed at bottom of screen (not inside ScrollView). Primary button: forest background, white text, "Log issue", full width, 50pt tall, 12pt radius.

Shows `ProgressView` spinner when `isSubmitting == true`. Disabled and dimmed if `!viewModel.isValid`.

On success (`submitSuccess == true`): show a brief success toast ("Issue logged ✓"), reset form, switch to Issues tab.

---

### 10.4 My Tasks Screen

**ViewModel**: `MyTasksViewModel`

**Navigation title**: "My tasks"
**Subtitle**: shown as a smaller secondary title: "{currentUser.name}"

**Layout** (List):

Two sections:

**Section 1: "Open issues" ({count})**
All issues assigned to currentUser that are not resolved. Each row is a `TaskRow`.

**Section 2: "Checklist tasks" ({count})**
All checklist tasks assigned to currentUser that are not complete. Each row is a `TaskRow`.

Both sections show `EmptyStateView` ("Nothing here 🌲") if empty.

#### TaskRow component

```
| ● | Title                          | STATUS BUTTON |
|   | Location · Due date info        |               |
```

- Left colored dot (priority color, 10pt diameter)
- Title: 15pt semibold
- Subtitle: location + due date hint (e.g. "Waterfront · Due today", "Cabins · Overdue 2 days" in red)
- Right: status button — a rounded rect button that shows current status and taps to advance it:
  - `assigned` → tapping sets `in_progress`
  - `in_progress` → tapping sets `resolved` (for issues) or `complete` (for tasks)
  - Shows confirmation action sheet before marking resolved/complete
- Tap on row body → navigate to detail

Swipe actions (trailing):
- "Resolve" / "Complete" — green, advances to final status
- Available only for issues/tasks in `in_progress` or `assigned` state

---

### 10.5 Issue List Screen

**ViewModel**: `IssueListViewModel`

**Navigation title**: "Issues & repairs"

**Toolbar**: search icon (opens inline search bar). No "+ Log issue" button here — that's the dedicated tab.

**Filter bar**: horizontally scrolling row of pills below nav bar:
```
[ All ] [ Urgent ] [ Unassigned ] [ In progress ] [ Resolved ]
```
Same pill style as Log Issue location picker. `All` selected by default.

**List**: Each row is an `IssueCard`.

#### IssueCard component

```
|███| Title                           [ PRIORITY BADGE ]
|   | Location · Reported X ago
|   | [ Status badge ] [ Assignee ]
```

- 3pt left accent strip (priority color)
- Title: 15pt semibold, 2 lines max then truncated
- Meta: location + relative time, 13pt muted
- Bottom row: `StatusBadge` + assignee name (or "Unassigned" in red)
- `PriorityBadge` top-right: small pill, colored background
- White card background, 10pt radius, subtle shadow
- 12pt padding inside card, 8pt between cards

Tap → `IssueDetailView` (pushed onto nav stack).

---

### 10.6 Issue Detail Screen

**ViewModel**: `IssueDetailViewModel`

**Navigation title**: issue title (truncated to 1 line)

**Layout** (ScrollView):

#### Header section
- Full-width photo (`AsyncImage` from `photoUrl`, 220pt tall, `scaledToFill`, 0pt corner radius — edge to edge). If no photo, show placeholder with camera icon and "No photo" label.
- Below photo: priority badge + status badge in an HStack

#### Info section (card-style container)
```
Priority        [Urgent ●]
Status          [In progress ▾]    ← tappable dropdown
Assigned to     [Tom H.]           ← tappable, opens assignee picker sheet
Location        Waterfront
Reported by     Mike L.
Logged          Today at 7:12am
Due             Today
```

Status row: tapping opens an action sheet with all valid next statuses.
Assigned to row: tapping opens a sheet with the user list.

Both actions:
1. Apply optimistically to local state
2. Append activity log entry
3. Enqueue to SyncService

#### Description section
Show description text (15pt, 1.4 line spacing) or "No description" in muted text.

#### Cost section (read-only on mobile)
```
Estimated   $380
Actual      — pending resolution
```
Note: "Cost entry available on desktop" in 12pt muted text below. Do not allow cost editing on mobile.

#### "Mark resolved" button
Only visible if status is not `resolved`.
Tapping opens a bottom sheet:
```
Mark as resolved?
[ Actual cost: _________ ] (optional, numeric keyboard)
[ Mark resolved ]  [ Cancel ]
```
On confirm: resolve issue, append "Resolved by {currentUser}" to activity log, enqueue.

#### "Add note" row
Text field at bottom of scroll view: "Add a note to this issue..."
Keyboard toolbar with "Post" button. On post: append activity entry with the note text, enqueue.

#### Activity log section
"Activity" section header (13pt, semibold, muted).
Chronological list (newest first). Each entry:
- Small sage dot
- Action text (13pt)
- "{userName} · {relativeTime}" (11pt muted)

---

### 10.7 Profile / Settings Screen

Accessible from a person icon button (`systemImage: "person.circle"`) in the Home screen's navigation bar (`.toolbar`).

Presented as a sheet.

**Title**: "Who are you?"
**Subtitle**: "Select your role for this session" (13pt muted)

A list of the 4 seed users, each row:
```
[ JM ]  Jordan M.             ✓  (if selected)
        Director of Operations
```

Initials avatar: 36pt circle, forest background, white initials, 13pt medium font.

Tapping a row: saves `userId` to `UserDefaults.standard.set(userId, forKey: "currentUserId")`, dismisses sheet, all ViewModels refresh.

---

## 11. Shared Components

### PriorityBadge.swift
```swift
struct PriorityBadge: View {
    let priority: Priority
    // Renders: colored dot + text in a pill
    // urgent: red bg (#fdecea), red text, "Urgent"
    // high: amber bg (#fef5e4), amber text, "High"
    // normal: green bg (#eaf3e8), sage text, "Normal"
    // Font: 11pt medium, all-caps
}
```

### StatusBadge.swift
```swift
struct StatusBadge: View {
    let status: IssueStatus  // or ChecklistStatus — make generic or two components
    // unassigned: red bg, "Unassigned"
    // assigned: amber bg, "Assigned"
    // in_progress: amber bg, "In progress"
    // resolved/complete: green bg, green text
}
```

### ActivityFeedView.swift
```swift
struct ActivityFeedView: View {
    let entries: [ActivityEntry]
    // Vertical list of entries, newest first
    // Each: sage dot + action text + relative time
}
```

### UserAvatarView.swift
```swift
struct UserAvatarView: View {
    let user: CampUser
    let size: CGFloat  // default 32
    // Circle, forest background, white initials
}
```

### EmptyStateView.swift
```swift
struct EmptyStateView: View {
    let message: String  // e.g. "Nothing due today 🌲"
    // Centered, muted text, 15pt
}
```

### RelativeTime helper

```swift
extension Date {
    var relativeDisplay: String {
        // < 1 min: "just now"
        // < 60 min: "X mins ago"
        // < 24 hrs: "X hrs ago"
        // yesterday: "Yesterday"
        // this week: day name "Monday"
        // older: "Jun 21"
    }
}
```

---

## 12. Permission Rules (UI enforcement only)

Same roles as web app. Enforced by hiding/disabling UI elements based on `currentUser.role`. No server-side enforcement in MVP.

| Action | DOE | FM | Staff |
|---|---|---|---|
| Log new issue | ✓ | ✓ | ✗ — hide Log Issue tab |
| Assign to others | ✓ | ✓ | ✗ — hide assignee picker |
| Update status | ✓ | ✓ | ✓ |
| Add activity note | ✓ | ✓ | ✓ |
| Mark resolved/complete | ✓ | ✓ | ✓ |
| View all issues | ✓ | ✓ | ✗ — hide Issues tab |

For maintenance staff:
- Tab bar shows only: Home, My Tasks, Profile
- Log Issue tab and Issues tab are hidden
- On IssueDetailView reached from My Tasks, hide assignee picker and cost section

Implement with a `currentUser.role` check in `ContentView` that conditionally renders tab items.

---

## 13. Business Logic

### Activity log entries

Every state change must append an activity entry. Use this format:

| Action | Entry text |
|---|---|
| Status changed | "Status changed to In progress" |
| Assigned | "Assigned to Tom H." |
| Unassigned | "Unassigned by Jordan M." |
| Resolved | "Resolved by Jordan M." |
| Note added | The note text verbatim |
| Issue logged | "Issue logged by Mike L." |

Activity entries are written to the `issue_activity` or `checklist_activity` table in Supabase. They are also enqueued in the offline queue if offline.

### Status transitions

Issues:
```
unassigned → assigned (when assignee is set)
assigned ↔ in_progress (manual toggle)
in_progress → resolved (via resolve action)
resolved → in_progress (reopen — show "Reopen" button on resolved issues)
```

Checklist tasks:
```
pending → in_progress → complete
complete → in_progress (reopen)
```

### Recurring issues

When a recurring issue is resolved on mobile, the ViewModel checks `issue.isRecurring`. If true, after writing the resolution to Supabase, create a new Issue with:
- Same title, description, location, priority, assigneeId, estimatedCostDisplay, estimatedCostValue, recurringInterval
- `status`: `assigned` if assigneeId is set, else `unassigned`
- `createdAt`: now
- `actualCost`: nil
- `activityLog`: single entry "Auto-created from recurring issue by system"
- `dueDate`: computed from original dueDate + recurringInterval (e.g. annually = +1 year)

Enqueue this creation in the offline queue the same way as any new issue.

---

## 14. Data Sync with Web App

The iOS app and web app share the exact same Supabase tables. They must never conflict on schema.

### Shared schema reference

Both apps use the schema defined in `/supabase/migrations/` at the monorepo root. Do not duplicate schema definitions. The iOS app's `CodingKeys` must exactly match the column names in those migrations.

### Field name mapping (Supabase column → Swift property)

| Supabase column | Swift property |
|---|---|
| `assignee_id` | `assigneeId` |
| `reported_by_id` | `reportedById` |
| `estimated_cost_display` | `estimatedCostDisplay` |
| `estimated_cost_value` | `estimatedCostValue` |
| `actual_cost` | `actualCost` |
| `photo_url` | `photoUrl` |
| `due_date` | `dueDate` |
| `is_recurring` | `isRecurring` |
| `recurring_interval` | `recurringInterval` |
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |
| `days_relative_to_opening` | `daysRelativeToOpening` |
| `user_id` | `userId` |
| `user_name` | `userName` |
| `issue_id` | `issueId` |
| `task_id` | `taskId` |

### Photo storage

Photos upload to Supabase Storage bucket `issue-photos`. File path: `{issueId}/{UUID}.jpg`. After upload, the returned public URL is written to `issues.photo_url`. The web app reads this URL and renders it in the detail panel — no additional work needed on the web side.

---

## 15. Info.plist Required Keys

```xml
<!-- Camera access -->
<key>NSCameraUsageDescription</key>
<string>CampOps uses the camera to photograph maintenance issues.</string>

<!-- Photo library access -->
<key>NSPhotoLibraryUsageDescription</key>
<string>CampOps accesses your photo library to attach images to maintenance issues.</string>
```

---

## 16. Seed Data on First Launch

On first app launch (check `UserDefaults` for `"hasSeededData"` key), call `SupabaseService.shared.fetchAllIssues()`. If the response is empty, insert seed data.

Seed data for the iOS app is the same as the web app's seed data — defined in `/supabase/seeds/seed.sql` at the monorepo root. Both apps reference this. Do not hardcode seed data in Swift — rely on what's already in Supabase from the web app's seeding.

If the web app has already been run and seeded the database, the iOS app will simply fetch and display that data. The `"hasSeededData"` check is a safeguard to avoid double-seeding.

---

## 17. Monorepo Consistency Rules

These rules ensure both apps stay in sync with the database as the schema evolves:

1. **All schema changes go in `/supabase/migrations/`** — never alter the schema from the web app's TypeScript or the iOS app's Swift directly.

2. **Enum values must match exactly** — `Priority`, `IssueStatus`, `ChecklistStatus`, `CampLocation`, `RecurringInterval`, `ChecklistPhase` raw values in Swift must be byte-for-byte identical to the string values stored in Postgres and used in the TypeScript types.

3. **`updatedAt` must be set on every write** — both apps must write the current timestamp to `updated_at` on every update. This is the conflict resolution key.

4. **Activity log is append-only** — neither app ever deletes or edits activity entries. Only insert.

5. **IDs are UUIDs** — both apps generate UUIDs for new records client-side (using `UUID().uuidString` in Swift, `crypto.randomUUID()` in TypeScript). This allows offline creation without waiting for a server-assigned ID.

6. **Photo bucket name is `issue-photos`** — hardcoded in both apps. If it changes, update both.

---

## 18. Definition of Done

The iOS MVP is complete when:

1. App launches directly to Home tab with real data from Supabase
2. A DOE/FM user can log an issue with a photo in under 30 seconds
3. A staff user sees only their assigned tasks in My Tasks
4. Status changes made on iOS appear on the desktop web app within 5 seconds (Realtime)
5. Status changes made on the desktop web app appear on iOS within 5 seconds (Realtime)
6. App works with no network connection — shows cached data and queues writes
7. Queued writes sync correctly when connectivity restores
8. Offline banner appears and disappears correctly
9. Role-based UI rules are enforced (staff cannot see Issues tab or Log Issue tab)
10. All `CodingKeys` map correctly — no Supabase fetch returns decoding errors
11. Photos upload to Supabase Storage and display correctly on both iOS and web
12. Activity log entries appear on both platforms after any state change
13. No force-unwraps (`!`) in production code paths
14. Minimum deployment target iOS 16 — no iOS 17-only APIs except SwiftData (which is contained in `LocalStorageService.swift`)
