import { useEffect, useState, useCallback } from 'react';
import {
  UserPlus, Copy, Check, Trash2, Plus, Link2, Mail,
  Pencil, ChevronDown, ChevronUp, Shield,
} from 'lucide-react';
import { useCampStore } from '@/store/campStore';
import type { CampRole, StaffGroup, StaffGroupModules, Invitation, JoinCode } from '@/store/campStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<CampRole, string> = {
  admin: 'Admin', staff: 'Staff', viewer: 'Viewer',
};

const MODULE_LABELS: Record<keyof StaffGroupModules, string> = {
  issues_repairs: 'Issues & Repairs',
  pre_post: 'Pre/Post Camp',
  pool: 'Pool Management',
  safety: 'Safety & Compliance',
  assets: 'Assets & Vehicles',
  building_systems: 'Building Systems',
};

const ALL_MODULES = Object.keys(MODULE_LABELS) as (keyof StaffGroupModules)[];

const EMPTY_MODULES: StaffGroupModules = {
  issues_repairs: false,
  pre_post: false,
  pool: false,
  safety: false,
  assets: false,
  building_systems: false,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModuleBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-forest/8 text-forest/60 border border-forest/10">
      {label}
    </span>
  );
}

interface GroupFormProps {
  initial?: { name: string; modules: StaffGroupModules; issuesSeeUnassigned: boolean; prepostSeeUnassigned: boolean };
  onSave: (name: string, modules: StaffGroupModules, issuesSeeUnassigned: boolean, prepostSeeUnassigned: boolean) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function GroupForm({ initial, onSave, onCancel, saving }: GroupFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [modules, setModules] = useState<StaffGroupModules>(
    initial?.modules ? { ...EMPTY_MODULES, ...initial.modules } : EMPTY_MODULES,
  );
  const [issuesSeeUnassigned, setIssuesSeeUnassigned] = useState(initial?.issuesSeeUnassigned ?? false);
  const [prepostSeeUnassigned, setPrepostSeeUnassigned] = useState(initial?.prepostSeeUnassigned ?? false);

  function toggleModule(key: keyof StaffGroupModules) {
    setModules((m) => ({ ...m, [key]: !m[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onSave(name.trim(), modules, issuesSeeUnassigned, prepostSeeUnassigned);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-forest/60 mb-1">Group name</label>
        <input
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Pool Staff, Maintenance Crew"
          className="w-full px-3 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-forest/60 mb-1.5">Module access</label>
        <div className="space-y-1">
          {ALL_MODULES.map((key) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={modules[key] ?? false}
                onChange={() => toggleModule(key)}
                className="w-3.5 h-3.5 accent-forest rounded"
              />
              <span className="text-[12px] text-forest group-hover:text-forest/80">{MODULE_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>

      {(modules.issues_repairs || modules.pre_post) && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="text-[11px] font-medium text-forest/60 mb-1">Task visibility</p>
          {modules.issues_repairs && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={issuesSeeUnassigned}
                onChange={(e) => setIssuesSeeUnassigned(e.target.checked)}
                className="w-3.5 h-3.5 accent-forest"
              />
              <span className="text-[12px] text-forest">Issues & Repairs — can see unassigned issues</span>
            </label>
          )}
          {modules.pre_post && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prepostSeeUnassigned}
                onChange={(e) => setPrepostSeeUnassigned(e.target.checked)}
                className="w-3.5 h-3.5 accent-forest"
              />
              <span className="text-[12px] text-forest">Pre/Post Camp — can see unassigned tasks</span>
            </label>
          )}
          <p className="text-[10px] text-forest/40 pt-0.5">
            Staff never see tasks assigned to other people — only their own and optionally unassigned ones.
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-forest/40 hover:text-forest px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="flex-1 bg-forest text-cream text-[12px] font-medium py-1.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : (initial ? 'Save changes' : 'Create group')}
        </button>
      </div>
    </form>
  );
}

interface AddLinkFormProps {
  onSave: (maxUses: number | null, days: number) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function AddLinkForm({ onSave, onCancel, saving }: AddLinkFormProps) {
  const [days, setDays] = useState('30');
  const [maxUses, setMaxUses] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave(maxUses ? parseInt(maxUses) : null, parseInt(days));
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-2">
      <div>
        <label className="block text-[10px] font-medium text-forest/50 mb-0.5">Expires (days)</label>
        <input
          type="number" min="1" max="365" required value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-20 px-2 py-1 border border-stone-200 rounded-lg text-[11px] text-forest focus:outline-none focus:ring-1 focus:ring-forest/20"
        />
      </div>
      <div>
        <label className="block text-[10px] font-medium text-forest/50 mb-0.5">Max uses</label>
        <input
          type="number" min="1" value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder="∞"
          className="w-16 px-2 py-1 border border-stone-200 rounded-lg text-[11px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-1 focus:ring-forest/20"
        />
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-[11px] text-forest/40 hover:text-forest px-2 py-1 rounded transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="bg-forest text-cream text-[11px] font-medium px-3 py-1 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
      >
        {saving ? '…' : 'Create'}
      </button>
    </form>
  );
}

// ─── StaffGroupCard ────────────────────────────────────────────────────────────

interface StaffGroupCardProps {
  group: StaffGroup;
  joinCodes: JoinCode[];
  campId: string;
  onUpdated: () => void;
}

function StaffGroupCard({ group, joinCodes, campId, onUpdated }: StaffGroupCardProps) {
  const { generateJoinCode, revokeJoinCode, updateStaffGroup, deleteStaffGroup } = useCampStore();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const groupCodes = joinCodes.filter((c) => c.staffGroupId === group.id);
  const enabledModules = ALL_MODULES.filter((k) => group.modules[k]);

  function joinCodeUrl(code: string) {
    return `${window.location.origin}/join?code=${code}`;
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatExpiry(expiresAt: string | null) {
    if (!expiresAt) return 'No expiry';
    const d = new Date(expiresAt);
    const diffDays = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires ${d.toLocaleDateString()}`;
  }

  async function handleSaveEdit(
    name: string, modules: StaffGroupModules,
    issuesSeeUnassigned: boolean, prepostSeeUnassigned: boolean
  ) {
    setSavingEdit(true);
    try {
      await updateStaffGroup(group.id, { name, modules, issuesSeeUnassigned, prepostSeeUnassigned });
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleAddLink(maxUses: number | null, days: number) {
    setSavingLink(true);
    setLinkError(null);
    try {
      await generateJoinCode(campId, 'staff', group.id, maxUses, days);
      setShowAddLink(false);
      onUpdated();
    } catch (err) {
      console.error('[handleAddLink]', err);
      setLinkError(err instanceof Error ? err.message : 'Failed to create join link');
    } finally {
      setSavingLink(false);
    }
  }

  async function handleDeleteGroup() {
    if (!confirm(`Delete "${group.name}"? This will remove all join links for this group. Members already in it will keep full access until reassigned.`)) return;
    await deleteStaffGroup(group.id);
  }

  async function handleRevokeCode(codeId: string) {
    if (!confirm('Revoke this join link?')) return;
    await revokeJoinCode(codeId);
    onUpdated();
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-forest/8 flex items-center justify-center flex-shrink-0">
          <Shield className="w-3.5 h-3.5 text-forest/50" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-forest">{group.name}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {enabledModules.length === 0 ? (
              <span className="text-[10px] text-forest/40 italic">No modules assigned</span>
            ) : (
              enabledModules.map((k) => <ModuleBadge key={k} label={MODULE_LABELS[k]} />)
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => { setEditing(true); setExpanded(true); }}
            className="p-1.5 rounded hover:bg-stone-100 text-stone-400 hover:text-forest transition-colors"
            title="Edit group"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteGroup}
            className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
            title="Delete group"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded hover:bg-stone-100 text-stone-400 hover:text-forest transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-stone-100 px-5 py-3">
          {editing ? (
            <GroupForm
              initial={{
                name: group.name,
                modules: group.modules,
                issuesSeeUnassigned: group.issuesSeeUnassigned,
                prepostSeeUnassigned: group.prepostSeeUnassigned,
              }}
              onSave={handleSaveEdit}
              onCancel={() => setEditing(false)}
              saving={savingEdit}
            />
          ) : (
            <>
              {/* Visibility notes */}
              {(group.modules.issues_repairs || group.modules.pre_post) && (
                <div className="mb-3 text-[11px] text-forest/50 space-y-0.5">
                  {group.modules.issues_repairs && (
                    <p>Issues & Repairs: {group.issuesSeeUnassigned ? 'assigned to them + unassigned' : 'assigned to them only'}</p>
                  )}
                  {group.modules.pre_post && (
                    <p>Pre/Post Camp: {group.prepostSeeUnassigned ? 'assigned to them + unassigned' : 'assigned to them only'}</p>
                  )}
                </div>
              )}

              {/* Join codes */}
              <p className="text-[11px] font-medium text-forest/50 mb-1.5">Join links</p>
              {groupCodes.length === 0 && !showAddLink && (
                <p className="text-[11px] text-forest/30 italic mb-2">No active links</p>
              )}
              {groupCodes.map((jc) => {
                const url = joinCodeUrl(jc.code);
                const codeKey = `${jc.id}-code`;
                const linkKey = `${jc.id}-link`;
                return (
                  <div key={jc.id} className="py-2.5 border-b border-stone-50 last:border-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-forest/40">
                        {jc.useCount}{jc.maxUses ? `/${jc.maxUses}` : ''} uses · {formatExpiry(jc.expiresAt)}
                      </span>
                      <button
                        onClick={() => handleRevokeCode(jc.id)}
                        className="p-1 rounded hover:bg-red-50 text-stone-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Short code */}
                      <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 flex-shrink-0">
                        <code className="text-[12px] font-mono font-bold text-forest tracking-widest">{jc.code}</code>
                        <button
                          onClick={() => handleCopy(jc.code, codeKey)}
                          className="text-forest/40 hover:text-forest transition-colors"
                          title="Copy code"
                        >
                          {copiedId === codeKey
                            ? <Check className="w-3 h-3 text-green-600" />
                            : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <span className="text-[10px] text-forest/30">or</span>
                      {/* Full link */}
                      <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 flex-1 min-w-0">
                        <Link2 className="w-3 h-3 text-forest/30 flex-shrink-0" />
                        <span className="text-[11px] text-forest/50 truncate flex-1">{url}</span>
                        <button
                          onClick={() => handleCopy(url, linkKey)}
                          className="text-forest/40 hover:text-forest transition-colors flex-shrink-0"
                          title="Copy link"
                        >
                          {copiedId === linkKey
                            ? <Check className="w-3 h-3 text-green-600" />
                            : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {showAddLink ? (
                <>
                  <AddLinkForm
                    onSave={handleAddLink}
                    onCancel={() => { setShowAddLink(false); setLinkError(null); }}
                    saving={savingLink}
                  />
                  {linkError && (
                    <p className="mt-1.5 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">{linkError}</p>
                  )}
                </>
              ) : (
                <button
                  onClick={() => setShowAddLink(true)}
                  className="mt-2 flex items-center gap-1.5 text-[11px] text-forest/50 hover:text-forest transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add join link
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Team() {
  const {
    currentCamp, currentMember, members,
    removeMember, updateMemberRole, staffGroups,
    createStaffGroup,
    inviteMember,
    loadInvitations, revokeInvitation,
    loadJoinCodes,
  } = useCampStore();
  const campId = currentCamp?.id ?? '';

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [joinCodes, setJoinCodes] = useState<JoinCode[]>([]);

  // Create group form
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);

  // Invite by email
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CampRole>('staff');
  const [inviteGroupId, setInviteGroupId] = useState<string>('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkEmail, setInviteLinkEmail] = useState('');

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const isAdmin = currentMember?.role === 'admin';

  const reload = useCallback(async () => {
    if (!campId) return;
    const [inv, codes] = await Promise.all([
      loadInvitations(campId),
      loadJoinCodes(campId),
    ]);
    setInvitations(inv);
    setJoinCodes(codes);
  }, [campId, loadInvitations, loadJoinCodes]);

  useEffect(() => { reload(); }, [reload]);

  // Pre-select first group when role switches to staff
  useEffect(() => {
    if (inviteRole === 'staff' && !inviteGroupId && staffGroups.length > 0) {
      setInviteGroupId(staffGroups[0].id);
    }
    if (inviteRole !== 'staff') setInviteGroupId('');
  }, [inviteRole, staffGroups]);

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleCreateGroup(
    name: string, modules: StaffGroupModules,
    issuesSeeUnassigned: boolean, prepostSeeUnassigned: boolean
  ) {
    setSavingGroup(true);
    try {
      await createStaffGroup(campId, name, modules, issuesSeeUnassigned, prepostSeeUnassigned);
      setShowCreateGroup(false);
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError(null);
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — check your connection and try again.')), 30_000)
      );
      const groupId = inviteRole === 'staff' ? inviteGroupId || null : null;
      const token = await Promise.race([
        inviteMember(campId, inviteEmail, inviteRole, groupId),
        timeout,
      ]);
      setInviteLinkEmail(inviteEmail);
      setInviteLink(`${window.location.origin}/invite/${token}`);
      setInviteEmail('');
      setInviteGroupId('');
      setShowInviteForm(false);
      reload();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to generate link. Please try again.');
    } finally {
      setInviteLoading(false);
    }
  }

  function mailtoHref(email: string, link: string) {
    const subject = encodeURIComponent(`You're invited to join ${currentCamp?.name ?? 'your camp'} on CampCommand`);
    const body = encodeURIComponent(
      `Hi,\n\nYou've been invited to join ${currentCamp?.name ?? 'your camp'} on CampCommand.\n\nClick the link below to create your account and get started:\n${link}\n\nThis invitation expires in 7 days.\n\nSee you there!`
    );
    return `mailto:${email}?subject=${subject}&body=${body}`;
  }

  function groupNameForMember(staffGroupId: string | null) {
    if (!staffGroupId) return null;
    return staffGroups.find((g) => g.id === staffGroupId)?.name ?? null;
  }

  function groupNameForInvite(inv: Invitation) {
    if (inv.role !== 'staff') return null;
    if (!inv.staffGroupId) return null;
    return staffGroups.find((g) => g.id === inv.staffGroupId)?.name ?? null;
  }

  // Legacy join codes have no staffGroupId
  const legacyJoinCodes = joinCodes.filter((c) => !c.staffGroupId);

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-7 max-w-3xl">
      <div className="mb-7">
        <h1 className="text-[20px] font-bold text-forest">Team</h1>
        <p className="text-[12px] text-forest/50 mt-0.5">{members.length} active member{members.length !== 1 ? 's' : ''}</p>
      </div>

      {/* ─── Staff Groups ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[14px] font-semibold text-forest">Staff groups</h2>
            <p className="text-[11px] text-forest/40 mt-0.5">Each group controls which modules staff can access and how tasks are filtered.</p>
          </div>
          {isAdmin && !showCreateGroup && (
            <button
              onClick={() => setShowCreateGroup(true)}
              className="flex items-center gap-1.5 bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-forest/90 transition-colors flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              New group
            </button>
          )}
        </div>

        {showCreateGroup && (
          <div className="bg-white border border-stone-200 rounded-xl p-5 mb-3">
            <h3 className="text-[13px] font-semibold text-forest mb-3">New staff group</h3>
            <GroupForm
              onSave={handleCreateGroup}
              onCancel={() => setShowCreateGroup(false)}
              saving={savingGroup}
            />
          </div>
        )}

        <div className="space-y-3">
          {staffGroups.length === 0 && !showCreateGroup && (
            <div className="bg-white border border-dashed border-stone-200 rounded-xl px-5 py-6 text-center">
              <p className="text-[13px] font-medium text-forest/50">No staff groups yet</p>
              <p className="text-[11px] text-forest/35 mt-1">Create a group to start inviting staff with specific module access.</p>
            </div>
          )}
          {staffGroups.map((group) => (
            <StaffGroupCard
              key={group.id}
              group={group}
              joinCodes={joinCodes}
              campId={campId}
              onUpdated={reload}
            />
          ))}
        </div>

        {/* Legacy join codes (no group attached) */}
        {legacyJoinCodes.length > 0 && (
          <div className="bg-white border border-stone-200 rounded-xl mt-3 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-100">
              <h3 className="text-[12px] font-semibold text-forest/60">Legacy join links</h3>
              <p className="text-[11px] text-forest/40">Created before groups were introduced. Staff who join with these links get full access.</p>
            </div>
            <div className="px-5 py-3 space-y-2">
              {legacyJoinCodes.map((jc) => {
                const url = `${window.location.origin}/join?code=${jc.code}`;
                return (
                  <div key={jc.id} className="flex items-center gap-3">
                    <code className="text-[11px] font-mono font-bold text-forest tracking-widest w-16">{jc.code}</code>
                    <span className="text-[10px] text-forest/40 flex-1">
                      {ROLE_LABELS[jc.role]} · {jc.useCount}{jc.maxUses ? `/${jc.maxUses}` : ''} uses
                    </span>
                    <button
                      onClick={() => handleCopy(url, jc.id)}
                      className="flex items-center gap-1 text-[10px] text-forest/50 hover:text-forest transition-colors"
                    >
                      {copiedId === jc.id ? <><Check className="w-2.5 h-2.5 text-green-600" /> Copied</> : <><Link2 className="w-2.5 h-2.5" /> Copy</>}
                    </button>
                    <button
                      onClick={async () => {
                        const { revokeJoinCode } = useCampStore.getState();
                        if (!confirm('Revoke this join link?')) return;
                        await revokeJoinCode(jc.id);
                        reload();
                      }}
                      className="p-1 rounded hover:bg-red-50 text-stone-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Invite by email ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
        <h2 className="text-[13px] font-semibold text-forest mb-0.5">Invite by email</h2>
        <p className="text-[11px] text-forest/40 leading-relaxed mb-4">
          For specific people. The link is tied to their email address — only they can use it.
        </p>

        {!showInviteForm && !inviteLink && (
          <button
            onClick={() => setShowInviteForm(true)}
            className="flex items-center gap-2 bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-forest/90 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite someone
          </button>
        )}

        {showInviteForm && !inviteLink && (
          <form onSubmit={handleInvite} className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-medium text-forest/60 mb-1">Email address</label>
              <input
                type="email" required autoFocus value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as CampRole)}
                  className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
                >
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {inviteRole === 'staff' && (
                <div>
                  <label className="block text-[11px] font-medium text-forest/60 mb-1">Staff group</label>
                  {staffGroups.length === 0 ? (
                    <p className="text-[11px] text-red-500 pt-1.5">Create a staff group first</p>
                  ) : (
                    <select
                      value={inviteGroupId}
                      onChange={(e) => setInviteGroupId(e.target.value)}
                      required
                      className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
                    >
                      <option value="">Select group…</option>
                      {staffGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>

            {inviteError && (
              <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{inviteError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowInviteForm(false); setInviteError(null); }}
                className="text-[12px] text-forest/40 hover:text-forest px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviteLoading || (inviteRole === 'staff' && !inviteGroupId)}
                className="flex-1 bg-forest text-cream text-[12px] font-medium py-1.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
              >
                {inviteLoading ? 'Generating…' : 'Generate link'}
              </button>
            </div>
          </form>
        )}

        {inviteLink && (
          <div>
            <p className="text-[11px] text-forest/50 mb-2">
              Share this link with <strong>{inviteLinkEmail}</strong>:
            </p>
            <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 mb-2.5">
              <code className="text-[10px] text-forest break-all leading-relaxed">{inviteLink}</code>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => handleCopy(inviteLink, 'invite-link')}
                className="flex items-center gap-1.5 text-[11px] text-forest font-medium px-2.5 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
              >
                {copiedId === 'invite-link' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copiedId === 'invite-link' ? 'Copied!' : 'Copy link'}
              </button>
              <a
                href={mailtoHref(inviteLinkEmail, inviteLink)}
                className="flex items-center gap-1.5 text-[11px] text-forest font-medium px-2.5 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
              >
                <Mail className="w-3 h-3" />
                Open in email
              </a>
            </div>
            <button
              onClick={() => { setInviteLink(null); setInviteLinkEmail(''); setShowInviteForm(true); }}
              className="text-[11px] text-forest/40 hover:text-forest transition-colors"
            >
              + Invite another person
            </button>
          </div>
        )}
      </div>

      {/* ─── Active members ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl mb-6">
        <div className="px-5 py-4 border-b border-stone-100">
          <h2 className="text-[13px] font-semibold text-forest">Active members</h2>
        </div>
        <div className="divide-y divide-stone-100">
          {roleError && (
            <div className="px-5 py-2 bg-red-50 text-red-600 text-[12px]">{roleError}</div>
          )}
          {members.map((m) => {
            const isSelf = m.userId === currentMember?.userId;
            const locked = m.isCreator || isSelf || !isAdmin;
            const groupName = groupNameForMember(m.staffGroupId);
            return (
              <div key={m.id} className="px-5 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-forest text-cream text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                  {m.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-medium text-forest truncate">{m.fullName}</p>
                    {m.isCreator && (
                      <span className="text-[10px] font-medium text-forest/40 bg-stone-100 px-1.5 py-0.5 rounded">Creator</span>
                    )}
                  </div>
                  {m.role === 'staff' && (
                    <p className="text-[11px] text-forest/40">{groupName ?? 'Full access (legacy)'}</p>
                  )}
                </div>
                <select
                  value={m.role}
                  disabled={locked}
                  onChange={async (e) => {
                    setRoleError(null);
                    const newRole = e.target.value as CampRole;
                    try {
                      await updateMemberRole(m.id, newRole, newRole === 'staff' ? m.staffGroupId : null);
                      reload();
                    } catch (err) {
                      setRoleError(err instanceof Error ? err.message : 'Failed to update role');
                    }
                  }}
                  className="text-[12px] border border-stone-200 rounded-md px-2 py-1 text-forest bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {isAdmin && m.role === 'staff' && !isSelf && !m.isCreator && (
                  <select
                    value={m.staffGroupId ?? ''}
                    onChange={async (e) => {
                      setRoleError(null);
                      try {
                        await updateMemberRole(m.id, 'staff', e.target.value || null);
                        reload();
                      } catch (err) {
                        setRoleError(err instanceof Error ? err.message : 'Failed to update group');
                      }
                    }}
                    className="text-[12px] border border-stone-200 rounded-md px-2 py-1 text-forest bg-white"
                  >
                    <option value="">Full access</option>
                    {staffGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                )}
                {isAdmin && !isSelf && !m.isCreator && (
                  <button
                    onClick={async () => {
                      if (!confirm('Remove this member from the camp?')) return;
                      await removeMember(m.id);
                      reload();
                    }}
                    className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Pending invitations ──────────────────────────────────────────────── */}
      {invitations.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="text-[13px] font-semibold text-forest">Pending invitations</h2>
          </div>
          <div className="divide-y divide-stone-100">
            {invitations.map((inv) => {
              const link = `${window.location.origin}/invite/${inv.token}`;
              const gName = groupNameForInvite(inv);
              return (
                <div key={inv.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-forest truncate">{inv.email}</p>
                    <p className="text-[11px] text-forest/40">
                      {ROLE_LABELS[inv.role]}{gName ? ` · ${gName}` : ''} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(link, `inv-${inv.id}`)}
                    className="flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest transition-colors flex-shrink-0"
                  >
                    {copiedId === `inv-${inv.id}` ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    {copiedId === `inv-${inv.id}` ? 'Copied!' : 'Copy link'}
                  </button>
                  <a
                    href={mailtoHref(inv.email, link)}
                    className="flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest transition-colors flex-shrink-0"
                  >
                    <Mail className="w-3 h-3" />
                    Send email
                  </a>
                  <button
                    onClick={async () => { await revokeInvitation(inv.id); reload(); }}
                    className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
