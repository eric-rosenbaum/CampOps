import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { setCampId } from '@/lib/db';

export type CampRole = 'admin' | 'staff' | 'viewer';
export type Department =
  | 'waterfront' | 'maintenance' | 'kitchen'
  | 'administration' | 'health' | 'program' | 'other';

export interface StaffGroupModules {
  issues_repairs: boolean;
  pre_post: boolean;
  pool: boolean;
  safety: boolean;
  assets: boolean;
  building_systems: boolean;
  commissary: boolean;
  retreats: boolean;
}

export interface StaffGroup {
  id: string;
  campId: string;
  name: string;
  modules: StaffGroupModules;
  issuesSeeUnassigned: boolean;
  prepostSeeUnassigned: boolean;
  /**
   * Grants this group's members camper NAMES and allergy severities. Enforced in
   * Postgres by has_camper_health_access(), not just in the UI. Health data is the
   * one place where a client-side module check is not sufficient. Staff with no group
   * are denied (elsewhere, no group means legacy full access; here it fails closed).
   */
  canViewCamperHealth: boolean;
  createdAt: string;
}

export interface CampMember {
  id: string;
  campId: string;
  userId: string;
  role: CampRole;
  department: Department | null;
  staffGroupId: string | null;
  displayName: string | null;
  isActive: boolean;
}

export type CampAccountType = 'customer' | 'trial' | 'demo' | 'internal';
export type CampStatus = 'active' | 'suspended' | 'trial_expired';

export interface Camp {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  campType: string | null;
  /** Postal address. Needed on the New York permit forms; blank until Camp Info is filled in. */
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  modules: Record<string, boolean>;
  locations: string[];
  /** Camp-wide dietary facts, e.g. { kosher: true }. Used by Commissary. */
  dietaryDefaults: Record<string, boolean>;
  /** Default payment/banking instructions prefilled into retreat invoice notes. */
  retreatPaymentNote: string | null;
  accountType: CampAccountType;
  status: CampStatus;
  plan: string | null;
  trialEndsAt: string | null;
  orgId: string | null;
  deletedAt: string | null;
}

// A camps row from the DB → Camp (used by both member-load and admin/impersonation load).
function rowToCamp(c: Record<string, unknown>): Camp {
  return {
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    logoUrl: (c.logo_url as string) ?? null,
    addressLine1: (c.address_line1 as string) ?? null,
    city: (c.city as string) ?? null,
    campType: (c.camp_type as string) ?? null,
    state: (c.state as string) ?? null,
    modules: (c.modules as Record<string, boolean>) ?? {},
    locations: (c.locations as string[]) ?? [],
    dietaryDefaults: (c.dietary_defaults as Record<string, boolean>) ?? {},
    retreatPaymentNote: (c.retreat_payment_note as string) ?? null,
    accountType: (c.account_type as CampAccountType) ?? 'customer',
    status: (c.status as CampStatus) ?? 'active',
    plan: (c.plan as string) ?? null,
    trialEndsAt: (c.trial_ends_at as string) ?? null,
    orgId: (c.org_id as string) ?? null,
    deletedAt: (c.deleted_at as string) ?? null,
  };
}

export interface MemberWithProfile extends CampMember {
  fullName: string;
  email: string;
  isCreator: boolean;
}

export interface JoinCode {
  id: string;
  code: string;
  role: CampRole;
  department: string | null;
  staffGroupId: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: CampRole;
  department: string | null;
  staffGroupId: string | null;
  token: string;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

interface CampState {
  currentCamp: Camp | null;
  currentMember: CampMember | null;
  currentStaffGroup: StaffGroup | null;
  members: MemberWithProfile[];
  staffGroups: StaffGroup[];
  camps: Camp[];
  isLoading: boolean;
  /** Founder super-admin (from platform_admins). Grants the admin console + all-camp access. */
  isPlatformAdmin: boolean;
  /** True when a platform admin is viewing a camp they are not a member of. */
  impersonating: boolean;

