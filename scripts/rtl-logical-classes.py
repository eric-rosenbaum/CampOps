#!/usr/bin/env python3
"""Rewrite physical Tailwind direction classes to logical ones, so a page mirrors under dir=rtl.

ml-/mr-/pl-/pr- -> ms-/me-/ps-/pe-, left-/right- -> start-/end-, text-left/right -> text-start/end,
border-l/r -> border-s/e, rounded-l/r/tl/... -> rounded-s/e/ss/.... In a left-to-right page every
logical class computes to exactly the physical one it replaced, so this changes nothing in English.

Deliberately left alone: left-1/2 / right-1/2 (almost always paired with -translate-x-1/2 to
centre something, which is direction-neutral already), and anything outside a class-looking
token. Usage: scripts/rtl-logical-classes.py <files...>
"""
import re, sys

B = r"(?<=[\s'\"`:{(])"  # token start: whitespace, quote, backtick, variant colon
RULES = [
    (re.compile(B + r"(-?)m([lr])-(?=[\d\[a-z])"), lambda m: f"{m[1]}m{'s' if m[2]=='l' else 'e'}-"),
    (re.compile(B + r"(-?)p([lr])-(?=[\d\[a-z])"), lambda m: f"{m[1]}p{'s' if m[2]=='l' else 'e'}-"),
    (re.compile(B + r"(-?)(left|right)-(?!1/2)(?=[\d\[]|px|full|auto)"),
     lambda m: f"{m[1]}{'start' if m[2]=='left' else 'end'}-"),
    (re.compile(B + r"text-(left|right)(?=[\s'\"`])"), lambda m: f"text-{'start' if m[1]=='left' else 'end'}"),
    (re.compile(B + r"border-([lr])(?=[\s'\"`-])"), lambda m: f"border-{'s' if m[1]=='l' else 'e'}"),
    (re.compile(B + r"rounded-(tl|tr|bl|br|l|r)(?=[\s'\"`-])"),
     lambda m: "rounded-" + {"l": "s", "r": "e", "tl": "ss", "tr": "se", "bl": "es", "br": "ee"}[m[1]]),
]

total = 0
for path in sys.argv[1:]:
    src = open(path).read()
    out = src
    n = 0
    for rx, rep in RULES:
        out, k = rx.subn(rep, out)
        n += k
    if n:
        open(path, "w").write(out)
        print(f"{n:4d}  {path}")
        total += n
print(f"{total} classes rewritten")
