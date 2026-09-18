#!/usr/bin/env python3
"""Every string in the iOS catalog has Spanish and Hebrew, and keeps its format specifiers.

The web holds its three languages to one key set with a Vitest test; this is the same promise
for ios/CampOps/CampOps/Localizable.xcstrings. A key Xcode extracted after someone added a
Text("…") shows as English in a Spanish app until it is translated — run this before shipping.
"""
import json, re, sys

PATH = "ios/CampOps/CampOps/Localizable.xcstrings"
SPEC = re.compile(r"%(?:\d\$)?(?:lld|ld|d|@|f|\.\d+f)")
cat = json.load(open(PATH))
problems = []
for key, entry in cat["strings"].items():
    if entry.get("shouldTranslate") is False or not key.strip():
        continue
    locs = entry.get("localizations", {})
    for lang in ("es", "he"):
        loc = locs.get(lang)
        if not loc:
            problems.append(f"{lang} missing: {key!r}")
            continue
        values = [loc["stringUnit"]["value"]] if "stringUnit" in loc else [
            v["stringUnit"]["value"] for v in loc.get("variations", {}).get("plural", {}).values()]
        want = sorted(SPEC.findall(key))
        for v in values:
            # A plural form may spell the number out ("un día"), so only check non-plural strings.
            if "stringUnit" in loc and sorted(SPEC.findall(v)) != want:
                problems.append(f"{lang} format mismatch: {key!r} -> {v!r}")
print(f"{len(cat['strings'])} keys, {len(problems)} problems")
print("\n".join(problems[:50]))
sys.exit(1 if problems else 0)
