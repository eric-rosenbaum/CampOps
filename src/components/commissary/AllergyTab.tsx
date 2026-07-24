import { useMemo, useEffect } from 'react';
import { HeartPulse, AlertTriangle, Lock, Upload, Users } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useCampStore } from '@/store/campStore';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  ALLERGENS, ALLERGEN_LABELS, DIETARY_RESTRICTIONS, restrictionLabel,
  MEAL_PERIOD_LABELS, type Allergen,
} from '@/lib/commissaryUnits';
import { CommissaryFilesPanel } from './CommissaryFilesPanel';

/** Matrix cell: what this camper has for this restriction. */
function RestrictionCell({ severity }: { severity: string | null | undefined }) {
  if (!severity) return <span className="text-forest/15">·</span>;
  if (severity === 'anaphylactic') {
    return (
      <span
        title="ANAPHYLACTIC — EpiPen required"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red text-white text-[10px] font-bold"
      >
        !
      </span>
    );
  }
  if (severity === 'confirmed') {
    return <span title="Confirmed allergy" className="text-green-muted-text font-semibold">✓</span>;
  }
  return <span title="Intolerance / sensitivity" className="text-amber-text font-semibold">~</span>;
}

export function AllergyTab() {
  const {
    campers, restrictions, restrictionSummary, restrictionsFor, anaphylacticCampers,
    totalCampersWithRestrictions, recipes, conflictsForRecipe, openModal,
    substitutionsForSession, sessionIdsFor, sessions,
  } = useCommissaryStore();
  const sessionNames = (camperId: string) =>
    sessionIdsFor(camperId).map((id) => sessions.find((s) => s.id === id)?.name).filter(Boolean);
  const replacementCount = substitutionsForSession().length;
  const { canViewCamperHealth, can } = useAuth();
  const campId = useCampStore((s) => s.currentCamp?.id);

  // Audit access to named camper-health data (once per view), for the compliance trail.
  useEffect(() => {
    if (canViewCamperHealth && campId) {
      supabase.rpc('log_audit_event', { p_camp_id: campId, p_action: 'view_camper_health' });
    }
  }, [canViewCamperHealth, campId]);
  // Adding a camper needs BOTH the module permission and health access — the DB
  // rejects the write otherwise, so don't render a control that cannot succeed.
  const canManage = can('manageCommissary') && canViewCamperHealth;

  const allergenRows = restrictionSummary.filter((r) => r.kind === 'allergen');
  const dietaryRows = restrictionSummary.filter((r) => r.kind === 'dietary');

  // Anaphylaxis counts come from the aggregate, so this renders for the kitchen too.
  // They are PER-ALLERGEN, not a distinct camper count — a camper with two anaphylactic
  // allergies appears in two rows, and there is no honest way to de-duplicate without
  // reading the roster. So the copy says "flagged", never "campers".
  const anaphylacticByAllergen = allergenRows.filter((r) => r.anaphylacticCount > 0);

  // Which recipes actually collide with a real camper.
  const conflictingRecipes = useMemo(
    () => recipes
      .map((r) => ({ recipe: r, conflicts: conflictsForRecipe(r.id) }))
      .filter((x) => x.conflicts.length > 0)
      .sort((a, b) => {
        const aAna = a.conflicts.some((c) => c.anaphylacticCount > 0) ? 1 : 0;
        const bAna = b.conflicts.some((c) => c.anaphylacticCount > 0) ? 1 : 0;
        return bAna - aAna || b.conflicts.length - a.conflicts.length;
      }),
    [recipes, conflictsForRecipe],
  );

  const hasAnyData = restrictionSummary.length > 0;

  if (!hasAnyData && !canViewCamperHealth) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
            <HeartPulse className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No dietary restrictions recorded</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed">
            When camper allergies are entered, you'll see counts here and warnings on any
            menu item that conflicts with them. Camper names are visible only to
            administrators and staff groups with health access.
          </p>
        </div>
      </div>
    );
  }

  if (!hasAnyData && canViewCamperHealth) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <CommissaryFilesPanel />
        <div className="flex flex-col items-center justify-center text-center max-w-sm mx-auto py-12">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
            <HeartPulse className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No campers yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed mb-4">
            Add campers with their allergies and dietary restrictions. Menu items and prep
            tasks will then warn when they conflict with someone.
          </p>
          {canManage && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => openModal({ kind: 'camper' })}>+ Add camper</Button>
              <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'importCampers' })}>
                <Upload className="w-3.5 h-3.5" /> Import roster
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      {canViewCamperHealth && <CommissaryFilesPanel />}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Campers with restrictions"
          value={canViewCamperHealth ? totalCampersWithRestrictions() : '—'}
          hint={canViewCamperHealth ? `of ${campers.length} on the roster` : 'Requires health access'}
        />
        <StatCard label="Distinct allergens" value={allergenRows.length} hint="Present in this camp" />
        <StatCard
          label="Anaphylactic flags"
          value={anaphylacticByAllergen.reduce((s, r) => s + r.anaphylacticCount, 0)}
          hint="EpiPen required"
          variant={anaphylacticByAllergen.length > 0 ? 'red' : 'default'}
        />
        <StatCard label="Menu items at risk" value={conflictingRecipes.length} hint="Recipes that conflict" variant={conflictingRecipes.length > 0 ? 'amber' : 'default'} />
      </div>

      {anaphylacticByAllergen.length > 0 && (
        <div className="flex items-start gap-3 rounded-card border border-red/25 bg-red-bg px-4 py-3.5 mb-5">
          <AlertTriangle className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-body text-red/90 leading-relaxed font-medium">
              Anaphylactic allergies present: {anaphylacticByAllergen.map((r) => `${restrictionLabel(r.restriction).toLowerCase()} (${r.anaphylacticCount})`).join(', ')}.
            </p>
            <p className="text-[11px] text-red/70 mt-1 leading-relaxed">
              {canViewCamperHealth
                ? anaphylacticCampers().map((c) => `${c.name}${c.cabin ? ` — ${c.cabin}` : ''}`).join(' · ')
                : 'Camper names and cabins are restricted to administrators and health staff.'}
            </p>
          </div>
        </div>
      )}

      {/* Aggregate — visible to everyone */}
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40 mb-2">Restrictions in this camp</p>
        <div className="flex flex-wrap gap-2">
          {[...allergenRows, ...dietaryRows].map((r) => (
            <div
              key={r.restriction}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-pill border text-[12px] ${
                r.anaphylacticCount > 0
                  ? 'bg-red-bg border-red/20 text-red'
                  : r.kind === 'allergen'
                    ? 'bg-amber-bg border-amber/20 text-amber-text'
                    : 'bg-cream-dark border-border text-forest/70'
              }`}
            >
              <span className="font-medium">{restrictionLabel(r.restriction)}</span>
              <span className="font-mono font-semibold">{r.camperCount}</span>
              {r.anaphylacticCount > 0 && (
                <span className="text-[10px] font-bold" title={`${r.anaphylacticCount} anaphylactic`}>
                  ⚠{r.anaphylacticCount}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Menu conflicts — visible to everyone, the whole point of the module */}
      {conflictingRecipes.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40">Recipes that conflict</p>
            <div className="flex-1" />
            <span className={`text-[11px] ${replacementCount > 0 ? 'text-green-muted-text' : 'text-forest/45'}`}>
              {replacementCount > 0
                ? `${replacementCount} replacement meal${replacementCount === 1 ? '' : 's'} defined this session`
                : 'No replacement meals defined — set them on the Menu builder'}
            </span>
          </div>
          <div className="bg-white rounded-card border border-border overflow-hidden">
            {conflictingRecipes.map(({ recipe, conflicts }) => {
              const ana = conflicts.some((c) => c.anaphylacticCount > 0);
              return (
                <div key={recipe.id} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${ana ? 'bg-red' : 'bg-amber'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-forest">{recipe.name}</p>
                    <p className="text-[11px] text-forest/45">{MEAL_PERIOD_LABELS[recipe.mealPeriod]}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end max-w-[60%]">
                    {conflicts.map((c) => (
                      <span
                        key={c.allergen}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-tag text-[11px] font-medium border ${
                          c.anaphylacticCount > 0
                            ? 'bg-red-bg text-red border-red/20'
                            : 'bg-amber-bg text-amber-text border-amber/20'
                        }`}
                      >
                        {ALLERGEN_LABELS[c.allergen as Allergen] ?? c.allergen}
                        <span className="font-mono">{c.camperCount}</span>
                        {c.anaphylacticCount > 0 && <span className="font-bold">⚠</span>}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Named roster — health access only */}
      {!canViewCamperHealth ? (
        <div className="bg-white rounded-card border border-border px-6 py-8 text-center">
          <Lock className="w-6 h-6 text-stone-300 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-forest mb-1">Camper names are restricted</p>
          <p className="text-[13px] text-forest/50 max-w-lg mx-auto leading-relaxed">
            You can see how many campers each restriction affects and which recipes conflict,
            which is what the kitchen needs to cook safely. Names, cabins and individual
            severities are limited to administrators and staff groups with health access —
            enforced in the database, not just hidden here.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40">
              Camper roster ({campers.length})
            </p>
            <div className="flex-1" />
            {canManage && (
              <>
                <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'importCampers' })}>
                  <Upload className="w-3.5 h-3.5" /> Import
                </Button>
                <Button size="sm" onClick={() => openModal({ kind: 'camper' })}>+ Add camper</Button>
              </>
            )}
          </div>

          {campers.length === 0 ? (
            <div className="bg-white rounded-card border border-border px-6 py-8 text-center">
              <Users className="w-6 h-6 text-stone-300 mx-auto mb-2" />
              <p className="text-[13px] text-forest/50">No campers on the roster yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-card border border-border overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="bg-cream-dark/40 border-b border-border">
                    <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-forest/40">Camper</th>
                    <th className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-widest text-forest/40">Cabin</th>
                    {ALLERGENS.map((a) => (
                      <th key={a} className="px-1 py-2 text-[10px] font-medium text-forest/40 text-center whitespace-nowrap">
                        {ALLERGEN_LABELS[a]}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-widest text-forest/40 text-left">Dietary</th>
                  </tr>
                </thead>
                <tbody>
                  {campers.map((c) => {
                    const rows = restrictionsFor(c.id);
                    const byId = new Map(rows.map((r) => [r.restriction, r]));
                    const diets = rows.filter((r) => r.kind === 'dietary');
                    return (
                      <tr
                        key={c.id}
                        onClick={() => canManage && openModal({ kind: 'camper', editId: c.id })}
                        className={`border-b border-border last:border-0 ${canManage ? 'cursor-pointer hover:bg-cream-dark/30' : ''}`}
                      >
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="text-[13px] text-forest">{c.name}</span>
                          {(() => {
                            const names = sessionNames(c.id);
                            return (
                              <span className="block text-[10px] text-forest/40">
                                {names.length ? names.join(', ') : 'All sessions'}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-2 py-2 text-[12px] text-forest/50 whitespace-nowrap">{c.cabin ?? '—'}</td>
                        {ALLERGENS.map((a) => (
                          <td key={a} className="px-1 py-2 text-center">
                            <RestrictionCell severity={byId.get(a)?.severity} />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-[11px] text-forest/50 whitespace-nowrap">
                          {diets.length ? diets.map((d) => restrictionLabel(d.restriction)).join(', ') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-forest/40 mt-3">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red text-white text-[9px] font-bold mr-1">!</span>
            anaphylactic · <span className="text-green-muted-text font-semibold">✓</span> confirmed allergy ·{' '}
            <span className="text-amber-text font-semibold">~</span> intolerance. {restrictions.length} restriction
            {restrictions.length === 1 ? '' : 's'} across {DIETARY_RESTRICTIONS.length + ALLERGENS.length} tracked categories.
          </p>
        </div>
      )}
    </div>
  );
}
