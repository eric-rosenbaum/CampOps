#!/usr/bin/env python3
"""
Regenerate src/lib/compliance/planTemplate.ts from NYSDOH's own .docx.

    python3 scripts/build-plan-template.py

Run this when the state reissues docs/compliance/sources/nysdoh/childrens_camp_safety_plan.docx.
Never hand-edit the generated module: the point of generating it is that the ninety-two questions
in the app are provably the ninety-two in the document the county reads.

How the questions are found: Word keeps the visible numbering in list definitions rather than in
the text, so the numbered questions are the paragraphs carrying numId 73 or 74 -- the two lists
that make up the master sequence. That yields exactly 92, which is asserted below, because a
silent 91 or 93 would renumber the whole document.

Section boundaries are fixed ranges rather than parsed headings, and they are verified rather than
assumed: the template cross-references its own numbering ("Skip to question 16", "Complete
questions 14-15", "the standards listed above in numbers 75-77"). Question 13 is the sewage
question whose follow-ups are 14 and 15, and 75 through 77 are the three supervision-ratio
questions, so the numbering below lines up with the state's on three independent references.

Skip logic is derived the same way, from the document's own "Complete questions A-B" phrasing.
"""
import html
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT / 'docs/compliance/sources/nysdoh/childrens_camp_safety_plan.docx'
OUT = ROOT / 'src/lib/compliance/planTemplate.ts'
BOX = '☐'

# (first question, last question, category) -- see the module docstring on how these were checked.
RANGES = [
    (1, 4, 'PERSONNEL'), (5, 23, 'FACILITY_OPERATION'), (24, 47, 'FIRE_SAFETY'),
    (48, 74, 'MEDICAL_PLAN'), (75, 88, 'ACTIVITIES_SUPERVISION'), (89, 92, 'STAFF_TRAINING'),
]
SLUG = {'PERSONNEL': 'personnel', 'FACILITY_OPERATION': 'facility', 'FIRE_SAFETY': 'fire',
        'MEDICAL_PLAN': 'medical', 'ACTIVITIES_SUPERVISION': 'supervision',
        'STAFF_TRAINING': 'training'}

# Question 81 is the activity grid and 85 is a pair of free-text boxes; both are laid out as Word
# tables, which the shape detector would otherwise read as data tables. 81's options are the
# eleven activities that decide which addenda a camp owes.
ACTIVITIES = ['Archery', 'Swimming (on-site)', 'Boating, canoeing or kayaking', 'Camp trips',
              'Off-site swimming', 'Horseback riding', 'Wilderness trips', 'Riflery', 'Sports',
              'Aquatic theme parks', 'Ropes or challenge course']

ADDENDA = [
    ('archery', 'Archery Plan', {'has_archery': 'true'}, 'cc_safety_plan_archery.docx'),
    ('swimming', 'Swimming Plan',
     {'any_of': {'has_pool': 'true', 'has_waterfront': 'true'}}, 'cc_safety_plan_swimming.docx'),
    ('boating', 'Boating, Canoeing and Kayaking Plan',
     {'has_boating': 'true'}, 'cc_safety_plan_boating.docx'),
    ('camp_trips', 'Camp Trips Plan', {'offers_trips': 'true'}, 'cc_safety_plan_camp_trips.docx'),
    ('camp_trip_swimming', 'Camp Trip Swimming Plan',
     {'offers_offsite_swim': 'true'}, 'cc_safety_plan_camp_trip_swimming.docx'),
    ('horseback_riding', 'Horseback Riding Plan',
     {'has_equestrian': 'true'}, 'cc_safety_plan_horseback_riding.docx'),
    ('riflery', 'Riflery Plan', {'has_riflery': 'true'}, 'cc_safety_plan_riflery.docx'),
    ('challenge_course', 'Challenge Course Plan',
     {'has_challenge_course': 'true'}, 'cc_safety_plan_challenge_course.docx'),
    # The state offers these three to any camp; nothing in setup decides them.
    ('sports', 'Sports Plan', {}, 'cc_safety_plan_sports.docx'),
    ('spray_grounds', 'Spray Grounds Plan', {}, 'cc_safety_plan_spray_grounds.docx'),
    ('generic_activity', 'Generic Activity Plan', {}, 'cc_safety_plan_generic_activity.docx'),
]


