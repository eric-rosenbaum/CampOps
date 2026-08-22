#!/usr/bin/env python3
"""
App Store / marketing screenshot composer — CampCommand.

Vendored from the aso-appstore-screenshots skill and changed in three ways:

1. LINE SPACING IS METRIC-BASED, NOT INK-BASED.
   The original advanced y by each line's ink height (`bbox[3]-bbox[1]`), which changes with
   the glyphs on that line — "EVERY JOB ON" carries a descending J, "CAMP" doesn't — so
   consecutive lines of the same font ended up unevenly spaced. Here every line is placed on a
   baseline and the baseline advances by a constant derived from the font's cap height, which
   is what makes stacked all-caps display type look even.

2. TEXT COLOUR IS AN OPTION.
   The original hardcoded white, which is unreadable the moment the background is light.

3. THE GAPS ARE FLAGS, so the headline can be tuned per screenshot without editing code.
"""

import argparse
import os
from PIL import Image, ImageDraw, ImageFont

# ── Canvas ──────────────────────────────────────────────────────────
CANVAS_W = 1290
CANVAS_H = 2796

# ── Device template constants (must match generate_frame.py) ───────
DEVICE_W = 1030
BEZEL = 15
SCREEN_W = DEVICE_W - 2 * BEZEL
SCREEN_CORNER_R = 62

# ── Layout ──────────────────────────────────────────────────────────
DEVICE_Y = 720
TEXT_TOP = 200

# ── Typography ──────────────────────────────────────────────────────
VERB_SIZE_MAX = 256
VERB_SIZE_MIN = 150
DESC_SIZE = 124
MAX_TEXT_W = int(CANVAS_W * 0.92)
MAX_VERB_W = int(CANVAS_W * 0.92)

SKILL_DIR = os.path.expanduser("~/.claude/skills/aso-appstore-screenshots")
SF_PRO_PATH = "/Library/Fonts/SF-Pro-Display-Black.otf"
FRAME_PATH = os.path.join(SKILL_DIR, "assets", "device_frame.png")

INTER_VAR_SEARCH = [
    "Inter-VariableFont_opsz,wght.ttf",
    os.path.expanduser("~/Library/Fonts/Inter-VariableFont_opsz,wght.ttf"),
]


def _find_inter_var():
    for rel in INTER_VAR_SEARCH:
        if os.path.exists(rel):
            return os.path.abspath(rel)
    return None


def load_heavy_font(size):
    if os.path.exists(SF_PRO_PATH):
        return ImageFont.truetype(SF_PRO_PATH, size)
    inter = _find_inter_var()
    if inter:
        f = ImageFont.truetype(inter, size)
        try:
            f.set_variation_by_name(b"Black")
        except Exception:
            pass
        return f
    arial_black = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
    if os.path.exists(arial_black):
        return ImageFont.truetype(arial_black, size)
    raise RuntimeError("No heavy sans-serif font found.")


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def cap_height(font):
    """Height of a capital H — the visual height of all-caps type.

    This is the unit stacked caps should be spaced by. Unlike a per-line ink bbox it does not
    move when a line happens to contain a J or a Q.
    """
    dummy = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bbox = dummy.textbbox((0, 0), "H", font=font)
    return bbox[3] - bbox[1]


def word_wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit_font(text, max_w, size_max, size_min):
    dummy = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    for size in range(size_max, size_min - 1, -4):
        font = load_heavy_font(size)
        if dummy.textlength(text, font=font) <= max_w:
            return font
    return load_heavy_font(size_min)


def draw_block(draw, baseline_y, text, font, fill, max_w=None, line_gap=0):
    """Draw centred lines on successive baselines. Returns the last baseline used.

    anchor="ms" is middle-horizontal / baseline-vertical, so lines sit on a true baseline grid
    instead of being top-aligned by their ink.
    """
    lines = word_wrap(draw, text, font, max_w) if max_w else [text]
    cap = cap_height(font)
    for i, line in enumerate(lines):
        y = baseline_y + i * (cap + line_gap)
        draw.text((CANVAS_W // 2, y), line, fill=fill, font=font, anchor="ms")
    return baseline_y + (len(lines) - 1) * (cap + line_gap)


def compose(bg_hex, fg_hex, verb, desc, screenshot_path, output_path,
            verb_desc_gap, desc_line_gap):
    bg = hex_to_rgb(bg_hex)
    fg = hex_to_rgb(fg_hex)

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (*bg, 255))
    draw = ImageDraw.Draw(canvas)

    verb_font = fit_font(verb.upper(), MAX_VERB_W, VERB_SIZE_MAX, VERB_SIZE_MIN)
    desc_font = load_heavy_font(DESC_SIZE)

    verb_cap = cap_height(verb_font)
    desc_cap = cap_height(desc_font)

    # First baseline sits one cap-height below the intended text top.
    verb_baseline = TEXT_TOP + verb_cap
    last_verb_baseline = draw_block(draw, verb_baseline, verb.upper(), verb_font, fg,
                                    line_gap=desc_line_gap)

    # The gap is measured baseline-to-cap-top, so it reads the same as the gaps between the
    # description's own lines rather than being inflated by the verb's larger ink box.
    desc_baseline = last_verb_baseline + verb_desc_gap + desc_cap
    draw_block(draw, desc_baseline, desc.upper(), desc_font, fg,
               max_w=MAX_TEXT_W, line_gap=desc_line_gap)

    device_x = (CANVAS_W - DEVICE_W) // 2
    screen_x = device_x + BEZEL
    screen_y = DEVICE_Y + BEZEL

    shot = Image.open(screenshot_path).convert("RGBA")
    scale = SCREEN_W / shot.width
    shot = shot.resize((SCREEN_W, int(shot.height * scale)), Image.LANCZOS)

    screen_h = CANVAS_H - screen_y + 500
    scr_mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(scr_mask).rounded_rectangle(
        [screen_x, screen_y, screen_x + SCREEN_W, screen_y + screen_h],
        radius=SCREEN_CORNER_R, fill=255)

    scr_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(scr_layer).rounded_rectangle(
        [screen_x, screen_y, screen_x + SCREEN_W, screen_y + screen_h],
        radius=SCREEN_CORNER_R, fill=(0, 0, 0, 255))
    scr_layer.paste(shot, (screen_x, screen_y))
    scr_layer.putalpha(scr_mask)
    canvas = Image.alpha_composite(canvas, scr_layer)

    frame_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    frame_layer.paste(Image.open(FRAME_PATH).convert("RGBA"), (device_x, DEVICE_Y))
    canvas = Image.alpha_composite(canvas, frame_layer)

    canvas.convert("RGB").save(output_path, "PNG")
    print(f"✓ {output_path} ({CANVAS_W}×{CANVAS_H})  bg={bg_hex} fg={fg_hex}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bg", required=True)
    p.add_argument("--fg", default="#0b3d6b", help="Headline colour (default navy for light backgrounds)")
    p.add_argument("--verb", required=True)
    p.add_argument("--desc", required=True)
    p.add_argument("--screenshot", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--verb-desc-gap", type=int, default=50)
    p.add_argument("--desc-line-gap", type=int, default=32)
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.output) or ".", exist_ok=True)
    compose(a.bg, a.fg, a.verb, a.desc, a.screenshot, a.output,
            a.verb_desc_gap, a.desc_line_gap)


if __name__ == "__main__":
    main()
