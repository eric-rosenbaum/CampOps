// The brand package under `src/campcommand-brand` is the source of truth for the mark's
// geometry and palette. App code imports from here instead of reaching into that package
// directly, so a regenerated brand drop can replace the whole folder without touching a
// single call site.
//
// Sizing rule worth remembering: below roughly 24px the hairline ring collapses into a grey
// halo, so pass `compact` at those sizes. That is the same build the favicon uses, which is
// why the tab icon and a small in-app mark look identical.
export {
  CampCommandMark,
  CC_GREEN,
  CC_CREAM,
  CC_FLAME,
  CC_EMBER,
  CC_WOOD,
} from '@/campcommand-brand/react/CampCommandMark';
