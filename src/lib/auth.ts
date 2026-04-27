import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';
import type { CampRole } from '@/store/campStore';

// ─── Permission definitions ────────────────────────────────────────────────

const ROLE_PERMISSIONS = {
  // Any authenticated camp member
  viewAll:              ['admin', 'staff', 'viewer'] as CampRole[],
  // Staff + admin operations
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
  // Admin-only operations
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
  const { currentMember } = useCampStore();

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

  return {
    currentUser,
    role,
    department: currentMember?.department ?? null,
    roleLabel: ROLE_LABELS[role],
    can,
  };
}
