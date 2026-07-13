import { CalendarRange, ChevronLeft, ChevronRight, X, Plus } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import type { MealPeriod } from '@/lib/types';
import { MEAL_PERIODS, MEAL_PERIOD_LABELS, DAY_LABELS } from '@/lib/commissaryUnits';

function TemplateCell({ templateId, week, dayIndex, meal }: { templateId: string; week: number; dayIndex: number; meal: MealPeriod }) {
  const { templateCellEntries, deleteTemplateEntry, openModal } = useCommissaryStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const entries = templateCellEntries(templateId, week, dayIndex, meal);

  return (
    <div className="border-r border-b border-border p-1.5 min-h-[68px] flex flex-col gap-1">
      {entries.map((e) => (
        <div key={e.id} className="group relative rounded-tag px-2 py-1 text-[11px] leading-tight border bg-cream-dark border-border text-forest/80">
          <span className="truncate block">{e.label ?? '—'}</span>
          {canManage && (
            <button onClick={() => deleteTemplateEntry(e.id)} className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 rounded-full bg-forest text-cream items-center justify-center" aria-label="Remove">
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      ))}
      {canManage && (
        <button onClick={() => openModal({ kind: 'templateEntry', templateId, weekNumber: week, dayIndex, mealPeriod: meal })}
                className="text-[11px] text-forest/30 hover:text-forest/70 text-left px-1 py-0.5 transition-colors">
          + add
        </button>
      )}
    </div>
  );
}

export function TemplatesView() {
  const {
    templates, activeTemplateId, setActiveTemplate, activeTemplateWeek, setActiveTemplateWeek,
    templateById, openModal,
  } = useCommissaryStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const template = activeTemplateId ? templateById(activeTemplateId) : null;

  if (templates.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
            <CalendarRange className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No menu templates yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed mb-4">
            Build your cycle menu once — a 1 to 3 week rotation — then apply it to any session
            instead of planning each week from scratch.
          </p>
          {canManage && <Button size="sm" onClick={() => openModal({ kind: 'template' })}>+ New template</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={activeTemplateId ?? ''}
          onChange={(e) => setActiveTemplate(e.target.value || null)}
          className="text-[13px] bg-white border border-border rounded-btn px-3 py-1.5 focus:outline-none focus:border-sage"
        >
          <option value="">Select a template…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {template && canManage && (
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'template', editId: template.id })}>Edit</Button>
        )}
        <div className="flex-1" />
        {canManage && <Button size="sm" onClick={() => openModal({ kind: 'template' })}>+ New template</Button>}
      </div>

      {!template ? (
        <p className="text-[13px] text-forest/45 bg-white rounded-card border border-border px-4 py-6 text-center">
          Pick a template to edit its cycle.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setActiveTemplateWeek(Math.max(1, activeTemplateWeek - 1))} disabled={activeTemplateWeek <= 1}
                    className="w-7 h-7 rounded-btn border border-border flex items-center justify-center text-forest/60 hover:bg-cream-dark disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-[13px] font-semibold text-forest min-w-[120px] text-center">Cycle week {activeTemplateWeek}</p>
            <button onClick={() => setActiveTemplateWeek(Math.min(template.lengthWeeks, activeTemplateWeek + 1))} disabled={activeTemplateWeek >= template.lengthWeeks}
                    className="w-7 h-7 rounded-btn border border-border flex items-center justify-center text-forest/60 hover:bg-cream-dark disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-forest/40 ml-1">of {template.lengthWeeks}</span>
            <div className="flex-1" />
            <Button size="sm" onClick={() => openModal({ kind: 'applyTemplate' })}>
              <Plus className="w-3.5 h-3.5" /> Apply to a session
            </Button>
          </div>

          <div className="bg-white rounded-card border border-border overflow-hidden">
            <div className="grid grid-cols-[92px_repeat(7,minmax(0,1fr))]">
              <div className="border-r border-b border-border bg-cream-dark/50" />
              {DAY_LABELS.map((day) => (
                <div key={day} className="border-r border-b border-border bg-cream-dark/50 px-2 py-2 text-center last:border-r-0">
                  <p className="text-[11px] font-semibold text-forest">{day}</p>
                </div>
              ))}
              {MEAL_PERIODS.map((meal) => (
                <div key={meal} className="contents">
                  <div className="border-r border-b border-border bg-cream-dark/50 px-2 py-2 flex items-start">
                    <p className="text-[11px] font-semibold text-forest">{MEAL_PERIOD_LABELS[meal]}</p>
                  </div>
                  {DAY_LABELS.map((_, dayIndex) => (
                    <TemplateCell key={`${meal}-${dayIndex}`} templateId={template.id} week={activeTemplateWeek} dayIndex={dayIndex} meal={meal} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
