import { ChefHat, ChevronDown, ChevronRight, Link2Off, Printer } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { FilterPill } from '@/components/shared/FilterPill';
import { SearchInput } from '@/components/shared/SearchInput';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import {
  MEAL_PERIODS, MEAL_PERIOD_LABELS, scaledIngredientLabel, scaleFactor, tidy,
  recipesToPrintHtml, stepTimingLabel, type PrintRecipe,
} from '@/lib/commissaryUnits';
import type { Recipe, RecipeIngredient, RecipeStep, InventoryItem } from '@/lib/types';
import { AllergenChips, InlineNumberEdit } from './commissaryUi';

/** Assemble a printable, pre-scaled recipe from its parts. */
function buildPrintRecipe(
  recipe: Recipe, ings: RecipeIngredient[], steps: RecipeStep[],
  allergens: string[], byId: Map<string, InventoryItem>, scaleTo: number,
): PrintRecipe {
  return {
    name: recipe.name,
    mealLabel: MEAL_PERIOD_LABELS[recipe.mealPeriod],
    baseYield: recipe.baseYield,
    scaledTo: scaleTo,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    allergens,
    ingredients: ings.map((ing) => {
      const item = ing.itemId ? byId.get(ing.itemId) : undefined;
      return { label: ing.label, qty: scaledIngredientLabel(ing, recipe, scaleTo, item), unlinked: !item };
    }),
    steps: steps.map((s) => ({ instruction: s.instruction, timing: stepTimingLabel(s) })),
  };
}

function openPrint(html: string, emptyMsg: string) {
  const w = window.open('', '_blank');
  if (!w) { alert(emptyMsg); return; }
  w.document.write(html); w.document.close(); w.focus(); w.print();
}

const FILTERS = [{ id: 'all', label: 'All' }, ...MEAL_PERIODS.map((m) => ({ id: m, label: MEAL_PERIOD_LABELS[m] }))];

