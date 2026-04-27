import { useEffect, useState, useCallback } from 'react';
import { Copy, Check, Trash2, Plus } from 'lucide-react';
import { useCampStore } from '@/store/campStore';
import type { JoinCode, CampRole, Department } from '@/store/campStore';

const ROLE_LABELS: Record<CampRole, string> = {
  admin: 'Admin', staff: 'Staff', viewer: 'Viewer',
};

const DEPT_LABELS: Record<string, string> = {
  waterfront: 'Waterfront', maintenance: 'Maintenance', kitchen: 'Kitchen',
  administration: 'Administration', health: 'Health', program: 'Program', other: 'Other',
};

export function JoinCodes() {
  const { currentCamp, loadJoinCodes, generateJoinCode, revokeJoinCode } = useCampStore();
  const campId = currentCamp?.id ?? '';

  const [codes, setCodes] = useState<JoinCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [role, setRole] = useState<CampRole>('staff');
  const [dept, setDept] = useState<Department | ''>('');
  const [maxUses, setMaxUses] = useState<string>('');
  const [days, setDays] = useState('30');
  const [generating, setGenerating] = useState(false);

  const reload = useCallback(async () => {
    if (!campId) return;
    const data = await loadJoinCodes(campId);
    setCodes(data);
    setLoading(false);
  }, [campId, loadJoinCodes]);

  useEffect(() => { reload(); }, [reload]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    try {
      await generateJoinCode(campId, role, dept as Department | null || null, maxUses ? parseInt(maxUses) : null, parseInt(days));
      setShowForm(false);
      setMaxUses('');
      setDays('30');
      reload();
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleRevoke(codeId: string) {
    if (!confirm('Revoke this join code? Anyone who has it will no longer be able to use it.')) return;
    await revokeJoinCode(codeId);
    reload();
  }

  function formatExpiry(expiresAt: string | null) {
    if (!expiresAt) return 'No expiry';
    const d = new Date(expiresAt);
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires ${d.toLocaleDateString()}`;
  }

  if (loading) {
    return <div className="p-7 text-[13px] text-forest/40">Loading…</div>;
  }

  return (
    <div className="p-7 max-w-3xl">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[20px] font-bold text-forest">Join Codes</h1>
          <p className="text-[12px] text-forest/50 mt-0.5">Share a code so staff can join without a direct invite</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-forest/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New code
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
          <h2 className="text-[14px] font-semibold text-forest mb-4">Generate join code</h2>
          <form onSubmit={handleGenerate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as CampRole)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                >
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Expires after (days)</label>
                <input
                  type="number" min="1" max="365" required value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                />
              </div>
            </div>
            {role === 'staff' && (
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Department (optional)</label>
                <select
                  value={dept}
                  onChange={(e) => setDept(e.target.value as Department)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                >
                  <option value="">None</option>
                  {Object.entries(DEPT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-forest/60 mb-1">Max uses (leave blank for unlimited)</label>
              <input
                type="number" min="1" value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
              />
            </div>
            <button
              type="submit"
              disabled={generating}
              className="bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Generate code'}
            </button>
          </form>
        </div>
      )}

      {codes.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-10 text-center">
          <p className="text-[13px] text-forest/40">No active join codes.</p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="text-[13px] font-semibold text-forest">Active codes</h2>
          </div>
          <div className="divide-y divide-stone-100">
            {codes.map((jc) => (
              <div key={jc.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <code className="text-[15px] font-mono font-semibold text-forest tracking-widest">{jc.code}</code>
                    <button
                      onClick={() => handleCopy(jc.code, jc.id)}
                      className="p-1 rounded hover:bg-stone-100 transition-colors"
                    >
                      {copiedId === jc.id
                        ? <Check className="w-3.5 h-3.5 text-green-600" />
                        : <Copy className="w-3.5 h-3.5 text-forest/40" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-forest/40">
                    {ROLE_LABELS[jc.role]}
                    {jc.department ? ` · ${DEPT_LABELS[jc.department] ?? jc.department}` : ''}
                    {' · '}
                    {jc.useCount}{jc.maxUses ? `/${jc.maxUses}` : ''} use{jc.useCount !== 1 ? 's' : ''}
                    {' · '}
                    {formatExpiry(jc.expiresAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(jc.id)}
                  className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
