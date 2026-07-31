import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { sendEmail, buildInviteEmail } from '@/lib/email';
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
  deletedAt: string | null;
}
export interface AdminOrg { id: string; name: string; }
export interface PlatformAdmin { userId: string; email: string; addedAt: string; }
export interface CampAccount {
  userId: string | null;
  email: string;
  fullName: string | null;
  role: string;
  staffGroup: string | null;
  status: 'active' | 'inactive' | 'invited';
  since: string;
}

interface AdminState {
  camps: AdminCamp[];
  deletedCamps: AdminCamp[];
  orgs: AdminOrg[];
  platformAdmins: PlatformAdmin[];
  loading: boolean;
  load: () => Promise<void>;

  listCampAccounts: (campId: string) => Promise<CampAccount[]>;
  addPlatformAdmin: (email: string) => Promise<void>;
  removePlatformAdmin: (userId: string) => Promise<void>;
  deleteCamp: (campId: string) => Promise<void>;
  restoreCamp: (campId: string) => Promise<void>;

  provisionCustomer: (opts: { name: string; plan: string | null; orgId: string | null; buyerEmail: string }) => Promise<{ campId: string; inviteUrl: string; email: string; emailed: boolean; emailError?: string }>;
  spinUpTrial: (opts: { name: string; sourceCampId: string; trialDays?: number }) => Promise<{ campId: string; shareUrl: string }>;
  demoLink: (campId: string) => Promise<string>;
  setStatus: (campId: string, status: CampStatus) => Promise<void>;
  extendTrial: (campId: string, days: number) => Promise<void>;
  setPlan: (campId: string, plan: string | null) => Promise<void>;
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
  deletedCamps: [],
  orgs: [],
  platformAdmins: [],
  loading: true,

  load: async () => {
    set({ loading: true });
    const [campsRes, orgsRes, membersRes, adminsRes] = await Promise.all([
      supabase.from('camps').select('id, name, slug, account_type, status, plan, trial_ends_at, org_id, is_seed, created_at, deleted_at').order('created_at', { ascending: false }),
      supabase.from('organizations').select('id, name').order('name'),
      supabase.from('camp_members').select('camp_id').eq('is_active', true),
      supabase.rpc('list_platform_admins'),
    ]);
    const platformAdmins: PlatformAdmin[] = (adminsRes.data ?? []).map((a: { user_id: string; email: string; added_at: string }) => ({ userId: a.user_id, email: a.email, addedAt: a.added_at }));
    const counts = new Map<string, number>();
    for (const m of membersRes.data ?? []) counts.set(m.camp_id as string, (counts.get(m.camp_id as string) ?? 0) + 1);
    const all: AdminCamp[] = (campsRes.data ?? []).map((c) => ({
      id: c.id, name: c.name, slug: c.slug,
      accountType: (c.account_type as CampAccountType) ?? 'customer',
      status: (c.status as CampStatus) ?? 'active',
      plan: c.plan ?? null, trialEndsAt: c.trial_ends_at ?? null, orgId: c.org_id ?? null,
      isSeed: !!c.is_seed, createdAt: c.created_at, memberCount: counts.get(c.id) ?? 0,
      deletedAt: c.deleted_at ?? null,
    }));
    set({
      camps: all.filter((c) => !c.deletedAt),
      deletedCamps: all.filter((c) => c.deletedAt),
      orgs: (orgsRes.data ?? []) as AdminOrg[], platformAdmins, loading: false,
    });
  },

  listCampAccounts: async (campId) => {
    const { data, error } = await supabase.rpc('admin_list_camp_accounts', { p_camp_id: campId });
    if (error) throw new Error(error.message);
    return (data ?? []).map((a: { user_id: string | null; email: string; full_name: string | null; role: string; staff_group: string | null; status: string; since: string }) => ({
      userId: a.user_id, email: a.email, fullName: a.full_name, role: a.role,
      staffGroup: a.staff_group, status: a.status as CampAccount['status'], since: a.since,
    }));
  },

  addPlatformAdmin: async (email) => {
    const { error } = await supabase.rpc('add_platform_admin', { p_email: email.trim() });
    if (error) throw new Error(error.message);
    await get().load();
  },
  removePlatformAdmin: async (userId) => {
    const { error } = await supabase.rpc('remove_platform_admin', { p_user_id: userId });
    if (error) throw new Error(error.message);
    await get().load();
  },

  provisionCustomer: async ({ name, plan, orgId, buyerEmail }) => {
    const { data, error } = await supabase.rpc('provision_camp', {
      p_name: name, p_slug: slugify(name), p_account_type: 'customer', p_plan: plan, p_org_id: orgId,
    });
    if (error) throw new Error(error.message);
    const campId = data as string;
    const email = buyerEmail.trim();
    const inviteUrl = await inviteAdmin(campId, email);
    // Email the buyer their sign-in link. If it fails (email not configured, provider error),
    // we still return the link so the founder can send it manually — provisioning itself succeeds.
    const { subject, html } = buildInviteEmail(name, inviteUrl);
    const res = await sendEmail({ to: email, subject, html, fromName: 'CampCommand' });
    await get().load();
    return { campId, inviteUrl, email, emailed: res.ok, emailError: res.ok ? undefined : res.error };
  },

  spinUpTrial: async ({ name, sourceCampId, trialDays = 30 }) => {
    const { data, error } = await supabase.rpc('clone_camp', {
      p_source: sourceCampId, p_new_name: name, p_account_type: 'trial', p_trial_days: trialDays,
    });
    if (error) throw new Error(error.message);
    const campId = data as string;
    const shareUrl = await get().demoLink(campId);
    await get().load();
    return { campId, shareUrl };
  },
  demoLink: async (campId) => {
    const { data, error } = await supabase.rpc('demo_share_link', { p_camp_id: campId });
    if (error) throw new Error(error.message);
    return `${window.location.origin}/try/${data as string}`;
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
  setSeed: async (campId, isSeed) => { await supabase.from('camps').update({ is_seed: isSeed }).eq('id', campId); await get().load(); },
  deleteCamp: async (campId) => { const { error } = await supabase.rpc('soft_delete_camp', { p_camp_id: campId }); if (error) throw new Error(error.message); await get().load(); },
  restoreCamp: async (campId) => { const { error } = await supabase.rpc('restore_camp', { p_camp_id: campId }); if (error) throw new Error(error.message); await get().load(); },
  createOrg: async (name) => { await supabase.from('organizations').insert({ name }); await get().load(); },
  setCampOrg: async (campId, orgId) => { await supabase.from('camps').update({ org_id: orgId }).eq('id', campId); await get().load(); },
}));