function RecipeCard({ recipeId }: { recipeId: string }) {
  const {
    recipes, expandedRecipeId, toggleExpandedRecipe, ingredientsFor, stepsFor,
    allergensFor, itemsById, portions, openModal, recipeScales, setRecipeScale,
  } = useCommissaryStore();
  const { can } = useAuth();
  const recipe = recipes.find((r) => r.id === recipeId)!;
  const expanded = expandedRecipeId === recipeId;

  // The scale defaults to the session head count, so a cook can ask "what if I make this
  // for 80?" without touching the session. Committed value lives in the store (keyed by
  // recipe) so it survives tab switches; edited via click-to-edit-then-save.
  const sessionPortions = portions();
  const storeScale = recipeScales[recipeId] ?? (sessionPortions || recipe.baseYield);
  const effective = storeScale > 0 ? storeScale : recipe.baseYield;

  const ings = ingredientsFor(recipeId);
  const steps = stepsFor(recipeId);
  const byId = itemsById();
  const allergens = allergensFor(recipeId);
  const factor = scaleFactor(recipe, effective);

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <button
        onClick={() => toggleExpandedRecipe(recipeId)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cream-dark/30"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-forest/40" /> : <ChevronRight className="w-4 h-4 text-forest/40" />}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-forest truncate">{recipe.name}</p>
          <p className="text-[11px] text-forest/45">
            {MEAL_PERIOD_LABELS[recipe.mealPeriod]} · base yield {recipe.baseYield} portions
            {recipe.prepTime && ` · prep ${recipe.prepTime}`}
            {recipe.cookTime && ` · cook ${recipe.cookTime}`}
          </p>
        </div>
        <AllergenChips allergens={allergens} size="xs" />
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-4">
            <label className="text-[12px] text-forest/60">Scale to</label>
            <InlineNumberEdit value={storeScale} min={1} widthClass="w-24"
              onSave={(n) => setRecipeScale(recipeId, n)} />
            <span className="text-[12px] text-forest/50">
              portions · ×{tidy(factor, 2)} of base
            </span>
            <div className="flex-1" />
            <Button
              size="sm" variant="ghost"
              onClick={() => openPrint(
                recipesToPrintHtml([buildPrintRecipe(recipe, ings, steps, allergens, byId, effective)]),
                'Enable pop-ups to print this recipe.',
              )}
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
            {can('manageCommissary') && (
              <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'recipe', editId: recipeId })}>Edit recipe</Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40 mb-2">Ingredients</p>
              <div className="space-y-1.5">
                {ings.map((ing) => {
                  const item = ing.itemId ? byId.get(ing.itemId) : undefined;
                  const unlinked = !item;
                  return (
                    <div key={ing.id} className="flex items-center justify-between gap-3 text-[12px]">
                      <span className="flex items-center gap-1.5 text-forest/70 min-w-0">
                        {unlinked && <Link2Off className="w-3 h-3 text-forest/30 flex-shrink-0" />}
                        <span className="truncate">{ing.label}</span>
                      </span>
                      <span className={`font-mono flex-shrink-0 ${unlinked ? 'text-forest/35' : 'text-forest'}`}>
                        {scaledIngredientLabel(ing, recipe, effective, item)}
                      </span>
                    </div>
                  );
                })}
                {ings.length === 0 && <p className="text-[12px] text-forest/40">No ingredients yet.</p>}
              </div>
              {ings.some((g) => !g.itemId) && (
                <p className="text-[11px] text-forest/40 mt-3 leading-relaxed">
                  <Link2Off className="w-3 h-3 inline mr-1" />
                  Unlinked ingredients are not scaled and are excluded from ordering demand.
                </p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40 mb-2">Method</p>
              {steps.length > 0 ? (
                <ol className="space-y-2">
                  {steps.map((s) => {
                    const timing = stepTimingLabel(s);
                    return (
                      <li key={s.id} className="flex gap-2.5 text-[12px] text-forest/70">
                        <span className="font-mono text-forest/35 flex-shrink-0">{s.stepNumber}.</span>
                        <span className="leading-relaxed">
                          {timing && (
                            <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded-tag text-[10px] font-medium bg-forest/8 text-forest/70 align-middle">
                              {timing}
                            </span>
                          )}
                          {s.instruction}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : recipe.method ? (
                <p className="text-[12px] text-forest/70 leading-relaxed whitespace-pre-wrap">{recipe.method}</p>
              ) : (
                <p className="text-[12px] text-forest/40">No method recorded.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecipesTab() {
  const {
    recipes, filteredRecipes, recipeFilter, setRecipeFilter,
    recipeSearch, setRecipeSearch, openModal,
    ingredientsFor, stepsFor, allergensFor, itemsById, portions,
  } = useCommissaryStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const rows = filteredRecipes();

  function handlePrintAll() {
    const byId = itemsById();
    const sessionPortions = portions();
    const printable = rows.map((r) =>
      buildPrintRecipe(r, ingredientsFor(r.id), stepsFor(r.id), allergensFor(r.id), byId, sessionPortions || r.baseYield));
    openPrint(recipesToPrintHtml(printable), 'Enable pop-ups to print recipes.');
  }

  if (recipes.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
            <ChefHat className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No recipes yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed mb-4">
            Write a recipe once for a base yield — say 50 portions — and link its ingredients
            to inventory. Every quantity then scales to whatever the session's head count is.
          </p>
          {canManage && <Button size="sm" onClick={() => openModal({ kind: 'recipe' })}>+ Add your first recipe</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div className="flex items-center gap-2 mb-4">
        {FILTERS.map((f) => (
          <FilterPill key={f.id} label={f.label} active={recipeFilter === f.id} onClick={() => setRecipeFilter(f.id)} />
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" disabled={rows.length === 0} onClick={handlePrintAll}>
          <Printer className="w-3.5 h-3.5" /> Print all
        </Button>
        <SearchInput value={recipeSearch} onChange={setRecipeSearch} placeholder="Search recipes…" />
      </div>

      <div className="space-y-2.5">
        {rows.map((r) => <RecipeCard key={r.id} recipeId={r.id} />)}
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-forest/45">No recipes match this filter.</p>
        )}
      </div>
    </div>
  );
}
