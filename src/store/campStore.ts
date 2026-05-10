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
}

export interface StaffGroup {
  id: string;
  campId: string;
  name: string;
  modules: StaffGroupModules;
  issuesSeeUnassigned: boolean;
  prepostSeeUnassigned: boolean;
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

export interface Camp {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  campType: string | null;
  state: string | null;
  modules: Record<string, boolean>;
  locations: string[];
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

  loadMyCamps: () => Promise<void>;
  selectCamp: (campId: string) => Promise<void>;
  createCamp: (data: {
    name: string; slug: string; campType: string; state: string; modules: Record<string, boolean>;
  }) => Promise<string>;
  joinWithCode: (code: string) => Promise<{ campId: string; campName: string } | { error: string }>;
  acceptInvitation: (token: string) => Promise<{ campId: string } | { error: string }>;
  updateCamp: (campId: string, data: Partial<Pick<Camp, 'name' | 'campType' | 'state' | 'modules' | 'locations'>>) => Promise<void>;

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
  createStaffGroup: (campId: string, name: string, modules: StaffGroupModules, issuesSeeUnassigned: boolean, prepostSeeUnassigned: boolean) => Promise<StaffGroup>;
  updateStaffGroup: (groupId: string, patch: Partial<Pick<StaffGroup, 'name' | 'modules' | 'issuesSeeUnassigned' | 'prepostSeeUnassigned'>>) => Promise<void>;
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

  loadMyCamps: async () => {
    console.log('[campStore] loadMyCamps: start');
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { set({ isLoading: false }); return; }
    const { data, error } = await supabase
      .from('camp_members')
      .select('camp_id, role, department, display_name, is_active, id, user_id, camps(id, name, slug, logo_url, camp_type, state, modules, locations)')
      .eq('user_id', user.id)
      .eq('is_active', true);

    console.log('[campStore] loadMyCamps: query done', { rowCount: data?.length, error });
    if (error || !data) { set({ isLoading: false }); return; }

    const camps: Camp[] = [];
    for (const row of data) {
      const c = row.camps as unknown as Record<string, unknown> | null;
      if (c) {
        camps.push({
          id: c.id as string,
          name: c.name as string,
          slug: c.slug as string,
          logoUrl: (c.logo_url as string) ?? null,
          campType: (c.camp_type as string) ?? null,
          state: (c.state as string) ?? null,
          modules: (c.modules as Record<string, boolean>) ?? {},
          locations: (c.locations as string[]) ?? [],
        });
      }
    }

    set({ camps, isLoading: false });

    if (camps.length > 0) {
      const saved = localStorage.getItem('campcommand_selected_camp_id');
      const toSelect = (saved && camps.some(c => c.id === saved)) ? saved : camps[0].id;
      await get().selectCamp(toSelect);
    }
    console.log('[campStore] loadMyCamps: done');
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

    if (!memberRow || !campRow) {
      console.warn('[campStore] selectCamp: early return — memberRow or campRow missing');
      return;
    }

    const member: CampMember = {
      id: memberRow.id,
      campId: memberRow.camp_id,
      userId: memberRow.user_id,
      role: memberRow.role as CampRole,
      department: memberRow.department as Department | null,
      staffGroupId: memberRow.staff_group_id ?? null,
      displayName: memberRow.display_name,
      isActive: memberRow.is_active,
    };

    const camp: Camp = {
      id: campRow.id,
      name: campRow.name,
      slug: campRow.slug,
      logoUrl: campRow.logo_url ?? null,
      campType: campRow.camp_type ?? null,
      state: campRow.state ?? null,
      modules: campRow.modules ?? {},
      locations: (campRow.locations as string[]) ?? [],
    };

    localStorage.setItem('campcommand_selected_camp_id', campId);
    setCampId(campId);

    const [members, staffGroups] = await Promise.all([
      get().loadMembers(campId),
      get().loadStaffGroups(campId),
    ]);

    const currentStaffGroup = member.staffGroupId
      ? staffGroups.find((g) => g.id === member.staffGroupId) ?? null
      : null;

    set({ currentCamp: camp, currentMember: member, members, staffGroups, currentStaffGroup });
    console.log('[campStore] selectCamp: done');
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
    });
    if (error) console.error('[campStore] updateCamp error:', error);
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
      createdAt: r.created_at,
    }));

    set({ staffGroups: groups });
    return groups;
  },

  createStaffGroup: async (campId, name, modules, issuesSeeUnassigned, prepostSeeUnassigned) => {
    const { data, error } = await supabase
      .from('staff_groups')
      .insert({
        camp_id: campId,
        name,
        modules,
        issues_see_unassigned: issuesSeeUnassigned,
        prepost_see_unassigned: prepostSeeUnassigned,
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
