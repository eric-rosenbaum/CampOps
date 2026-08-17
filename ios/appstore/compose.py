#!/usr/bin/env python3
"""
Compose App Store screenshots for CampCommand.

Written for this project rather than using the ASO skill's compose.py because the stock
device frame is a flat dark rectangle. This renders a far more convincing iPhone: a brushed
titanium band with lit edges, a true-to-life corner radius, the side buttons, a screen sheen,
and a contact shadow under the device.

Usage:
  compose.py --bg "#2d4a2d" --verb TRACK --desc "EVERY JOB ON CAMP" \
             --screenshot raw/01-home.png --output out/01.png
"""

import argparse
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── Canvas (iPhone 6.7"; the 6.9" size is a clean resample of this) ──────────
CANVAS_W, CANVAS_H = 1290, 2796

# ── Device geometry ─────────────────────────────────────────────────────────
# Proportions taken from a real iPhone 15/16 Pro: the corner radius is ~11.5% of body
# width, and the black border around the display is a little over 2%. The stock template
# used a 7.5% radius and a 15px border, which is what made it read as a flat slab.
DEVICE_W = 1015
DEVICE_H = 2300
CORNER_R = int(DEVICE_W * 0.115)          # ≈ 117
BAND = 13                                  # titanium rail thickness
BEZEL = 26                                 # band + black border before the screen starts
SCREEN_W = DEVICE_W - 2 * BEZEL
SCREEN_CORNER_R = CORNER_R - BEZEL
DEVICE_X = (CANVAS_W - DEVICE_W) // 2
DEVICE_Y = 760                             # bottom bleeds off canvas by design

DI_W, DI_H, DI_TOP = 128, 37, 15           # Dynamic Island

# ── Typography ──────────────────────────────────────────────────────────────
VERB_SIZE_MAX, VERB_SIZE_MIN = 252, 150
DESC_SIZE = 120
VERB_DESC_GAP, DESC_LINE_GAP = 18, 22
TEXT_TOP = 120
MAX_TEXT_W = int(CANVAS_W * 0.86)          # generous side margins; nothing near the edge