def clean(xml: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', xml))).strip()


def table_columns(tbl: str):
    """A real data table, as opposed to the single-cell boxes the template uses for guidance."""
    rows = re.findall(r'<w:tr[ >].*?</w:tr>', tbl, re.S)
    if len(rows) < 2:
        return None
    cells = [c for c in (clean(c) for c in re.findall(r'<w:tc>.*?</w:tc>', rows[0], re.S)) if c]
    return cells if len(cells) >= 2 else None


def parse():
    doc = zipfile.ZipFile(DOCX).read('word/document.xml').decode('utf8', 'ignore')
    items, n = [], 0
    for m in re.finditer(r'<w:tbl>.*?</w:tbl>|<w:p[ >].*?</w:p>', doc, re.S):
        block = m.group(0)
        if block.startswith('<w:tbl'):
            cols = table_columns(block)
            if items and cols:
                items[-1]['tables'].append(cols)
            continue
        numbered = re.search(r'<w:numPr>.*?<w:numId w:val="(\d+)"', block, re.S)
        text = clean(block)
        if not text:
            continue
        if numbered and numbered.group(1) in ('74', '73'):
            n += 1
            items.append({'n': n, 'prompt': text, 'after': [], 'tables': []})
        elif items:
            items[-1]['after'].append(text)
    assert n == 92, f'expected 92 numbered questions, found {n}'
    return items


def category(n: int) -> str:
    for first, last, cat in RANGES:
        if first <= n <= last:
            return cat
    raise ValueError(n)


def key(n: int) -> str:
    return f'ny.plan.{SLUG[category(n)]}.{n:02d}'


def choices_of(item) -> list:
    out = []
    for para in [item['prompt']] + item['after']:
        if BOX not in para:
            continue
        for part in para.split(BOX)[1:]:
            choice = re.sub(r'\s+', ' ', part.split('Enter text here')[0]).strip(' .:' + BOX)
            if choice and len(choice) < 160:
                out.append(choice)
    seen, unique = set(), []
    for c in out:
        if c.lower() not in seen:
            seen.add(c.lower())
            unique.append(c)
    return unique


def build():
    items = parse()

    deps = {}
    for item in items:
        blob = item['prompt'] + ' ' + ' '.join(item['after'][:2])
        for m in re.finditer(r'[Cc]omplete questions? (\d+)\s*[-–]\s*(\d+)', blob):
            for target in range(int(m.group(1)), int(m.group(2)) + 1):
                deps[target] = item['n']
        for m in re.finditer(r'[Cc]omplete question (\d+)(?!\s*[-–])', blob):
            deps[int(m.group(1))] = item['n']

    questions = []
    for item in items:
        n = item['n']
        choices = choices_of(item)
        lowered = [c.lower().split('(')[0].strip() for c in choices]
        blob = item['prompt'] + ' ' + ' '.join(item['after'])
        multi = bool(re.search(r'[Cc]heck all that apply|[Ss]elect all|Check all', blob))
        prompt = re.sub(r'\s*' + BOX + r'.*$', '', item['prompt']).strip()

        if n == 81:
            kind, choices, columns = 'multi_select', ACTIVITIES, []
        elif n == 85:
            kind, columns = 'long_text', []
        elif choices and set(lowered) <= {'yes', 'no'} and len(choices) >= 2:
            kind, choices, columns = 'yes_no', [], []
        elif item['tables']:
            kind, columns = 'table', item['tables'][0]
        elif len(choices) >= 2:
            kind, columns = ('multi_select' if multi or len(choices) > 4 else 'select'), []
        elif len(choices) == 1 and 'check this box' in choices[0].lower():
            kind, columns = 'attest', []
        else:
            kind, choices, columns = 'long_text', [], []

        q = {'key': key(n), 'n': n, 'category': category(n), 'kind': kind, 'prompt': prompt,
             'choices': choices, 'columns': columns,
             'freeText': bool(re.search(r'Enter text here', blob))}
        if n in deps:
            q['dependsOn'] = key(deps[n])
        questions.append(q)

    addenda = [{'code': c, 'title': t, 'appliesWhen': aw,
                'sourceUrl': 'https://www.health.ny.gov/environmental/outdoors/camps/docs/' + f,
                'archivedPath': 'docs/compliance/sources/nysdoh/' + f}
               for c, t, aw, f in ADDENDA]
    return questions, addenda


HEADER = '''

/**
 * New York's Children's Camp Safety Plan template: ninety-two numbered questions, six sections.
 *
 * GENERATED from the state's own .docx — do not hand-edit. Regenerate with
 * `python3 scripts/build-plan-template.py` when NYSDOH reissues
 * docs/compliance/sources/nysdoh/childrens_camp_safety_plan.docx.
 *
 * This is the document a camp actually fills in. We used to write against DOH-2040 instead, which
 * is the reviewer's checklist — the thing a sanitarian ticks off while *reading* a plan. Asking a
 * camp to compose prose under ninety-six checklist headings, and then hand-label a table of
 * contents, was asking them to write the wrong document.
 *
 * `n` is the state's own question number, and it is load-bearing: the template cross-references
 * itself ("Skip to question 16", "Complete questions 14-15", "the standards listed above in
 * numbers 75–77"). Those self-references are what verified the extraction — 13 is the sewage
 * question whose follow-ups are 14 and 15, and 75 through 77 are exactly the three
 * supervision-ratio questions. Renumbering would break the document against itself.
 *
 * Living in code rather than Postgres is deliberate: it is identical for every camp and changes
 * only when the state reissues the template, so a table bought a join we never make and a seed to
 * keep in step with the .docx by hand. The camp's *answers* live in `camp_plan_answers`.
 */
export type PlanAnswerKind =
  | 'yes_no' | 'select' | 'multi_select' | 'long_text' | 'table' | 'attest';

export interface PlanQuestion {
  key: string;
  /** The state's own question number, 1–92. Printed on the rendered plan. */
  n: number;
  category: string;
  kind: PlanAnswerKind;
  prompt: string;
  choices: string[];
  /** Column headers, for the ten questions the template asks as a table. */
  columns: string[];
  /** The template's own skip logic: only ask this when its gate is answered Yes. */
  dependsOn?: string;
  /** The template offers an "Enter text here" box alongside the boxes. */
  freeText: boolean;
}

/** An activity-specific plan the state publishes separately, required only if you run it. */
export interface PlanAddendum {
  code: string;
  title: string;
  appliesWhen: Record<string, unknown>;
  sourceUrl: string;
  archivedPath: string;
}

export const PLAN_SECTIONS: { category: string; title: string }[] = [
  { category: 'PERSONNEL',              title: 'I. Personnel' },
  { category: 'FACILITY_OPERATION',     title: 'II. Facility operation and maintenance' },
  { category: 'FIRE_SAFETY',            title: 'III. Fire safety' },
  { category: 'MEDICAL_PLAN',           title: 'IV. Medical requirements' },
  { category: 'ACTIVITIES_SUPERVISION', title: 'V. Supervision and activity safety' },
  { category: 'STAFF_TRAINING',         title: 'VI. Orientation and training' },
];

export const PLAN_QUESTIONS: PlanQuestion[] = '''


def main():
    questions, addenda = build()
    OUT.write_text(
        HEADER + json.dumps(questions, ensure_ascii=False, indent=2)
        + ';\n\nexport const PLAN_ADDENDA: PlanAddendum[] = '
        + json.dumps(addenda, ensure_ascii=False, indent=2) + ';\n')
    print(f'{OUT.relative_to(ROOT)}: {len(questions)} questions, {len(addenda)} addenda')


if __name__ == '__main__':
    main()
