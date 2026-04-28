import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { setCampId } from '@/lib/db';

export type CampRole = 'admin' | 'staff' | 'viewer';
export type Department =
  | 'waterfront' | 'maintenance' | 'kitchen'
  | 'administration' | 'health' | 'program' | 'other';

export interface CampMember {
  id: string;
  campId: string;
  userId: string;
  role: CampRole;
  department: Department | null;
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
}

interface CampState {
  currentCamp: Camp | null;
  currentMember: CampMember | null;
  members: MemberWithProfile[];
  camps: Camp[];
  isLoading: boolean;
  loadMyCamps: () => Promise<void>;
  selectCamp: (campId: string) => Promise<void>;
  createCamp: (data: {
    name: string;
    slug: string;
    campType: string;
    state: string;
    modules: Record<string, boolean>;
  }) => Promise<string>;
  joinWithCode: (code: string) => Promise<{ campId: string; campName: string } | { error: string }>;
  acceptInvitation: (token: string) => Promise<{ campId: string } | { error: string }>;
  updateCamp: (campId: string, data: Partial<Pick<Camp, 'name' | 'campType' | 'state' | 'modules' | 'locations'>>) => Promise<void>;
  loadMembers: (campId: string) => Promise<MemberWithProfile[]>;
  inviteMember: (campId: string, email: string, role: CampRole, department: Department | null) => Promise<string>;
  removeMember: (memberId: string) => Promise<void>;
  updateMemberRole: (memberId: string, role: CampRole, department: Department | null) => Promise<void>;
  generateJoinCode: (campId: string, role: CampRole, dept: Department | null, maxUses: number | null, days: number) => Promise<string>;
  loadJoinCodes: (campId: string) => Promise<JoinCode[]>;
  revokeJoinCode: (codeId: string) => Promise<void>;
  loadInvitations: (campId: string) => Promise<Invitation[]>;
  revokeInvitation: (invId: string) => Promise<void>;
}

export interface JoinCode {
  id: string;
  code: string;
  role: CampRole;
  department: string | null;
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
  token: string;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export const useCampStore = create<CampState>((set, get) => ({
  currentCamp: null,
  currentMember: null,
  members: [],
  camps: [],
  isLoading: true,  // true until first loadMyCamps completes, prevents premature /setup redirect

  loadMyCamps: async () => {
    console.log('[campStore] loadMyCamps: start');
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { set({ isLoading: false }); return; }
    const { data, error } = await supabase
      .from('camp_members')
      .select('camp_id, role, department, display_name, is_active, id, user_id, camps(id, name, slug, logo_url, camp_type, state, modules)')
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

    console.log('[campStore] loadMyCamps: built camps', camps.length);
    set({ camps, isLoading: false });

    if (camps.length > 0) {
      const saved = localStorage.getItem('campcommand_selected_camp_id');
      const toSelect = (saved && camps.some(c => c.id === saved)) ? saved : camps[0].id;
      console.log('[campStore] loadMyCamps: auto-selecting camp', toSelect);
      await get().selectCamp(toSelect);
      console.log('[campStore] loadMyCamps: selectCamp done');
    }
    console.log('[campStore] loadMyCamps: done');
  },

  selectCamp: async (campId) => {
    console.log('[campStore] selectCamp: start', campId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { console.warn('[campStore] selectCamp: no user'); return; }
    const { data: memberRow, error: memberErr } = await supabase
      .from('camp_members')
      .select('*')
      .eq('camp_id', campId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    console.log('[campStore] selectCamp: memberRow', { memberRow, memberErr });

    const { data: campRow, error: campErr } = await supabase
      .from('camps')
      .select('*')
      .eq('id', campId)
      .single();

    console.log('[campStore] selectCamp: campRow', { id: campRow?.id, campErr });

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
    console.log('[campStore] selectCamp: loading members');
    const members = await get().loadMembers(campId);
    console.log('[campStore] selectCamp: loadMembers done', members.length);
    set({ currentCamp: camp, currentMember: member, members });
    console.log('[campStore] selectCamp: done');
  },

  createCamp: async ({ name, slug, campType, state, modules }) => {
    console.log('[campStore] createCamp: start', { name, slug, campType, state, modules });
    const { data, error } = await supabase.rpc('create_camp', {
      p_name: name,
      p_slug: slug,
      p_camp_type: campType,
      p_state: state,
      p_modules: modules,
    });
    console.log('[campStore] createCamp: RPC done', { data, error });
    if (error) throw new Error(error.message);
    const newCampId = data as string;
    console.log('[campStore] createCamp: calling loadMyCamps');
    await get().loadMyCamps();
    console.log('[campStore] createCamp: selecting new camp', newCampId);
    await get().selectCamp(newCampId);
    console.log('[campStore] createCamp: done, returning', newCampId);
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
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.campType !== undefined) update.camp_type = data.campType;
    if (data.state !== undefined) update.state = data.state;
    if (data.modules !== undefined) update.modules = data.modules;
    if (data.locations !== undefined) update.locations = data.locations;

    const { error } = await supabase.from('camps').update(update).eq('id', campId);
    if (error) console.error('[campStore] updateCamp error:', error);

    // Update local store directly — no need to re-fetch the entire camp
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
  },

  loadMembers: async (campId) => {
    console.log('[campStore] loadMembers: start', campId);
    const { data: memberRows, error: membErr } = await supabase
      .from('camp_members')
      .select('*')
      .eq('camp_id', campId)
      .eq('is_active', true)
      .order('created_at');

    console.log('[campStore] loadMembers: memberRows', { count: memberRows?.length, membErr });
    if (!memberRows || memberRows.length === 0) return [];

    const { data: profileRows, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberRows.map(r => r.user_id));

    console.log('[campStore] loadMembers: profileRows', { count: profileRows?.length, profErr });

    const nameMap = new Map((profileRows ?? []).map(p => [p.id as string, p.full_name as string]));

    return memberRows.map(row => ({
      id: row.id,
      campId: row.camp_id,
      userId: row.user_id,
      role: row.role as CampRole,
      department: row.department as Department | null,
      displayName: row.display_name,
      isActive: row.is_active,
      fullName: nameMap.get(row.user_id) ?? row.display_name ?? 'Unknown',
      email: '',
    }));
  },

  inviteMember: async (campId, email, role, department) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Revoke any existing pending invitation for this email
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
        department,
        invited_by: user.id,
      })
      .select('token')
      .single();

    if (error) throw new Error(error.message);
    return data.token as string;
  },

  removeMember: async (memberId) => {
    await supabase
      .from('camp_members')
      .update({ is_active: false })
      .eq('id', memberId);
    set((s) => ({ members: s.members.filter((m) => m.id !== memberId) }));
  },

  updateMemberRole: async (memberId, role, department) => {
    await supabase
      .from('camp_members')
      .update({ role, department })
      .eq('id', memberId);
    set((s) => ({
      members: s.members.map((m) =>
        m.id === memberId ? { ...m, role, department } : m
      ),
    }));
  },

  generateJoinCode: async (campId, role, dept, maxUses, days) => {
    const { data, error } = await supabase.rpc('generate_join_code', {
      p_camp_id: campId,
      p_role: role,
      p_dept: dept,
      p_max_uses: maxUses,
      p_days: days,
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
      token: r.token,
      acceptedAt: r.accepted_at,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
  },

  revokeInvitation: async (invId) => {
    await supabase.from('camp_invitations').delete().eq('id', invId);
  },
}));
