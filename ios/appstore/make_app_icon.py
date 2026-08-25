#!/usr/bin/env python3
"""
SUPERSEDED. Do not run this.

The app icon now ships in the brand package at
`src/campcommand-brand/ios/AppIcon.appiconset/AppIcon-1024.png`, and that package is the
source of truth for the mark. Running this script would put the retired firepit icon back.
Kept only so the older App Store screenshots in `raw/` remain explicable.

--- original header ---

Generate the CampCommand app icon: the firepit mark on the pine ground.

Committed rather than hand-drawn so the icon can be regenerated when the mark changes — the
icon is the one place the brand appears before anyone opens the app, and a stale one is how you
end up with a pine tree on the home screen and a firepit inside it.

Apple wants 1024x1024, no alpha, square corners (the system rounds them).
"""
import math
from PIL import Image, ImageDraw

SIZE = 1024
S = SIZE / 32.0            # the mark is authored on a 32-unit grid, as in FirepitMark.tsx
PINE   = (0x1D, 0x3A, 0x2E)
EMBER  = (0xB0, 0x52, 0x2F)
AMBER  = (0xD9, 0x92, 0x2B)
LOG_LO = (0x7C, 0x5A, 0x34)
LOG_HI = (0x94, 0x6B, 0x3E)

SS = 4                      # supersample, then downsample for clean edges


def bezier(p0, p1, p2, p3, steps=90):
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]
        out.append((x, y))
    return out


def scaled(pts, k):
    return [(x * S * k, y * S * k) for x, y in pts]


def flame_outline(scale=1.0, cx=16.0, cy=13.6, off=1.0):
    """The flame silhouette, optionally shrunk toward its own centre.

    Drawn as a filled shape and then re-drawn smaller in the background colour to make the ring,
    rather than stroking a polyline — PIL's polyline joins leave ragged edges and a lump where
    the path doubles back, which is very visible at icon size.
    """
    pts = []
    pts += bezier((16, 3.6), (20.2, 8.0), (22.0, 10.6), (22.0, 14.0))
    pts += bezier((22.0, 14.0), (22.0, 17.9), (18.8, 20.4), (16, 20.4))
    pts += bezier((16, 20.4), (13.2, 20.4), (10.0, 17.9), (10.0, 14.0))
    pts += bezier((10.0, 14.0), (10.0, 10.6), (11.8, 8.0), (16, 3.6))
    return [(cx + (x - cx) * scale, cy + off + (y - cy) * scale) for x, y in pts]


def build(k):
    img = Image.new("RGB", (SIZE * k, SIZE * k), PINE)
    d = ImageDraw.Draw(img)
    off = 1.0

    # Ember ring: full silhouette, then the same shape shrunk and filled with the ground.
    d.polygon(scaled(flame_outline(1.00, off=off), k), fill=EMBER)
    d.polygon(scaled(flame_outline(0.74, off=off), k), fill=PINE)

    # Inner flame — filled amber teardrop.
    inner = []
    inner += bezier((16, 10.0 + off), (17.8, 12.4 + off), (18.6, 13.7 + off), (18.6, 15.1 + off))
    inner += bezier((18.6, 15.1 + off), (18.6, 17.6 + off), (13.4, 17.6 + off), (13.4, 15.1 + off))
    inner += bezier((13.4, 15.1 + off), (13.4, 13.7 + off), (14.2, 12.4 + off), (16, 10.0 + off))
    d.polygon(scaled(inner, k), fill=AMBER)

    # Two logs crossed beneath the fire, with rounded ends.
    w = int(3.4 * S * k)
    r = w // 2
    for (a, b, col) in [((5.6, 25.2 + off), (26.4, 21.4 + off), LOG_LO),
                        ((5.6, 21.4 + off), (26.4, 25.2 + off), LOG_HI)]:
        d.line(scaled([a, b], k), fill=col, width=w)
        for (px, py) in scaled([a, b], k):
            d.ellipse([px - r, py - r, px + r, py + r], fill=col)

    return img


if __name__ == "__main__":
    icon = build(SS).resize((SIZE, SIZE), Image.LANCZOS)
    out = "ios/CampOps/CampOps/Assets.xcassets/AppIcon.appiconset/campOpsIcon.png"
    icon.save(out)
    print(f"✓ {out} ({SIZE}x{SIZE}, no alpha)")
