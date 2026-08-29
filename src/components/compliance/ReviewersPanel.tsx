import { ExternalLink, Download, FileText, MapPin, Mail, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore, type AuthoritySummary } from '@/store/complianceStore';
import type { ComplianceAuthority } from '@/lib/types';

/**
 * Who reviews this camp, and what each of them will ask for.
 *
 * The honest shape of this page for a New York camp is one inspector and several recipients:
 * the county health department is the only party that reliably walks the property, and the
 * rest receive filings and never visit. Modelling them all as "inspections" would misrepresent
 * five of the six, so a party that does not attend says so rather than showing an empty visit
 * schedule.
 *
 * Every document listed here is the official blank. Where we do not hold one, the row says so
 * and says where to get it, because a list that quietly omits what we lack would read as the
 * complete set of what the county wants.
 */

const LEVEL_LABEL: Record<ComplianceAuthority['level'], string> = {
  federal: 'Federal', state: 'State', county: 'County', municipal: 'Local',
  accreditor: 'Accreditor', insurer: 'Insurer', internal: 'Internal',
};

export function ReviewersPanel() {
  const authorities = useComplianceStore((s) => s.authorities);
  const enabledProfileIds = useComplianceStore((s) => s.enabledProfileIds);
  const st = useComplianceStore();
  const summaries = st.activeAuthorities();

  if (authorities.length === 0 || enabledProfileIds.length === 0) {
    return (
      <p className="text-[13px] text-ink-faint italic py-6">
        Finish setup and your reviewing parties will be listed here.
      </p>
    );
  }

  const visiting = summaries.filter((s) => s.authority.visitsSite);
  const filing = summaries.filter((s) => !s.authority.visitsSite);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-card border border-border px-5 py-4">
        <h3 className="text-[15px] font-semibold text-forest">Who reviews your camp</h3>
        <p className="text-[12.5px] text-ink-soft mt-1.5 leading-relaxed max-w-[75ch]">
          Your county health department holds your permit and is the one party that comes to the
          property. The others receive paperwork and never visit, which is exactly why they are
          easy to forget. Every form below is the official blank as published.
        </p>
      </div>

      {visiting.length > 0 && (
        <section>
          <h4 className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-2.5">
            Comes to your camp
          </h4>
          <div className="space-y-3">
            {visiting.map((s) => <AuthorityCard key={s.authority.id} summary={s} />)}
          </div>
        </section>
      )}

      {filing.length > 0 && (
        <section>
          <h4 className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-2.5">
            Receives paperwork, does not visit
          </h4>
          <div className="space-y-3">
            {filing.map((s) => <AuthorityCard key={s.authority.id} summary={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function AuthorityCard({ summary }: { summary: AuthoritySummary }) {
  const forms = useComplianceStore((s) => s.authorityForms).filter(
    (f) => f.authorityId === summary.authority.id,
  ).sort((a, b) => a.sortOrder - b.sortOrder);
  const a = summary.authority;

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14.5px] font-semibold text-forest">{a.name}</p>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft bg-cream-dark rounded-btn px-2 py-0.5">
                {LEVEL_LABEL[a.level]}
              </span>
            </div>
            {a.scope && (
              <p className="text-[12.5px] text-ink-soft mt-1.5 leading-relaxed max-w-[72ch]">{a.scope}</p>
            )}
          </div>
          {summary.total > 0 && (
            <div className="text-right flex-shrink-0">
              <p className="font-mono text-[19px] text-forest leading-none">{summary.percent}%</p>
              <p className="text-[11px] text-ink-faint mt-1">
                {summary.outstanding} of {summary.met + summary.outstanding} outstanding
              </p>
            </div>
          )}
        </div>

        <div className="mt-3.5 space-y-1.5">
          <p className="text-[12.5px] text-ink-soft flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-ink-faint" />
            <span>
              <span className="font-semibold text-forest">
                {a.visitsSite ? 'When they come: ' : 'How they review you: '}
              </span>
              {a.visitSchedule ?? 'Not recorded.'}
            </span>
          </p>
          {a.contactNote && (
            <p className="text-[12.5px] text-ink-soft flex items-start gap-2">
              <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-ink-faint" />
              <span>{a.contactNote}</span>
            </p>
          )}
          {a.sourceUrl && (
            <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer"
               className="text-[12.5px] text-sage hover:text-forest inline-flex items-center gap-1.5">
              Their published guidance <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-cream/40 px-5 py-3.5">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">
          What they will ask for
        </p>
        {forms.length === 0 ? (
          <p className="text-[12.5px] text-ink-soft mt-2 leading-relaxed">
            No form of their own. What they want is covered by your written plan and records, which
            you will find under Your records.
          </p>
        ) : (
          <div className="mt-2.5 space-y-1.5">
            {forms.map((f) => (
              <div key={f.id} className="flex items-center gap-3 flex-wrap">
                <FileText className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-forest">
                    {f.designation && <span className="font-semibold">{f.designation} </span>}
                    {f.title}
                    {f.revision && <span className="font-mono text-[11px] text-ink-faint"> {f.revision}</span>}
                  </p>
                  <p className="text-[11px] text-ink-faint">
                    {f.issuedBy && <>Published by {f.issuedBy}</>}
                    {/* Most of the county's sub-forms are pages of one packet rather than
                        separate downloads, so say which pages instead of shipping the same
                        file eight times under different names. */}
                    {f.pageRef && <> · {f.pageRef} of the county packet</>}
                  </p>
                  {!f.bundledPath && (
                    <p className="text-[11.5px] text-amber-text inline-flex items-start gap-1.5 mt-0.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {f.obtainNote ?? 'We do not hold a copy of this form. Request it from the issuing office.'}
                    </p>
                  )}
                </div>
                {f.bundledPath ? (
                  <a href={f.bundledPath} download className="flex-shrink-0">
                    <Button size="sm" variant="ghost">
                      <Download className="w-3.5 h-3.5" /> {f.pageRef ? 'Packet' : 'Blank'}
                    </Button>
                  </a>
                ) : f.sourceUrl ? (
                  <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <Button size="sm" variant="ghost">
                      <ExternalLink className="w-3.5 h-3.5" /> Source
                    </Button>
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