FONT_CANDIDATES = [
    "/Library/Fonts/SF-Pro-Display-Black.otf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def text_size(draw, text, font):
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if text_size(draw, trial, font)[0] <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def titanium_band(w, h, radius):
    """A rounded rect filled with a horizontal gradient that reads as brushed metal.

    Real titanium rails catch light at the very edges and fall off toward the middle of
    the curve. A flat grey is the single biggest reason a mockup looks fake, so this
    builds a proper multi-stop ramp instead.
    """
    stops = [
        (0.00, (176, 173, 168)),
        (0.05, (232, 230, 226)),   # bright specular edge
        (0.16, (138, 135, 130)),
        (0.50, (104, 102, 99)),    # body of the rail, in shadow
        (0.84, (138, 135, 130)),
        (0.95, (232, 230, 226)),   # bright specular edge
        (1.00, (176, 173, 168)),
    ]
    grad = Image.new("RGB", (w, 1))
    px = grad.load()
    for x in range(w):
        t = x / max(w - 1, 1)
        for i in range(len(stops) - 1):
            t0, c0 = stops[i]
            t1, c1 = stops[i + 1]
            if t0 <= t <= t1:
                f = (t - t0) / max(t1 - t0, 1e-6)
                px[x, 0] = tuple(int(c0[j] + (c1[j] - c0[j]) * f) for j in range(3))
                break
    grad = grad.resize((w, h))

    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def build_device(screenshot):
    """The device, rendered on its own transparent layer."""
    dev = Image.new("RGBA", (DEVICE_W, DEVICE_H), (0, 0, 0, 0))

    # Titanium rail.
    dev.alpha_composite(titanium_band(DEVICE_W, DEVICE_H, CORNER_R))

    # Black glass border inside the rail.
    inner = Image.new("RGBA", (DEVICE_W, DEVICE_H), (0, 0, 0, 0))
    ImageDraw.Draw(inner).rounded_rectangle(
        [BAND, BAND, DEVICE_W - BAND - 1, DEVICE_H - BAND - 1],
        radius=CORNER_R - BAND, fill=(11, 11, 12, 255),
    )
    dev.alpha_composite(inner)

    # Screen.
    shot = screenshot.convert("RGB")
    target_h = int(shot.height * (SCREEN_W / shot.width))
    shot = shot.resize((SCREEN_W, target_h), Image.LANCZOS)
    visible_h = DEVICE_H - 2 * BEZEL
    if target_h > visible_h:
        shot = shot.crop((0, 0, SCREEN_W, visible_h))

    screen = Image.new("RGBA", (SCREEN_W, shot.height), (0, 0, 0, 0))
    smask = Image.new("L", (SCREEN_W, shot.height), 0)
    ImageDraw.Draw(smask).rounded_rectangle(
        [0, 0, SCREEN_W - 1, shot.height - 1], radius=SCREEN_CORNER_R, fill=255)
    screen.paste(shot, (0, 0), smask)
    dev.alpha_composite(screen, (BEZEL, BEZEL))

    # No Dynamic Island is drawn here: the simulator capture already includes it, and
    # painting a second one on top produces a doubled, misshapen pill.

    # A soft diagonal sheen across the glass sells it as a screen rather than a pasted image.
    sheen = Image.new("RGBA", (DEVICE_W, DEVICE_H), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).polygon(
        [(0, 250), (DEVICE_W, -260), (DEVICE_W, 210), (0, 720)],
        fill=(255, 255, 255, 13),
    )
    sheen_mask = Image.new("L", (DEVICE_W, DEVICE_H), 0)
    ImageDraw.Draw(sheen_mask).rounded_rectangle(
        [BEZEL, BEZEL, DEVICE_W - BEZEL - 1, DEVICE_H - BEZEL - 1],
        radius=SCREEN_CORNER_R, fill=255)
    dev.alpha_composite(Image.composite(sheen, Image.new("RGBA", dev.size, (0, 0, 0, 0)), sheen_mask))

    # Side buttons, drawn proud of the rail.
    d = ImageDraw.Draw(dev)
    btn = (150, 147, 142, 255)
    for y0, y1 in [(430, 555)]:                      # action button (left)
        d.rounded_rectangle([-3, y0, 5, y1], radius=4, fill=btn)
    for y0, y1 in [(620, 740), (770, 890)]:          # volume up / down (left)
        d.rounded_rectangle([-3, y0, 5, y1], radius=4, fill=btn)
    d.rounded_rectangle([DEVICE_W - 6, 660, DEVICE_W + 2, 860], radius=4, fill=btn)  # power (right)

    return dev


def compose(bg, verb, desc, screenshot_path, output_path):
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), bg)
    draw = ImageDraw.Draw(canvas)

    # ── Headline ────────────────────────────────────────────────────────────
    size = VERB_SIZE_MAX
    while size > VERB_SIZE_MIN:
        f = load_font(size)
        if text_size(draw, verb, f)[0] <= MAX_TEXT_W:
            break
        size -= 4
    verb_font = load_font(size)
    desc_font = load_font(DESC_SIZE)

    y = TEXT_TOP
    vw, vh = text_size(draw, verb, verb_font)
    draw.text(((CANVAS_W - vw) // 2, y), verb, font=verb_font, fill="white")
    y += vh + VERB_DESC_GAP + 30

    for line in wrap(draw, desc, desc_font, MAX_TEXT_W):
        lw, lh = text_size(draw, line, desc_font)
        draw.text(((CANVAS_W - lw) // 2, y), line, font=desc_font, fill="white")
        y += lh + DESC_LINE_GAP + 26

    # ── Device with contact shadow ──────────────────────────────────────────
    device = build_device(Image.open(screenshot_path))

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [DEVICE_X + 16, DEVICE_Y + 30, DEVICE_X + DEVICE_W - 16, DEVICE_Y + DEVICE_H],
        radius=CORNER_R, fill=(0, 0, 0, 115),
    )
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(38)))

    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    layer.alpha_composite(device, (DEVICE_X, DEVICE_Y))
    canvas = Image.alpha_composite(canvas, layer)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    canvas.convert("RGB").save(output_path, quality=97)
    print(f"✓ {output_path} ({CANVAS_W}×{CANVAS_H})")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--bg", required=True)
    p.add_argument("--verb", required=True)
    p.add_argument("--desc", required=True)
    p.add_argument("--screenshot", required=True)
    p.add_argument("--output", required=True)
    a = p.parse_args()
    compose(a.bg, a.verb, a.desc, a.screenshot, a.output)
