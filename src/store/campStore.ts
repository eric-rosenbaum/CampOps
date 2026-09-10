import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { setCampId } from '@/lib/db';

export type CampRole = 'admin' | 'staff' | 'viewer';
export type Department =
  | 'waterfront' | 'maintenance' | 'kitchen'
  | 'administration' | 'health' | 'program' | 'other';

/** Row -> crew. One place, because three call sites drifted apart the last time it was three. */
function rowToStaffGroup(r: Record<string, any>): StaffGroup {
  return {
    id: r.id,
    campId: r.camp_id,
    name: r.name,
    key: r.key,
    sortOrder: r.sort_order ?? 0,
    isActive: r.is_active ?? true,
    issuesSeeUnassigned: r.issues_see_unassigned,
    canViewCamperHealth: r.can_view_camper_health ?? false,
    createdAt: r.created_at,
  };
}

/**
 * A slug for a new crew, unique within the camp.
 *
 * Work orders are filed under this and never re-filed, so a collision would silently pour one
 * crew's work into another. A name that slugs to nothing (an emoji, a name in a non-Latin script)
 * still needs a key, hence the fallback.
 */
function crewKey(name: string, taken: string[]): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'crew';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export interface StaffGroup {
  id: string;
  campId: string;
  name: string;
  /**
   * The stable slug work is filed under: issues.trade, work_routing.trade, work_schedules.trade.
   *
   * A crew and a trade are one thing. The name is what people read and can be renamed at will;
   * this is what the rows point at, so it never moves once work exists under it.
   */
  key: string;
  sortOrder: number;
  /** Retired crews still resolve for old work orders; they are not offered for new ones. */
  isActive: boolean;
  /**
   * Whether the crew sees work that is not theirs -- anything unassigned or sitting with the
   * crew, so they can pick it up. False means they only ever see jobs with their own name on.
   *
   * A crew used to also carry a `modules` object deciding which parts of the app its members
   * could open at all. That column is still on the table so a rollback has something to read,
   * but nothing writes it and nothing checks it: staff see the whole app.
   */
  issuesSeeUnassigned: boolean;
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
  /** The camp's rate card. A booking priced individually overrides these; they fill the gap. */
  defaultPricingModel: string | null;
  defaultRatePerPersonNight: number | null;
  defaultFlatRate: number | null;
  /** Seeds the deposit on a new quote. */
  defaultDepositAmount: number | null;
  /** Seeded into every new proposal, so terms are written once. */
  proposalTerms: string | null;
  /** How long a quote stands. Null means 30. */
  proposalValidDays: number | null;
  /** Days after a deposit invoice goes out before the camp is asked whether it arrived. */
  depositChaseDays: number | null;
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
    defaultPricingModel: (c.default_pricing_model as string) ?? null,
    defaultRatePerPersonNight: (c.default_rate_per_person_night as number) ?? null,
    defaultFlatRate: (c.default_flat_rate as number) ?? null,
    defaultDepositAmount: (c.default_deposit_amount as number) ?? null,
    proposalTerms: (c.proposal_terms as string) ?? null,
    proposalValidDays: (c.proposal_valid_days as number) ?? null,
    depositChaseDays: (c.deposit_chase_days as number) ?? null,
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
  /**
   * The crews I am on. Was a single crew; a person can now be on several, because at a small
   * camp one person IS the maintenance, grounds and tech crew.
   */
  myStaffGroups: StaffGroup[];
  members: MemberWithProfile[];
  staffGroups: StaffGroup[];
  /** Crew id -> the user ids on it. */
  crewMembership: Record<string, string[]>;
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
  /** Write any part of the camp's rate card / proposal defaults. */
  setRentalDefaults: (campId: string, patch: Partial<Pick<Camp,
    'defaultPricingModel' | 'defaultRatePerPersonNight' | 'defaultFlatRate' | 'defaultDepositAmount'
    | 'proposalTerms' | 'proposalValidDays' | 'depositChaseDays'>>) => Promise<void>;

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
  setCrewMembers: (campId: string, groupId: string, userIds: string[]) => Promise<void>;
  createStaffGroup: (campId: string, name: string, issuesSeeUnassigned: boolean, canViewCamperHealth?: boolean) => Promise<StaffGroup>;
  updateStaffGroup: (groupId: string, patch: Partial<Pick<StaffGroup, 'name' | 'isActive' | 'sortOrder' | 'issuesSeeUnassigned' | 'canViewCamperHealth'>>) => Promise<void>;
  deleteStaffGroup: (groupId: string) => Promise<void>;
}

