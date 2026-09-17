#!/usr/bin/env python3
"""Add Swift files to the iOS target.

Only `ios/CampOps/CampOps/` is a synchronized folder, and it holds nothing but the asset
catalogue, the fonts and Info.plist. Every Swift source lives in a sibling folder that Xcode
tracks the old way, so a new file that is not registered in four places in `project.pbxproj`
compiles nowhere and fails at runtime with a missing symbol -- or worse, silently keeps using
the old definition.

Usage:
    scripts/ios-add-files.py Views/Campground/BoardView.swift Models/Foo.swift

Paths are relative to ios/CampOps/. Files already registered are skipped, so it is safe to
re-run over a whole list.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IOS = ROOT / "ios" / "CampOps"
PBX = IOS / "CampOps.xcodeproj" / "project.pbxproj"


def object_id(seed: str) -> str:
    """A stable 24-char uppercase hex id, derived from the path so re-runs agree."""
    return hashlib.sha1(seed.encode()).hexdigest()[:24].upper()


def find_group_for(text: str, folder: str) -> str | None:
    """The PBXGroup whose `path` is this folder, e.g. `Views/Campground` -> the Campground group."""
    leaf = folder.split("/")[-1]
    m = re.search(
        r"([0-9A-F]{24}) /\* " + re.escape(leaf) + r" \*/ = \{\s*isa = PBXGroup;",
        text,
    )
    return m.group(1) if m else None


def add_group(text: str, folder: str) -> tuple[str, str]:
    """Create a PBXGroup for `folder` and hang it off its parent. Returns (text, group id)."""
    parent_folder, _, leaf = folder.rpartition("/")
    parent_id = find_group_for(text, parent_folder) if parent_folder else None
    if parent_id is None:
        raise SystemExit(f"no parent group for {folder!r}; create {parent_folder!r} first")

    gid = object_id("group:" + folder)
    block = (
        f"\t\t{gid} /* {leaf} */ = {{\n"
        f"\t\t\tisa = PBXGroup;\n"
        f"\t\t\tchildren = (\n"
        f"\t\t\t);\n"
        f"\t\t\tpath = {leaf};\n"
        f"\t\t\tsourceTree = \"<group>\";\n"
        f"\t\t}};\n"
    )
    text = text.replace("/* End PBXGroup section */", block + "/* End PBXGroup section */", 1)

    # Hang the new group off its parent's children list.
    pat = re.compile(
        r"(" + parent_id + r" /\* [^*]+ \*/ = \{\s*isa = PBXGroup;\s*children = \(\n)"
    )
    text = pat.sub(lambda m: m.group(1) + f"\t\t\t\t{gid} /* {leaf} */,\n", text, count=1)
    return text, gid


def add_file(text: str, rel: str) -> str:
    folder, _, name = rel.rpartition("/")
    if f"/* {name} */" in text:
        print(f"  = {rel} (already registered)")
        return text

    file_ref = object_id("fileref:" + rel)
    build_file = object_id("buildfile:" + rel)

    group_id = find_group_for(text, folder) if folder else None
    if group_id is None:
        text, group_id = add_group(text, folder)

    # 1. PBXBuildFile
    text = text.replace(
        "/* End PBXBuildFile section */",
        f"\t\t{build_file} /* {name} in Sources */ = {{isa = PBXBuildFile; "
        f"fileRef = {file_ref} /* {name} */; }};\n/* End PBXBuildFile section */",
        1,
    )
    # 2. PBXFileReference -- `path` is the bare filename; the folder comes from the group.
    text = text.replace(
        "/* End PBXFileReference section */",
        f"\t\t{file_ref} /* {name} */ = {{isa = PBXFileReference; "
        f"lastKnownFileType = sourcecode.swift; path = {name}; sourceTree = \"<group>\"; }};\n"
        "/* End PBXFileReference section */",
        1,
    )
    # 3. The enclosing group's children
    pat = re.compile(r"(" + group_id + r" /\* [^*]+ \*/ = \{\s*isa = PBXGroup;\s*children = \(\n)")
    text = pat.sub(lambda m: m.group(1) + f"\t\t\t\t{file_ref} /* {name} */,\n", text, count=1)
    # 4. The Sources build phase
    pat = re.compile(r"(isa = PBXSourcesBuildPhase;\s*buildActionMask = \d+;\s*files = \(\n)")
    text = pat.sub(
        lambda m: m.group(1) + f"\t\t\t\t{build_file} /* {name} in Sources */,\n", text, count=1
    )
    print(f"  + {rel}")
    return text


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    text = PBX.read_text()
    for rel in argv:
        rel = rel.replace("ios/CampOps/", "").lstrip("/")
        if not (IOS / rel).exists():
            raise SystemExit(f"no such file: ios/CampOps/{rel}")
        text = add_file(text, rel)
    PBX.write_text(text)
    print(f"wrote {PBX.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