  loadMyCamps: () => Promise<void>;
  selectCamp: (campId: string) => Promise<void>;
  /** Platform-admin: open any camp (not a member) and act within it. */
  openCampAsAdmin: (campId: string) => Promise<void>;
  exitImpersonation: () => void;
  createCamp: (data: {
    name: string; slug: string; campType: string; state: string; modules: Record<string, boolean>;
  }) => Promise<string>;
  joinWithCode: (code: string) => Promise<{ campId: string; campName: string } | { error: string }>;
  acceptInvitation: (token: string) => Promise<{ campId: string } | { error: string }>;
  updateCamp: (campId: string, data: Partial<Pick<Camp, 'name' | 'campType' | 'state' | 'modules' | 'locations' | 'dietaryDefaults'>>) => Promise<void>;
  setRetreatPaymentNote: (campId: string, note: string | null) => Promise<void>;

  loadMembers: (campId: string) => Promise<MemberWithProfile[]>;
  inviteMember: (campId: string, email: string, role: CampRole, staffGroupId: string | null) => Promise<string>;
  removeMember: (memberId: string) => Promise<void>;
  updateMemberRole: (memberId: string, role: CampRole, staffGroupId: string | null) => Promise<void>;

  generateJoinCode: (campId: string, role: CampRole, staffGroupId: string | null, maxUses: number | null, days: number) => Promise<string>;
  loadJoinCodes: (campId: string) => Promise<JoinCode[]>;
  revokeJoinCode: (codeId: string) => Promise<void>;

  loadInvitations: (campId: string) => Promise<Invitation[]>;
  revokeInvitation: (invId: string) => Promise<void>;

