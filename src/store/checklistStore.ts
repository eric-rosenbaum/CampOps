// The season, and nothing else.
//
// This store used to carry the Pre/Post Camp checklist as well -- opening and closing tasks,
// their phases, filters and activity log. Pre/Post was removed as a module; the season it hung
// off was not, because Campground reads it constantly: the review period, the dates a routine
// counts its cycles against, and the property calendar all start here.
//
// The name is kept so the twenty-odd call sites that already say `useChecklistStore().season`
// keep saying it.
import { create } from 'zustand';
import type { Season } from '@/lib/types';
import { dbUpsertSeason } from '@/lib/db';

interface ChecklistStore {
  season: Season | null;
  setSeason: (s: Season) => void;
  editSeason: (season: Season) => void;
}

export const useChecklistStore = create<ChecklistStore>((set) => ({
  season: null,

  setSeason: (season) => set({ season }),

  editSeason: (season) => {
    set({ season });
    dbUpsertSeason(season);
  },
}));
