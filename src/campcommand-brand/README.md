# CampCommand — brand mark

Circular badge: "CC" monogram above a campfire, inside a hairline ring.
Everything is generated from one 64×64 vector grid, so every asset in this
package is pixel-consistent with every other.

## Palette

| Token | Hex | Use |
|---|---|---|
| `--cc-green` | `#24392F` | Badge fill, app background, theme color |
| `--cc-cream` | `#FCF9F2` | Fire, monogram, ring — anything on green |
| `--cc-flame` | `#A45838` | Accent |
| `--cc-ember` | `#CF9542` | Accent |
| `--cc-wood`  | `#8E6D45` | Accent |

`--cc-wood` on `--cc-green` is the weakest contrast pair in the palette.
Don't use it for anything thinner than about 3px at render size.

## Files

```
svg/
  mark.svg            themeable — reads --cc-disc / --cc-ink, falls back to green/cream
  mark-on-green.svg   green badge, cream contents (default)
  mark-on-white.svg   inverted, for cream/white surfaces
  mark-flame.svg      terracotta contents, accent use only
  mark-small.svg      ≤24px build — ring dropped, contents +14%, logs thickened
  app-icon.svg        1024 square, opaque, badge fused with the field
  maskable.svg        512 square, contents inside the 80% Android safe zone
web/
  favicon.ico         16 / 32 / 48, built from mark-small
  favicon.svg         mark-small
  apple-touch-icon.png 180×180, opaque
  icon-192.png  icon-512.png  maskable-512.png
  site.webmanifest
  head.html           drop-in <head> block
ios/
  AppIcon.appiconset/ AppIcon-1024.png + Contents.json
react/
  CampCommandMark.tsx
```

## Web

Copy everything in `web/` to the public root, then paste `web/head.html`
into `<head>`. For Next.js App Router, `favicon.ico`, `icon-192.png` and
`apple-touch-icon.png` can go in `app/` instead and get wired up
automatically — in that case skip the manual `<link>` tags for those three.

## In the app

```tsx
import { CampCommandMark } from "@/components/CampCommandMark";

<CampCommandMark size={32} />                        // sidebar, default green badge
<CampCommandMark size={16} compact />                // small — drops the hairline ring
<CampCommandMark size={40} disc={CC_CREAM} ink={CC_GREEN} />  // on a light surface
<CampCommandMark size={24} decorative />             // beside the word "CampCommand"
```

Two things the component handles that hand-rolled `<img>` tags won't:

**`compact`.** Below roughly 24px the 1.4px ring collapses into a grey halo and
the contents lose definition. `compact` drops the ring and scales the fire and
monogram up 14%. Use it anywhere the mark renders under ~24px. This is the same
build that `favicon.ico` and `favicon.svg` use, so the tab icon and a small
in-app mark stay identical.

**`decorative`.** The mark carries `role="img"` and `aria-label="CampCommand"`
by default. When it sits directly beside the visible word "CampCommand" that
label is a duplicate announcement — pass `decorative` to make it
`aria-hidden` instead.

## iOS

Drag `ios/AppIcon.appiconset` into `Assets.xcassets`, replacing the existing
AppIcon set. Modern Xcode takes the single 1024 and derives every other size.

The app icon is deliberately **not** the badge on a square. iOS masks icons to
a rounded rectangle, so a circular badge inside that mask reads as a sticker
floating on a field. Instead the badge's disc *is* the icon background, and the
ring sits inside it. Same mark, correct at icon scale.

Both `apple-touch-icon.png` and `AppIcon-1024.png` are saved as RGB with no
alpha channel — App Store Connect rejects icons containing transparency.

## Regenerating

All geometry lives on a 64×64 grid with the disc at `cx=32 cy=32 r=31`. If the
mark changes, the source of truth is the SVG path data in
`react/CampCommandMark.tsx`; rebuild the rasters from `svg/app-icon.svg` and
`svg/mark-small.svg` rather than resizing PNGs.

Don't scale the raster files up — regenerate from vector. `favicon.ico` in
particular is downscaled from a 64px render, not upscaled from 16px, and
resizing it will visibly soften.