  loadStaffGroups: (campId: string) => Promise<StaffGroup[]>;
  createStaffGroup: (campId: string, name: string, modules: StaffGroupModules, issuesSeeUnassigned: boolean, prepostSeeUnassigned: boolean, canViewCamperHealth?: boolean) => Promise<StaffGroup>;
  updateStaffGroup: (groupId: string, patch: Partial<Pick<StaffGroup, 'name' | 'modules' | 'issuesSeeUnassigned' | 'prepostSeeUnassigned' | 'canViewCamperHealth'>>) => Promise<void>;
  deleteStaffGroup: (groupId: string) => Promise<void>;
}

export const useCampStore = create<CampState>((set, get) => ({
  currentCamp: null,
  currentMember: null,
  currentStaffGroup: null,
  members: [],
  staffGroups: [],
  camps: [],
  isLoading: true,
  isPlatformAdmin: false,
  impersonating: false,

  loadMyCamps: async () => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { set({ isLoading: false }); return; }

    // Founder super-admin?
    const { data: pa } = await supabase.rpc('is_platform_admin');
    const isPlatformAdmin = pa === true;

    const { data, error } = await supabase
      .from('camp_members')
      .select('camp_id, role, department, display_name, is_active, id, user_id, camps(id, name, slug, logo_url, camp_type, address_line1, city, state, modules, locations, dietary_defaults, retreat_payment_note, account_type, status, plan, trial_ends_at, org_id, deleted_at)')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (error || !data) { set({ isLoading: false, isPlatformAdmin }); return; }

    const camps: Camp[] = [];
    for (const row of data) {
      const c = row.camps as unknown as Record<string, unknown> | null;
      // Deleted camps (in the 30-day trash) are hidden from members entirely.
      if (c && !(c.deleted_at)) camps.push(rowToCamp(c));
    }

    set({ camps, isPlatformAdmin });

    // Platform admins operate from the admin console and enter camps explicitly via "Open".
    // We DON'T auto-drop them into a camp on a fresh login (they may hold a leftover membership
    // on a seed/demo camp). But if they're mid-session viewing a camp and just refreshed the page,
    // restore that camp. The target is kept in sessionStorage (per-tab, cleared on Exit to admin),
    // so a refresh stays put while a brand-new login still lands on /admin.
    if (isPlatformAdmin) {
      const viewing = sessionStorage.getItem('campcommand_admin_camp_id');
      if (viewing) await get().selectCamp(viewing);
      set({ isLoading: false });
      return;
    }

    if (camps.length > 0) {
      const saved = localStorage.getItem('campcommand_selected_camp_id');
      const toSelect = (saved && camps.some(c => c.id === saved)) ? saved : camps[0].id;
      await get().selectCamp(toSelect);
    }
    set({ isLoading: false });
  },

  selectCamp: async (campId) => {
    console.log('[campStore] selectCamp: start', campId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { console.warn('[campStore] selectCamp: no user'); return; }

    const { data: memberRow } = await supabase
      .from('camp_members')
      .select('*')
      .eq('camp_id', campId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    const { data: campRow } = await supabase
      .from('camps')
      .select('*')
      .eq('id', campId)
      .single();

    if (!campRow) return;

    // A platform admin always operates as a full camp admin, regardless of whether they hold a
    // real membership (they may be a leftover staff member of a seed/demo camp with a limited
    // staff group. That must not downgrade them). Synthesize an admin member and treat it as
    // impersonation so the "Viewing … as CampCommand admin" banner shows.
    const isPA = get().isPlatformAdmin;
    if (!memberRow && !isPA) return;
    const impersonating = isPA;

    const member: CampMember = (memberRow && !isPA) ? {
      id: memberRow.id,
      campId: memberRow.camp_id,
      userId: memberRow.user_id,
      role: memberRow.role as CampRole,
      department: memberRow.department as Department | null,
      staffGroupId: memberRow.staff_group_id ?? null,
      displayName: memberRow.display_name,
      isActive: memberRow.is_active,
    } : {
      id: 'platform-admin', campId, userId: user.id, role: 'admin',
      department: null, staffGroupId: null, displayName: 'CampCommand admin', isActive: true,
    };

    const camp: Camp = rowToCamp(campRow as Record<string, unknown>);

    localStorage.setItem('campcommand_selected_camp_id', campId);
    setCampId(campId);

    const [members, staffGroups] = await Promise.all([
      get().loadMembers(campId),
      get().loadStaffGroups(campId),
    ]);

    const currentStaffGroup = member.staffGroupId
      ? staffGroups.find((g) => g.id === member.staffGroupId) ?? null
      : null;

    set({ currentCamp: camp, currentMember: member, members, staffGroups, currentStaffGroup, impersonating });
  },

  openCampAsAdmin: async (campId) => {
    // Remember the camp for this tab so a page refresh keeps the admin here (not back to /admin).
    sessionStorage.setItem('campcommand_admin_camp_id', campId);
    await get().selectCamp(campId);
  },
  exitImpersonation: () => {
    localStorage.removeItem('campcommand_selected_camp_id');
    sessionStorage.removeItem('campcommand_admin_camp_id');
    setCampId('');
    set({ currentCamp: null, currentMember: null, currentStaffGroup: null, members: [], staffGroups: [], impersonating: false });
  },

  createCamp: async ({ name, slug, campType, state, modules }) => {
    const { data, error } = await supabase.rpc('create_camp', {
      p_name: name, p_slug: slug, p_camp_type: campType, p_state: state, p_modules: modules,
    });
    if (error) throw new Error(error.message);
    const newCampId = data as string;
    await get().loadMyCamps();
    await get().selectCamp(newCampId);
    return newCampId;
  },

  joinWithCode: async (code) => {
    const { data, error } = await supabase.rpc('join_camp_with_code', { p_code: code });
    if (error) return { error: error.message };
    const result = data as Record<string, unknown>;
    if (result.error) return { error: result.error as string };
    await get().loadMyCamps();
    return { campId: result.camp_id as string, campName: result.camp_name as string };
  },

  acceptInvitation: async (token) => {
    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
    if (error) return { error: error.message };
    const result = data as Record<string, unknown>;
    if (result.error) return { error: result.error as string };
    await get().loadMyCamps();
    return { campId: result.camp_id as string };
  },

  updateCamp: async (campId, data) => {
    const current = get().currentCamp;
    if (current && current.id === campId) {
      set({
        currentCamp: {
          ...current,
          ...(data.name !== undefined && { name: data.name }),
          ...(data.campType !== undefined && { campType: data.campType }),
          ...(data.state !== undefined && { state: data.state }),
          ...(data.modules !== undefined && { modules: data.modules }),
          ...(data.locations !== undefined && { locations: data.locations }),
          ...(data.dietaryDefaults !== undefined && { dietaryDefaults: data.dietaryDefaults }),
        },
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('update_camp', {
      p_camp_id: campId,
      p_name: data.name ?? null,
      p_camp_type: data.campType ?? null,
      p_state: data.state ?? null,
      p_modules: data.modules ?? null,
      p_locations: data.locations ?? null,
      p_dietary_defaults: data.dietaryDefaults ?? null,
    });
    if (error) console.error('[campStore] updateCamp error:', error);
  },

  setRetreatPaymentNote: async (campId, note) => {
    const current = get().currentCamp;
    if (current && current.id === campId) set({ currentCamp: { ...current, retreatPaymentNote: note } });
    const { error } = await supabase.from('camps').update({ retreat_payment_note: note }).eq('id', campId);
    if (error) console.error('[campStore] setRetreatPaymentNote error:', error);
  },

  loadMembers: async (campId) => {
    const { data: memberRows } = await supabase
      .from('camp_members')
      .select('*')
      .eq('camp_id', campId)
      .eq('is_active', true)
      .order('created_at');

    if (!memberRows || memberRows.length === 0) return [];

    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberRows.map(r => r.user_id));

    const nameMap = new Map((profileRows ?? []).map(p => [p.id as string, p.full_name as string]));
    const creatorUserId = memberRows[0]?.user_id ?? null;

    return memberRows.map(row => ({
      id: row.id,
      campId: row.camp_id,
      userId: row.user_id,
      role: row.role as CampRole,
      department: row.department as Department | null,
      staffGroupId: row.staff_group_id ?? null,
      displayName: row.display_name,
      isActive: row.is_active,
      fullName: nameMap.get(row.user_id) ?? row.display_name ?? 'Unknown',
      email: '',
      isCreator: row.user_id === creatorUserId,
    }));
  },

  inviteMember: async (campId, email, role, staffGroupId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    await supabase
      .from('camp_invitations')
      .delete()
      .eq('camp_id', campId)
      .eq('email', email)
      .is('accepted_at', null);

    const { data, error } = await supabase
      .from('camp_invitations')
      .insert({
        camp_id: campId,
        email,
        role,
        department: null,
        staff_group_id: staffGroupId,
        invited_by: user.id,
      })
      .select('token')
      .single();

    if (error) throw new Error(error.message);
    return data.token as string;
  },

  removeMember: async (memberId) => {
    await supabase.from('camp_members').update({ is_active: false }).eq('id', memberId);
    set((s) => ({ members: s.members.filter((m) => m.id !== memberId) }));
  },

  updateMemberRole: async (memberId, role, staffGroupId) => {
    const { error } = await supabase.rpc('update_member_role', {
      p_member_id: memberId,
      p_role: role,
      p_department: null,
      p_staff_group_id: staffGroupId ?? null,
    });
    if (error) {
      console.error('updateMemberRole error:', error.message);
      throw new Error(error.message);
    }
    set((s) => ({
      members: s.members.map((m) =>
        m.id === memberId ? { ...m, role, staffGroupId: staffGroupId ?? null } : m
      ),
    }));
  },

  generateJoinCode: async (campId, role, staffGroupId, maxUses, days) => {
    const { data, error } = await supabase.rpc('generate_join_code', {
      p_camp_id: campId,
      p_role: role,
      p_dept: null,
      p_max_uses: maxUses,
      p_days: days,
      p_staff_group_id: staffGroupId,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },

  loadJoinCodes: async (campId) => {
    const { data } = await supabase
      .from('camp_join_codes')
      .select('*')
      .eq('camp_id', campId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    return (data ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      role: r.role as CampRole,
      department: r.department,
      staffGroupId: r.staff_group_id ?? null,
      maxUses: r.max_uses,
      useCount: r.use_count,
      expiresAt: r.expires_at,
      isActive: r.is_active,
      createdAt: r.created_at,
    }));
  },

  revokeJoinCode: async (codeId) => {
    await supabase.from('camp_join_codes').update({ is_active: false }).eq('id', codeId);
  },

  loadInvitations: async (campId) => {
    const { data } = await supabase
      .from('camp_invitations')
      .select('*')
      .eq('camp_id', campId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    return (data ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role as CampRole,
      department: r.department,
      staffGroupId: r.staff_group_id ?? null,
      token: r.token,
      acceptedAt: r.accepted_at,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
  },

  revokeInvitation: async (invId) => {
    await supabase.from('camp_invitations').delete().eq('id', invId);
  },

  loadStaffGroups: async (campId) => {
    const { data } = await supabase
      .from('staff_groups')
      .select('*')
      .eq('camp_id', campId)
      .order('created_at', { ascending: true });

    const groups: StaffGroup[] = (data ?? []).map((r) => ({
      id: r.id,
      campId: r.camp_id,
      name: r.name,
      modules: r.modules as StaffGroupModules,
      issuesSeeUnassigned: r.issues_see_unassigned,
      prepostSeeUnassigned: r.prepost_see_unassigned,
      canViewCamperHealth: r.can_view_camper_health ?? false,
      createdAt: r.created_at,
    }));

    set({ staffGroups: groups });
    return groups;
  },

  createStaffGroup: async (campId, name, modules, issuesSeeUnassigned, prepostSeeUnassigned, canViewCamperHealth = false) => {
    const { data, error } = await supabase
      .from('staff_groups')
      .insert({
        camp_id: campId,
        name,
        modules,
        issues_see_unassigned: issuesSeeUnassigned,
        prepost_see_unassigned: prepostSeeUnassigned,
        can_view_camper_health: canViewCamperHealth,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const group: StaffGroup = {
      id: data.id,
      campId: data.camp_id,
      name: data.name,
      modules: data.modules as StaffGroupModules,
      issuesSeeUnassigned: data.issues_see_unassigned,
      prepostSeeUnassigned: data.prepost_see_unassigned,
      canViewCamperHealth: data.can_view_camper_health ?? false,
      createdAt: data.created_at,
    };

    set((s) => ({ staffGroups: [...s.staffGroups, group] }));
    return group;
  },

  updateStaffGroup: async (groupId, patch) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.modules !== undefined) row.modules = patch.modules;
    if (patch.issuesSeeUnassigned !== undefined) row.issues_see_unassigned = patch.issuesSeeUnassigned;
    if (patch.prepostSeeUnassigned !== undefined) row.prepost_see_unassigned = patch.prepostSeeUnassigned;
    if (patch.canViewCamperHealth !== undefined) row.can_view_camper_health = patch.canViewCamperHealth;

    const { error } = await supabase.from('staff_groups').update(row).eq('id', groupId);
    if (error) throw new Error(error.message);

    set((s) => ({
      staffGroups: s.staffGroups.map((g) => g.id === groupId ? { ...g, ...patch } : g),
      currentStaffGroup: s.currentStaffGroup?.id === groupId
        ? { ...s.currentStaffGroup, ...patch }
        : s.currentStaffGroup,
    }));
  },

  deleteStaffGroup: async (groupId) => {
    const { error } = await supabase.from('staff_groups').delete().eq('id', groupId);
    if (error) throw new Error(error.message);
    set((s) => ({
      staffGroups: s.staffGroups.filter((g) => g.id !== groupId),
      currentStaffGroup: s.currentStaffGroup?.id === groupId ? null : s.currentStaffGroup,
    }));
  },
}));
