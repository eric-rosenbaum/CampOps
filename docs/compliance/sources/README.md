# Source library

Every document cited in `../westchester-obligation-map.md` and `../packet-contents-survey.md`,
downloaded from the issuing body on **2026-08-31**. Nothing here is a mirror or a summary.

| Directory | What it holds |
|---|---|
| `nysdoh/` | NYSDOH camp forms, publications, fact sheets, safety plan templates and guidance letters |
| `wcdoh/` | Westchester County DOH documents, including Chapter 873 of the county sanitary code |
| `other/` | The seven incident report forms — state forms the state does not itself publish, taken from NYC and county mirrors |
| `regulations/` | 10 NYCRR Subparts 7-2, 6-1, 6-2, 6-3, 14-1, 5-1 and 5-4, section by section, from regs.health.ny.gov |
| `webpages/` | The pages that change between seasons, saved as HTML |

## Re-downloading

Government sites reject requests without a browser User-Agent (403). This is the whole trick:

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
curl -sL -A "$UA" -o out.pdf https://www.health.ny.gov/forms/doh-3915.pdf
```

## Checking what changed

The obligation map carries a sha256 for every file. Re-download, re-hash, diff:

```bash
cd docs/compliance/sources && shasum -a 256 nysdoh/* wcdoh/* other/* webpages/* | sort
```

Any hash that moved is a document that changed. The three that move most often are the county's
camp-operator page (its packet links change each season), the state's operators page (the annual
letter), and the county sanitary code (its filename carries the Board of Health's approval date —
the copy here is `CHAPTER 873 FINAL VERSION APPROVED 8-5-25`).

## Provenance

Source URLs are recorded per document in the obligation map's §0 table and, for the nine official
camp forms shipped in `public/forms/ny/`, in that directory's `SOURCES.md`.
