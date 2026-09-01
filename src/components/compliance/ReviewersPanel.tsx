import { useState } from 'react';
import {
  ExternalLink, Download, FileText, CalendarClock, Upload, Check, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore, type AuthoritySummary } from '@/store/complianceStore';
import { todayStr } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { ComplianceAuthority, ComplianceAuthorityForm } from '@/lib/types';

/**
 * Every party that reviews this camp, and the official document each one expects.
 *
 * The page answers one question: who is going to ask, and what will they want. So it lists the
 * real blanks rather than describing them. Where we do not hold a form, it says who issues it
 * and takes the camp's own copy, because "we do not have this" with no next step is not an
 * answer to anyone.
 */

const LEVEL_LABEL: Record<ComplianceAuthority['level'], string> = {
  federal: 'Federal', state: 'State', county: 'County', municipal: 'Local',
  accreditor: 'Accreditor', insurer: 'Insurer', internal: 'Internal',
};

export function ReviewersPanel({ onUpload }: { onUpload: (formTitle: string) => void }) {
  const st = useComplianceStore();
  const authorities = useComplianceStore((s) => s.authorities);
  const enabledProfileIds = useComplianceStore((s) => s.enabledProfileIds);
  const summaries = st.activeAuthorities();
  // Everything starts closed. Opening one for the camp guesses which reviewer they came here
  // about, and lands them mid-list when they switch tabs.
  const [open, setOpen] = useState<string | null>(null);

  if (authorities.length === 0 || enabledProfileIds.length === 0) {
    return (
      <p className="text-[13px] text-ink-faint italic py-6">
        Finish setup and your reviewing parties will be listed here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-card border border-border px-5 py-4">
        <h3 className="text-[15px] font-semibold text-forest">
          Parties that require compliance documentation or inspection
        </h3>
      </div>

      {summaries.map((s) => (
        <AuthorityCard
          key={s.authority.id}
          summary={s}
          isOpen={open === s.authority.id}
          onToggle={() => setOpen(open === s.authority.id ? null : s.authority.id)}
          onUpload={onUpload}
        />
      ))}
    </div>
  );
}

function AuthorityCard({ summary, isOpen, onToggle, onUpload }: {
  summary: AuthoritySummary;
  isOpen: boolean;
  onToggle: () => void;
  onUpload: (formTitle: string) => void;
}) {
  const forms = useComplianceStore((s) => s.authorityForms)
    .filter((f) => f.authorityId === summary.authority.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const a = summary.authority;
  const outstandingForms = forms.filter((f) => f.campSupplied).length;

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-cream transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14.5px] font-semibold text-forest">{a.name}</p>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft bg-cream-dark rounded-btn px-2 py-0.5">
              {LEVEL_LABEL[a.level]}
            </span>
          </div>
          <p className="text-[11.5px] text-ink-faint mt-1">
            {forms.length === 0
              ? 'No form of their own'
              : `${forms.length} document${forms.length === 1 ? '' : 's'}`}
            {outstandingForms > 0 && ` · ${outstandingForms} you supply`}
            {summary.met + summary.outstanding > 0 &&
              ` · ${summary.outstanding} requirement${summary.outstanding === 1 ? '' : 's'} outstanding`}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-ink-faint flex-shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
      </button>

      {isOpen && (
        <div className="border-t border-border">
          <div className="px-5 py-4">
            {a.scope && (
              <p className="text-[12.5px] text-ink-soft leading-relaxed">{a.scope}</p>
            )}
            <div className="mt-3 space-y-1.5">
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
                No form of their own. What they want is covered by your written plan and records,
                which you will find on the Requirements tab.
              </p>
            ) : (
              <div className="mt-2.5 space-y-2">
                {forms.map((f) => <FormRow key={f.id} form={f} onUpload={onUpload} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FormRow({ form: f, onUpload }: {
  form: ComplianceAuthorityForm;
  onUpload: (formTitle: string) => void;
}) {
  const documents = useComplianceStore((s) => s.documents);
  const timing = useComplianceStore((s) => s.formTiming)(f.requirementCode);
  const today = todayStr();
  const { can } = useAuth();

  // A loose title match is the honest signal available: these forms are not requirements, so
  // there is no link table. It surfaces a probable match rather than asserting one.
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const uploaded = documents.find((d) =>
    norm(d.title).includes(norm(f.designation ?? f.title).slice(0, 24)));

  return (
    <div className="flex items-start gap-3 flex-wrap">
      <FileText className="w-3.5 h-3.5 text-ink-faint flex-shrink-0 mt-1" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-forest">
          {f.designation && <span className="font-semibold">{f.designation} </span>}
          {f.title}
          {f.revision && <span className="font-mono text-[11px] text-ink-faint"> {f.revision}</span>}
        </p>
        <p className="text-[11px] text-ink-faint">
          {f.issuedBy && <>Published by {f.issuedBy}</>}
          {f.pageRef && <> · {f.pageRef} of the county packet</>}
        </p>

        {/* When it is owed, and what the date is measured from. A date on its own is not enough:
            these deadlines move with the camp's own opening day, and a director who does not
            know that will not understand why the date changed when they edited their season. */}
        {timing && (
          <p className={`text-[11.5px] mt-1 inline-flex items-start gap-1.5 ${
            timing.dueOn && timing.dueOn < today && !timing.met ? 'text-red-text' : 'text-ink-soft'}`}>
            <CalendarClock className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>
              {timing.dueOn
                ? <><span className="font-semibold">Due {timing.dueOn}</span>
                    {timing.dueOn < today && !timing.met && ' · past due'} · {timing.basis}</>
                : timing.basis}
            </span>
          </p>
        )}
        {f.campSupplied && (
          <p className="text-[11.5px] text-ink-soft mt-1 leading-relaxed">
            {f.obtainNote ?? 'We cannot publish this one. Obtain it from the issuing office and upload your copy.'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {f.bundledPath && (
          <a href={f.bundledPath} download>
            <Button size="sm" variant="ghost">
              <Download className="w-3.5 h-3.5" /> {f.pageRef ? 'Packet' : 'Blank'}
            </Button>
          </a>
        )}
        {!f.bundledPath && f.sourceUrl && (
          <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost">
              <ExternalLink className="w-3.5 h-3.5" /> Source
            </Button>
          </a>
        )}
        {f.campSupplied && can('manageSafetyItems') && (
          uploaded ? (
            <span className="text-[11.5px] text-green-muted-text inline-flex items-center gap-1 px-2">
              <Check className="w-3.5 h-3.5" /> Yours is on file
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onUpload(f.designation ?? f.title)}>
              <Upload className="w-3.5 h-3.5" /> Upload yours
            </Button>
          )
        )}
      </div>
    </div>
  );
}
