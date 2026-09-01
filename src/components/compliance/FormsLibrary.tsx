import { useMemo } from 'react';
import { Download, ExternalLink, Phone } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { NY_FORMS } from '@/lib/compliance/nyPacket';
import { useFormIsReady } from '@/lib/compliance/usePacketCamp';
import type { ComplianceAuthorityForm } from '@/lib/types';

/**
 * Every form this camp owes, in four groups, because they have four different rhythms.
 *
 * A camp asked us for this before anything else, and the reason is worth recording: the packet is
 * assembled once a year under time pressure, and the first question is never "am I compliant", it
 * is "which pieces of paper am I supposed to have". Answering that needs no evidence engine at
 * all — it needs a list, and blanks they can download.
 *
 * The groups are not cosmetic. Forms we fill are a download; forms the camp obtains are a task
 * with a lead time; incident forms are filed in season on a 24-hour clock and never belong in the
 * permit envelope; the monthly water reports are posted to the county every month all summer.
 */
export function FormsLibrary({ onOpenForm }: { onOpenForm?: (formCode: string) => void }) {
  const { authorityForms, activeFormCodes } = useComplianceStore();
  const formIsReady = useFormIsReady();
  const inScope = activeFormCodes();

  const groups = useMemo(() => {
    const active = authorityForms.filter((f) => f.isActive);
    // A form we generate is one we hold a coordinate map for; everything else the camp obtains,
    // whether we bundle a blank of it or not.
    const generated = new Set(NY_FORMS.map((f) => f.code));
    return {
      weFill: active.filter((f) => !f.isIncidentForm && f.designation && generated.has(f.designation)),
      theyGet: active.filter((f) => !f.isIncidentForm && !(f.designation && generated.has(f.designation))
        && !MONTHLY.includes(f.designation ?? '')),
      inSeason: active.filter((f) => f.isIncidentForm),
      monthly: active.filter((f) => MONTHLY.includes(f.designation ?? '')),
    };
  }, [authorityForms]);

  return (
    <div className="space-y-5">
      {groups.weFill.length > 0 && (
        <Section
          title="We fill these from your data"
          note="Preview before you file. You are the one signing it."
        >
          {groups.weFill.map((f) => (
            <FormRow key={f.id} form={f}
              ready={f.designation ? formIsReady(f.designation) : null}
              onOpen={f.designation && inScope.has(f.designation) ? () => onOpenForm?.(f.designation as string) : undefined} />
          ))}
        </Section>
      )}

      {groups.theyGet.length > 0 && (
        <Section title="You obtain these">
          {groups.theyGet.map((f) => <FormRow key={f.id} form={f} ready={null} />)}
        </Section>
      )}

      {groups.inSeason.length > 0 && (
        <Section
          title="In season, within 24 hours"
          note="Filed with the county when something happens, not with your application."
        >
          {groups.inSeason.map((f) => <FormRow key={f.id} form={f} ready={null} />)}
        </Section>
      )}

      {groups.monthly.length > 0 && (
        <Section title="Monthly, if you operate water">
          {groups.monthly.map((f) => <FormRow key={f.id} form={f} ready={null} />)}
        </Section>
      )}
    </div>
  );
}

/** The two operating logs that are mailed to the county at the end of each month. */
const MONTHLY = ['DOH-1323', 'DOH-2287'];

function Section({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <h3 className="text-[13.5px] font-semibold text-forest">{title}</h3>
        {note && <p className="text-[11.5px] text-ink-soft">{note}</p>}
      </div>
      <div className="bg-white rounded-card border border-border overflow-hidden">{children}</div>
    </section>
  );
}

function FormRow({ form, ready, onOpen }: {
  form: ComplianceAuthorityForm; ready: boolean | null; onOpen?: () => void;
}) {
  const blankHref = form.bundledPath ?? form.sourceUrl ?? null;
  // A form nobody publishes. Westchester's self-inspection form is named as item 12 of its own
  // packet and exists on no website — the only way to get it is to ring them, so say that
  // instead of showing a dead download.
  const unpublished = !blankHref && Boolean(form.obtainNote);

  return (
    <div className="px-4 py-3 border-b border-cream-dark last:border-b-0 flex items-start gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          {form.designation && (
            <span className="font-mono text-[12px] font-medium text-forest">{form.designation}</span>
          )}
          <span className="text-[13px] font-medium text-ink">{form.title}</span>
          {form.pageRef && <span className="text-[11px] text-ink-faint">· {form.pageRef}</span>}
        </div>
        {form.obtainNote && (
          <p className="text-[11.5px] text-ink-soft mt-0.5 leading-relaxed">{form.obtainNote}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {ready !== null && (
          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-tag ${
            ready ? 'bg-green-muted-bg text-green-muted-text' : 'bg-amber-bg text-amber-text'}`}>
            {ready ? 'Ready' : 'Not ready'}
          </span>
        )}
        {onOpen && (
          <Button size="sm" variant="ghost" onClick={onOpen}>Open</Button>
        )}
        {blankHref && (
          <a href={blankHref} target="_blank" rel="noopener noreferrer" download>
            <Button size="sm" variant="ghost">
              <Download className="w-3.5 h-3.5" /> Blank
            </Button>
          </a>
        )}
        {!blankHref && form.sourceUrl && (
          <a href={form.sourceUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost"><ExternalLink className="w-3.5 h-3.5" /> Source</Button>
          </a>
        )}
        {unpublished && !form.sourceUrl && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
            <Phone className="w-3.5 h-3.5" /> Ask the county
          </span>
        )}
      </div>
    </div>
  );
}
