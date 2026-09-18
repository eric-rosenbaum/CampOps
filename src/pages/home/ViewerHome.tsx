import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useIssuesStore } from '@/store/issuesStore';
import { usePoolStore } from '@/store/poolStore';
import { useModules } from '@/lib/modules';
import { useCampStore } from '@/store/campStore';
import { STATUS_LABELS } from '@/lib/workOrder';
import { TranslatedText } from '@/components/i18n/TranslatedText';

export function ViewerHome() {
  const { t } = useTranslation('home');
  const { t: tc } = useTranslation('common');
  const { currentCamp } = useCampStore();
  const issues = useIssuesStore((s) => s.issues);
  const pools = usePoolStore((s) => s.pools);
  const readings = usePoolStore((s) => s.chemicalReadings);

  const openIssues = useMemo(() => issues.filter((i) => i.status !== 'resolved'), [issues]);
  const urgentIssues = useMemo(() => openIssues.filter((i) => i.priority === 'urgent'), [openIssues]);

  const poolStatus = useMemo(() => {
    if (!pools.length) return null;
    const latest = [...readings].sort((a, b) => b.readingTime.localeCompare(a.readingTime))[0];
    return latest?.poolStatus ?? null;
  }, [pools, readings]);

  // Reads both switches (the platform's and the camp's) -- see lib/modules.ts.
  const modules = useModules();

  return (
    <div className="p-7 max-w-4xl">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-forest">{currentCamp?.name}</h1>
        <p className="text-[13px] text-ink-soft mt-0.5">{t('viewer.readOnly')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className={`rounded-xl border p-5 ${urgentIssues.length > 0 ? 'border-red-200 bg-red-50' : 'border-border bg-white'}`}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint mb-2">{t('viewer.openIssues')}</p>
          <p className={`text-2xl font-bold ${urgentIssues.length > 0 ? 'text-red-600' : 'text-forest'}`}>
            {openIssues.length}
          </p>
          {urgentIssues.length > 0 && (
            <p className="text-[11px] text-red-600/70 mt-1">{t('viewer.urgentCount', { count: urgentIssues.length })}</p>
          )}
        </div>
        {modules.enabled('pool') && poolStatus && (
          <div className="rounded-xl border border-border bg-white p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint mb-2">{t('poolStatus.label')}</p>
            <p className="text-2xl font-bold text-forest">{t(`poolStatus.${poolStatus}`)}</p>
          </div>
        )}
      </div>

      {openIssues.length > 0 && (
        <div className="bg-white rounded-xl border border-border">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-ink-soft" />
              <h2 className="text-[14px] font-semibold text-forest">{t('viewer.openIssues')}</h2>
            </div>
            <Link to="/campground" className="text-[12px] text-ink-soft hover:text-forest flex items-center gap-1">
              {t('viewAll')} <ChevronRight className="w-3 h-3 rtl:-scale-x-100" />
            </Link>
          </div>
          <div className="divide-y divide-stone-100">
            {openIssues.slice(0, 8).map((issue) => (
              <div key={issue.id} className="px-5 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <TranslatedText
                    as="p" source="issues" id={issue.id} field="title" text={issue.title}
                    className="text-[13px] font-medium text-forest"
                  />
                  <p className="text-[11px] text-ink-faint mt-0.5">
                    {issue.locations.join(', ') || t('noLocation')} · {STATUS_LABELS[issue.status]}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  issue.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                  issue.priority === 'high'   ? 'bg-amber-100 text-amber-700' :
                  'bg-cream-dark text-ink-soft'
                }`}>
                  {tc(`priority.${issue.priority}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
