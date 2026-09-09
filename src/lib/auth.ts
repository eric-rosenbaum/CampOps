import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';
import type { CampRole } from '@/store/campStore';

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
  manageBuildingSystems:['admin', 'staff'] as CampRole[],
  manageCommissary:     ['admin', 'staff'] as CampRole[],
  manageRetreats:       ['admin', 'staff'] as CampRole[],
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

  /**
   * Module access is no longer a per-crew setting.
   *
   * Crews used to carry a `modules` object deciding which parts of the app each staff member
   * could open, which meant onboarding a camp involved deciding, per crew, whether the
   * groundskeeper may look at the pool page. Staff see the whole app; what a crew still decides
   * is whose work you can see (see `issuesSeeUnassigned`) and whether you may read camper health.
   *
   * Viewers remain read-only observers and still see nothing.
   */
  function canAccessModule(): boolean {
    return role !== 'viewer';
  }

  /**
   * Whether this person sees work that is not theirs.
   *
   * True: everything unassigned and everything sitting with their crew, so they can pick jobs
   * up. False: only what has their name on it. Anyone who is not staff sees the whole board.
   */
  const issuesSeeUnassigned =
    role !== 'staff' || !currentStaffGroup || currentStaffGroup.issuesSeeUnassigned;

  // Camper names + allergy severities. Unlike every other gate here, this one is
  // mirrored by real RLS (has_camper_health_access). This flag only decides what the
  // UI bothers to render. It also FAILS CLOSED: a staff member with no group is denied,
  // where elsewhere no group means legacy full access.
  const canViewCamperHealth =
    role === 'admin' || (role === 'staff' && Boolean(currentStaffGroup?.canViewCamperHealth));

  return {
    currentUser,
    role,
    department: currentMember?.department ?? null,
    staffGroup: currentStaffGroup,
    roleLabel: ROLE_LABELS[role],
    can,
    canAccessModule,
    issuesSeeUnassigned,
    canViewCamperHealth,
  };
}
