import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Waves, Shield, Truck, ChevronRight } from 'lucide-react';
import { useIssuesStore } from '@/store/issuesStore';
import { usePoolStore } from '@/store/poolStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useCampStore } from '@/store/campStore';

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-white'}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-forest/40 mb-2">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-red-600' : 'text-forest'}`}>{value}</p>
      {sub && <p className="text-[11px] text-forest/50 mt-1">{sub}</p>}
    </div>
  );
}

export function AdminHome() {
  const { currentCamp } = useCampStore();
  const issues = useIssuesStore((s) => s.issues);
  const pools = usePoolStore((s) => s.pools);
  const readings = usePoolStore((s) => s.chemicalReadings);
  const certifications = useSafetyStore((s) => s.certifications);

  const openIssues = useMemo(() => issues.filter((i) => i.status !== 'resolved'), [issues]);
  const urgentIssues = useMemo(() => openIssues.filter((i) => i.priority === 'urgent'), [openIssues]);
  const recentIssues = useMemo(() => [...openIssues].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [openIssues]);

  const poolStatus = useMemo(() => {
    if (!pools.length) return null;
    const latestByPool: Record<string, string> = {};
    for (const r of readings) {
      if (!latestByPool[r.poolId] || r.readingTime > latestByPool[r.poolId]) {
        latestByPool[r.poolId] = r.poolStatus ?? 'open_all_clear';
      }
    }
    const statuses = Object.values(latestByPool);
    if (statuses.some((s) => s === 'closed_corrective' || s === 'closed_retest')) return 'CLOSED';
    if (statuses.some((s) => s === 'open_monitoring')) return 'Monitoring';
    return 'Open';
  }, [pools, readings]);

  const expiringCerts = useMemo(() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    return certifications.filter((c) => {
      if (!c.expiryDate) return false;
      const d = new Date(c.expiryDate);
      return d >= now && d <= in30;
    });
  }, [certifications]);

  const modules = currentCamp?.modules ?? {};

  return (
    <div className="p-7 max-w-5xl">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-forest">{currentCamp?.name}</h1>
        <p className="text-[13px] text-forest/50 mt-0.5">Overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Open Issues"
          value={openIssues.length}
          sub={urgentIssues.length ? `${urgentIssues.length} urgent` : undefined}
          accent={urgentIssues.length > 0}
        />
        {modules.pool && poolStatus && (
          <StatCard label="Pool Status" value={poolStatus} />
        )}
        {modules.staff && (
          <StatCard
            label="Expiring Certs"
            value={expiringCerts.length}
            sub="Within 30 days"
            accent={expiringCerts.length > 0}
          />
        )}
        <StatCard label="Active Modules" value={Object.values(modules).filter(Boolean).length} />
      </div>

      {/* Recent open issues */}
      {openIssues.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 mb-6">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-forest/50" />
              <h2 className="text-[14px] font-semibold text-forest">Open Issues</h2>
            </div>
            <Link to="/issues" className="text-[12px] text-forest/50 hover:text-forest flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-stone-100">
            {recentIssues.map((issue) => (
              <div key={issue.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-forest">{issue.title}</p>
                  <p className="text-[11px] text-forest/40 mt-0.5">
                    {issue.locations.join(', ') || 'No location'} · {issue.status.replace('_', ' ')}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  issue.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                  issue.priority === 'high'   ? 'bg-amber-100 text-amber-700' :
                  'bg-stone-100 text-stone-500'
                }`}>
                  {issue.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {modules.pool && (
          <Link to="/pool" className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-4 hover:border-forest/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Waves className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-[13px] font-medium text-forest">Pool & Waterfront</span>
          </Link>
        )}
        {modules.safety && (
          <Link to="/safety" className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-4 hover:border-forest/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Shield className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-[13px] font-medium text-forest">Safety & Compliance</span>
          </Link>
        )}
        {modules.assets && (
          <Link to="/assets" className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-4 hover:border-forest/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <Truck className="w-4 h-4 text-purple-600" />
            </div>
            <span className="text-[13px] font-medium text-forest">Assets & Vehicles</span>
          </Link>
        )}
      </div>
    </div>
  );
}
