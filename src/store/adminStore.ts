import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useCampStore, type CampAccountType, type CampStatus } from '@/store/campStore';

export interface AdminCamp {
  id: string;
  name: string;
  slug: string;
  accountType: CampAccountType;
  status: CampStatus;
  plan: string | null;
  trialEndsAt: string | null;
  orgId: string | null;
  isSeed: boolean;
  createdAt: string;
  memberCount: number;
}
export interface AdminOrg { id: string; name: string; }

interface AdminState {
  camps: AdminCamp[];
  orgs: AdminOrg[];
  loading: boolean;
  load: () => Promise<void>;

  provisionCustomer: (opts: { name: string; plan: string | null; orgId: string | null; buyerEmail: string }) => Promise<{ campId: string; inviteUrl: string }>;
  spinUpTrial: (opts: { name: string; sourceCampId: string; buyerEmail: string; trialDays?: number }) => Promise<{ campId: string; inviteUrl: string }>;
  setStatus: (campId: string, status: CampStatus) => Promise<void>;
  extendTrial: (campId: string, days: number) => Promise<void>;
  setPlan: (campId: string, plan: string | null) => Promise<void>;
  convertTrialToCustomer: (campId: string, plan: string | null) => Promise<void>;
  setSeed: (campId: string, isSeed: boolean) => Promise<void>;
  createOrg: (name: string) => Promise<void>;
  setCampOrg: (campId: string, orgId: string | null) => Promise<void>;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'camp';
}
async function inviteAdmin(campId: string, email: string): Promise<string> {
  const token = await useCampStore.getState().inviteMember(campId, email, 'admin', null);
  return `${window.location.origin}/invite/${token}`;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  camps: [],
  orgs: [],
  loading: true,

  load: async () => {
    set({ loading: true });
    const [campsRes, orgsRes, membersRes] = await Promise.all([
      supabase.from('camps').select('id, name, slug, account_type, status, plan, trial_ends_at, org_id, is_seed, created_at').order('created_at', { ascending: false }),
      supabase.from('organizations').select('id, name').order('name'),
      supabase.from('camp_members').select('camp_id').eq('is_active', true),
    ]);
    const counts = new Map<string, number>();
    for (const m of membersRes.data ?? []) counts.set(m.camp_id as string, (counts.get(m.camp_id as string) ?? 0) + 1);
    const camps: AdminCamp[] = (campsRes.data ?? []).map((c) => ({
      id: c.id, name: c.name, slug: c.slug,
      accountType: (c.account_type as CampAccountType) ?? 'customer',
      status: (c.status as CampStatus) ?? 'active',
      plan: c.plan ?? null, trialEndsAt: c.trial_ends_at ?? null, orgId: c.org_id ?? null,
      isSeed: !!c.is_seed, createdAt: c.created_at, memberCount: counts.get(c.id) ?? 0,
    }));
    set({ camps, orgs: (orgsRes.data ?? []) as AdminOrg[], loading: false });
  },

  provisionCustomer: async ({ name, plan, orgId, buyerEmail }) => {
    const { data, error } = await supabase.rpc('provision_camp', {
      p_name: name, p_slug: slugify(name), p_account_type: 'customer', p_plan: plan, p_org_id: orgId,
    });
    if (error) throw new Error(error.message);
    const campId = data as string;
    const inviteUrl = await inviteAdmin(campId, buyerEmail);
    await get().load();
    return { campId, inviteUrl };
  },

  spinUpTrial: async ({ name, sourceCampId, buyerEmail, trialDays = 30 }) => {
    const { data, error } = await supabase.rpc('clone_camp', {
      p_source: sourceCampId, p_new_name: name, p_account_type: 'trial', p_trial_days: trialDays,
    });
    if (error) throw new Error(error.message);
    const campId = data as string;
    const inviteUrl = await inviteAdmin(campId, buyerEmail);
    await get().load();
    return { campId, inviteUrl };
  },

  setStatus: async (campId, status) => { await supabase.from('camps').update({ status }).eq('id', campId); await get().load(); },
  extendTrial: async (campId, days) => {
    const c = get().camps.find((x) => x.id === campId);
    const base = c?.trialEndsAt && new Date(c.trialEndsAt) > new Date() ? new Date(c.trialEndsAt) : new Date();
    base.setDate(base.getDate() + days);
    await supabase.from('camps').update({ trial_ends_at: base.toISOString(), status: 'active' }).eq('id', campId);
    await get().load();
  },
  setPlan: async (campId, plan) => { await supabase.from('camps').update({ plan }).eq('id', campId); await get().load(); },
  convertTrialToCustomer: async (campId, plan) => {
    await supabase.from('camps').update({ account_type: 'customer', status: 'active', trial_ends_at: null, plan }).eq('id', campId);
    await get().load();
  },
  setSeed: async (campId, isSeed) => { await supabase.from('camps').update({ is_seed: isSeed }).eq('id', campId); await get().load(); },
  createOrg: async (name) => { await supabase.from('organizations').insert({ name }); await get().load(); },
  setCampOrg: async (campId, orgId) => { await supabase.from('camps').update({ org_id: orgId }).eq('id', campId); await get().load(); },
}));
