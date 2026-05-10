import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';
import type { CampRole, StaffGroupModules } from '@/store/campStore';

// ─── Permission definitions ────────────────────────────────────────────────

const ROLE_PERMISSIONS = {
  viewAll:              ['admin', 'staff', 'viewer'] as CampRole[],
  createIssue:          ['admin', 'staff'] as CampRole[],
  updateIssue:          ['admin', 'staff'] as CampRole[],
  createTask:           ['admin', 'staff'] as CampRole[],
  updateTask:           ['admin', 'staff'] as CampRole[],
  assign:               ['admin', 'staff'] as CampRole[],
  updateStatus:         ['admin', 'staff'] as CampRole[],
  markResolved:         ['admin', 'staff'] as CampRole[],
  markComplete:         ['admin', 'staff'] as CampRole[],
  logChemicalReading:   ['admin', 'staff'] as CampRole[],
  managePool:           ['admin', 'staff'] as CampRole[],
  managePoolChecklist:  ['admin', 'staff'] as CampRole[],
  logSafetyInspection:  ['admin', 'staff'] as CampRole[],
  manageSafetyItems:    ['admin', 'staff'] as CampRole[],
  manageAssets:         ['admin', 'staff'] as CampRole[],
  enterActualCost:      ['admin'] as CampRole[],
  activateNewSeason:    ['admin'] as CampRole[],
  manageSafetyStaff:    ['admin'] as CampRole[],
  manageSafetyCerts:    ['admin'] as CampRole[],
  manageMembers:        ['admin'] as CampRole[],
  manageCampSettings:   ['admin'] as CampRole[],
};

export type Permission = keyof typeof ROLE_PERMISSIONS;

export const ROLE_LABELS: Record<CampRole, string> = {
  admin:  'Administrator',
  staff:  'Staff',
  viewer: 'Viewer',
};

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useAuth() {
  const { user, profile } = useAuthStore();
  const { currentMember, currentStaffGroup } = useCampStore();

  const fullName = profile?.fullName ?? user?.email ?? '';
  const initials = fullName
    .split(' ')
    .map((n) => n[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const currentUser = {
    id: user?.id ?? '',
    name: fullName,
    initials,
    email: user?.email ?? '',
  };

  const role: CampRole = currentMember?.role ?? 'viewer';

  function can(permission: Permission): boolean {
    return ROLE_PERMISSIONS[permission].includes(role);
  }

  // Returns true if the current user can access the given module.
  // Admins always have access. Staff with no group (legacy) have full access.
  // Viewers never have module access.
  function canAccessModule(module: keyof StaffGroupModules): boolean {
    if (role === 'admin') return true;
    if (role === 'viewer') return false;
    if (!currentStaffGroup) return true;
    return currentStaffGroup.modules[module] ?? false;
  }

  // Whether this user can see unassigned issues (in addition to their own).
  const issuesSeeUnassigned =
    role !== 'staff' || !currentStaffGroup || currentStaffGroup.issuesSeeUnassigned;

  // Whether this user can see unassigned pre/post tasks (in addition to their own).
  const prepostSeeUnassigned =
    role !== 'staff' || !currentStaffGroup || currentStaffGroup.prepostSeeUnassigned;

  return {
    currentUser,
    role,
    department: currentMember?.department ?? null,
    staffGroup: currentStaffGroup,
    roleLabel: ROLE_LABELS[role],
    can,
    canAccessModule,
    issuesSeeUnassigned,
    prepostSeeUnassigned,
  };
}
