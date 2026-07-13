import { useState } from 'react';
import { ChefHat, ChevronDown, ChevronRight, Link2Off } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { FilterPill } from '@/components/shared/FilterPill';
import { SearchInput } from '@/components/shared/SearchInput';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import {
  MEAL_PERIODS, MEAL_PERIOD_LABELS, scaledIngredientLabel, scaleFactor, tidy,
} from '@/lib/commissaryUnits';
import { AllergenChips } from './commissaryUi';

const FILTERS = [{ id: 'all', label: 'All' }, ...MEAL_PERIODS.map((m) => ({ id: m, label: MEAL_PERIOD_LABELS[m] }))];

function RecipeCard({ recipeId }: { recipeId: string }) {
  const {
    recipes, expandedRecipeId, toggleExpandedRecipe, ingredientsFor, stepsFor,
    allergensFor, itemsById, portions, openModal,
  } = useCommissaryStore();
  const { can } = useAuth();
  const recipe = recipes.find((r) => r.id === recipeId)!;
  const expanded = expandedRecipeId === recipeId;

  // The scale input is per-card and defaults to the session head count, so a cook
  // can ask "what if I make this for 80?" without touching the session.
  const sessionPortions = portions();
  const [scaleTo, setScaleTo] = useState<number>(sessionPortions || recipe.baseYield);
  const effective = scaleTo > 0 ? scaleTo : recipe.baseYield;

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
            <input
              type="number" min={1} value={scaleTo}
              onChange={(e) => setScaleTo(Number(e.target.value))}
              className="w-24 font-mono text-[13px] bg-white border border-border rounded-btn px-2.5 py-1.5 focus:outline-none focus:border-sage"
            />
            <span className="text-[12px] text-forest/50">
              portions · ×{tidy(factor, 2)} of base
            </span>
            <div className="flex-1" />
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
                  {steps.map((s) => (
                    <li key={s.id} className="flex gap-2.5 text-[12px] text-forest/70">
                      <span className="font-mono text-forest/35 flex-shrink-0">{s.stepNumber}.</span>
                      <span className="leading-relaxed">{s.instruction}</span>
                    </li>
                  ))}
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
  } = useCommissaryStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const rows = filteredRecipes();

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
