/**
 * Auth abstraction layer.
 *
 * TODAY: reads the impersonated user from uiStore (no real auth).
 * LATER: replace the body of `useAuth()` to read from supabase.auth.getUser()
 *        and fetch the user's role from the `users` table. The return shape
 *        must stay the same so all callers continue to work unchanged.
 */

import { useUIStore } from '@/store/uiStore';
import { SEED_USERS } from '@/lib/seedData';
import type { Role } from '@/lib/types';

// ─── Permission definitions ────────────────────────────────────────────────

const ROLE_PERMISSIONS = {
  createIssue:            ['doe', 'facilities_manager'],
  createTask:             ['doe', 'facilities_manager'],
  assign:                 ['doe', 'facilities_manager'],
  enterActualCost:        ['doe', 'facilities_manager'],
  activateNewSeason:      ['doe', 'facilities_manager'],
  managePoolChecklist:    ['doe', 'facilities_manager'],
  updateStatus:           ['doe', 'facilities_manager', 'maintenance_staff'],
  markResolved:           ['doe', 'facilities_manager', 'maintenance_staff'],
  markComplete:           ['doe', 'facilities_manager', 'maintenance_staff'],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof ROLE_PERMISSIONS;

export const ROLE_LABELS: Record<Role, string> = {
  doe:                'Ops Director',
  facilities_manager: 'Facilities Manager',
  maintenance_staff:  'Maintenance Staff',
};

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useAuth() {
  // ↓ Swap this block for supabase.auth.getUser() when adding real auth
  const { currentUserId } = useUIStore();
  const currentUser = SEED_USERS.find((u) => u.id === currentUserId) ?? SEED_USERS[0];
  // ↑ end of mock-auth block

  function can(permission: Permission): boolean {
    return (ROLE_PERMISSIONS[permission] as Role[]).includes(currentUser.role);
  }

  return {
    currentUser,
    role: currentUser.role,
    roleLabel: ROLE_LABELS[currentUser.role],
    can,
  };
}