export const useCampStore = create<CampState>((set, get) => ({
  currentCamp: null,
  currentMember: null,
  myStaffGroups: [],
  members: [],
  staffGroups: [],
  crewMembership: {},
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

    // Which crews this person is on. Read from the membership map loadStaffGroups just filled,
    // not from camp_members.staff_group_id -- that column is frozen at one crew.
    const mine = get().crewMembership;
    const myStaffGroups = staffGroups.filter((g) => (mine[g.id] ?? []).includes(member.userId));

    set({ currentCamp: camp, currentMember: member, members, staffGroups, myStaffGroups, impersonating });
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
    set({ currentCamp: null, currentMember: null, myStaffGroups: [], members: [], staffGroups: [], crewMembership: {}, impersonating: false });
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

  setRentalDefaults: async (campId, patch) => {
    const current = get().currentCamp;
    if (current && current.id === campId) set({ currentCamp: { ...current, ...patch } });
    const row: Record<string, unknown> = {};
    if (patch.defaultPricingModel !== undefined) row.default_pricing_model = patch.defaultPricingModel;
    if (patch.defaultRatePerPersonNight !== undefined) row.default_rate_per_person_night = patch.defaultRatePerPersonNight;
    if (patch.defaultFlatRate !== undefined) row.default_flat_rate = patch.defaultFlatRate;
    if (patch.defaultDepositAmount !== undefined) row.default_deposit_amount = patch.defaultDepositAmount;
    if (patch.proposalTerms !== undefined) row.proposal_terms = patch.proposalTerms;
    if (patch.proposalValidDays !== undefined) row.proposal_valid_days = patch.proposalValidDays;
    if (patch.depositChaseDays !== undefined) row.deposit_chase_days = patch.depositChaseDays;
    const { error } = await supabase.from('camps').update(row).eq('id', campId);
    if (error) console.error('[campStore] setRentalDefaults error:', error);
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
    const [{ data }, { data: memberRows }] = await Promise.all([
      supabase.from('staff_groups').select('*').eq('camp_id', campId)
        .order('sort_order', { ascending: true }).order('name', { ascending: true }),
      supabase.from('staff_group_members').select('staff_group_id, user_id').eq('camp_id', campId),
    ]);

    const groups: StaffGroup[] = (data ?? []).map(rowToStaffGroup);
    const membership: Record<string, string[]> = {};
    for (const r of memberRows ?? []) {
      (membership[r.staff_group_id] ??= []).push(r.user_id);
    }

    set({ staffGroups: groups, crewMembership: membership });
    return groups;
  },

  /** Put someone on a crew, or take them off. A person can be on as many as they actually work. */
  setCrewMembers: async (campId, groupId, userIds) => {
    const before = get().crewMembership[groupId] ?? [];
    const added = userIds.filter((u) => !before.includes(u));
    const removed = before.filter((u) => !userIds.includes(u));

    set((s) => ({ crewMembership: { ...s.crewMembership, [groupId]: userIds } }));

    if (removed.length > 0) {
      const { error } = await supabase.from('staff_group_members')
        .delete().eq('staff_group_id', groupId).in('user_id', removed);
      if (error) { set((s) => ({ crewMembership: { ...s.crewMembership, [groupId]: before } })); throw new Error(error.message); }
    }
    if (added.length > 0) {
      const { error } = await supabase.from('staff_group_members')
        .insert(added.map((u) => ({ camp_id: campId, staff_group_id: groupId, user_id: u })));
      if (error) { set((s) => ({ crewMembership: { ...s.crewMembership, [groupId]: before } })); throw new Error(error.message); }
    }
  },

  createStaffGroup: async (campId, name, issuesSeeUnassigned, canViewCamperHealth = false) => {
    const existing = get().staffGroups.filter((g) => g.campId === campId);
    const { data, error } = await supabase
      .from('staff_groups')
      .insert({
        camp_id: campId,
        name,
        key: crewKey(name, existing.map((g) => g.key)),
        sort_order: existing.length,
        issues_see_unassigned: issuesSeeUnassigned,
        can_view_camper_health: canViewCamperHealth,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const group = rowToStaffGroup(data);
    set((s) => ({ staffGroups: [...s.staffGroups, group] }));
    return group;
  },

  updateStaffGroup: async (groupId, patch) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    // `key` is deliberately not patchable. Work orders point at it; renaming the crew renames
    // what people read, and the rows underneath stay attached.
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.isActive !== undefined) row.is_active = patch.isActive;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    if (patch.issuesSeeUnassigned !== undefined) row.issues_see_unassigned = patch.issuesSeeUnassigned;
    if (patch.canViewCamperHealth !== undefined) row.can_view_camper_health = patch.canViewCamperHealth;

    const { error } = await supabase.from('staff_groups').update(row).eq('id', groupId);
    if (error) throw new Error(error.message);

    set((s) => ({
      staffGroups: s.staffGroups.map((g) => g.id === groupId ? { ...g, ...patch } : g),
      myStaffGroups: s.myStaffGroups.map((g) => g.id === groupId ? { ...g, ...patch } : g),
    }));
  },

  deleteStaffGroup: async (groupId) => {
    const { error } = await supabase.from('staff_groups').delete().eq('id', groupId);
    if (error) throw new Error(error.message);
    set((s) => ({
      staffGroups: s.staffGroups.filter((g) => g.id !== groupId),
      myStaffGroups: s.myStaffGroups.filter((g) => g.id !== groupId),
    }));
  },
}));
