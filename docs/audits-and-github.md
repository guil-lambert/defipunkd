# Audits & GitHub recovery pipeline

This doc covers the CLIs that build the per-protocol audit index and recover
missing `github` fields. All commands are run from the repo root with
`pnpm --filter @defipunkd/enrichment <script>`. Outputs are committed under
`data/auditors/`, `data/enrichment/<slug>/`, and `data/overlays/<slug>.json`.

## tl;dr — full re-run from scratch

```bash
# 1. Crawl auditor GitHub repos for the report index (~1700 entries).
GITHUB_TOKEN=ghp_… pnpm --filter @defipunkd/enrichment index-auditors

# 2. Merge auditor index with each protocol's DefiLlama audit_links.
pnpm --filter @defipunkd/enrichment extract-audits

# 3. Inherit github from parent records (e.g. aave-v3 ← aave).
pnpm --filter @defipunkd/enrichment inherit-parent-github -- --only-with-audits --apply

# 4. Scrape protocol websites for github links.
pnpm --filter @defipunkd/enrichment scrape-github-from-website -- --only-with-audits --apply

# 5. Pull github links out of audit PDFs and HTML index pages.
pnpm --filter @defipunkd/enrichment extract-github-from-audits -- --apply

# Inspect what's left.
pnpm --filter @defipunkd/enrichment audits-without-github
```

Steps 3–5 each respect existing `data/overlays/<slug>.json` entries and
will not overwrite a curated `github` value.

## Data flow

```
                        ┌─────────────────────────────┐
   DefiLlama API ───►   │ data/defillama-snapshot.json│
                        └────────────┬────────────────┘
                                     │
       ┌─────────────────────────────┼──────────────────────────────────┐
       │                             │                                  │
       ▼                             ▼                                  ▼
[index-auditors]            [extract-audits]                   [inherit-parent-github]
  GitHub crawl of                merge audit_links              parent_slug → child
  auditor repos                  + auditor index                  github inheritance
       │                             │                                  │
       ▼                             ▼                                  ▼
data/auditors/             data/enrichment/<slug>/            data/overlays/<slug>.json
  index.json                  audits.json                       (curated github)
                                     │
                       ┌─────────────┴────────────────┐
                       ▼                              ▼
            [scrape-github-from-website]    [extract-github-from-audits]
                fetch p.website                fetch audit URLs:
                + docs.<root> fallback           PDF → pdftotext
                regex github.com/...             HTML → regex
                       │                              │
                       └──────────────┬───────────────┘
                                      ▼
                          data/overlays/<slug>.json
                              (auto-curated github)
```

## Commands

### `index-auditors` — crawl auditor GitHub repos

Pulls report listings from Trail of Bits (`/reviews`), Spearbit (`/pdfs`),
Sherlock (`/audits`), and Code4rena (org-wide repo listing) into a single
normalized index at `data/auditors/index.json`.

```bash
GITHUB_TOKEN=ghp_… pnpm --filter @defipunkd/enrichment index-auditors
pnpm --filter @defipunkd/enrichment index-auditors -- --firm spearbit  # one firm only
```

`GITHUB_TOKEN` is needed in practice — Code4rena lists hundreds of repos and
will exceed the unauthenticated 60 req/hr limit. Generate a fine-grained
token with public-read access at <https://github.com/settings/tokens>.

### `extract-audits` — merge audit references per protocol

For each active protocol in the snapshot, seeds entries from
`audit_links` (firm inferred from URL host) and fuzzy-matches the slug +
name against `data/auditors/index.json`. Writes
`data/enrichment/<slug>/audits.json`.

```bash
pnpm --filter @defipunkd/enrichment extract-audits
pnpm --filter @defipunkd/enrichment extract-audits -- --slug uniswap-v3
```

The fuzzy match uses `audit-match.ts` — token overlap requiring ≥1 shared
non-stop token of length ≥4. The stoplist is intentionally aggressive
(category words like `bridge`, `staking`, `dex`, plus chain names) to
suppress false positives.

### `inherit-parent-github` — copy parent's github to children

For protocols with `parent_slug` set (e.g. `aave-v3` → `aave`), copy the
parent's `github` array into a per-protocol overlay. Highest-leverage step:
~879 candidates, no network calls.

```bash
pnpm --filter @defipunkd/enrichment inherit-parent-github                           # dry run
pnpm --filter @defipunkd/enrichment inherit-parent-github -- --apply                # all
pnpm --filter @defipunkd/enrichment inherit-parent-github -- --only-with-audits --apply
```

### `audits-without-github` — list candidates for the next pass

Shows active protocols that have ≥1 audit reference (DefiLlama or
auditor-repo) but no github field in either the snapshot or any overlay.
Sorted by TVL desc.

```bash
pnpm --filter @defipunkd/enrichment audits-without-github
pnpm --filter @defipunkd/enrichment audits-without-github -- --min-tvl 100000000
pnpm --filter @defipunkd/enrichment audits-without-github -- --csv > /tmp/orphans.csv
```

### `scrape-github-from-website` — tier 2

For each candidate, fetches `p.website` and grep the HTML for
`github.com/<org>/<repo>` URLs. Falls back to the bare root domain (DefiLlama
often lists `app.<host>` SPA shells), then to `docs.<root>`, and finally to
any docs/gitbook link found in the page.

```bash
pnpm --filter @defipunkd/enrichment scrape-github-from-website -- --only-with-audits             # dry run
pnpm --filter @defipunkd/enrichment scrape-github-from-website -- --only-with-audits --apply
pnpm --filter @defipunkd/enrichment scrape-github-from-website -- --slug falcon-finance --apply
```

JSONL log of every attempt → `data/auditors/scrape-github.log.jsonl`.

### `extract-github-from-audits` — tier 3

For candidates with no website hit, walks each protocol's
`audits.json` URLs:

- **PDF audit_links** — download to `.cache/audit-pdfs/<sha256>.pdf`, run
  `pdftotext -layout -l 20`, regex github URLs from the text. Cached so
  re-runs are essentially free.
- **HTML audit_links** — fetch the page (e.g. `code4rena.com/reports/<…>`,
  `docs.<protocol>.org/audits`), run the same regex on the HTML.
  `github.com` URLs are special-cased: parsed from the URL path itself
  rather than fetched, so we don't pollute results with GitHub's own nav
  chrome.

```bash
pnpm --filter @defipunkd/enrichment extract-github-from-audits                         # dry run
pnpm --filter @defipunkd/enrichment extract-github-from-audits -- --apply
pnpm --filter @defipunkd/enrichment extract-github-from-audits -- --slug m0 --apply
pnpm --filter @defipunkd/enrichment extract-github-from-audits -- --pages 30 --apply   # deeper extraction
```

Requires `pdftotext` on `PATH` — `brew install poppler` on macOS.

JSONL log → `data/auditors/extract-github-from-audits.log.jsonl`.

## Overlays

All recovered github fields are written to `data/overlays/<slug>.json`:

```jsonc
{
  "github": ["https://github.com/m0-foundation"]
}
```

Overlays survive sync because the registry's merge layer loads them on top
of the snapshot with `[curated]` provenance. The snapshot itself is
regenerated from DefiLlama on every sync — only `first_seen_at` is carried
forward — so any direct snapshot edit would be wiped.

The recovery scripts will **never overwrite** an existing curated
`github` value. To re-process a slug after a manual edit, delete its
overlay file first.

## Recall analysis

After running the full pipeline against the current snapshot:

| Tier | Source | Overlays written |
| --- | --- | --- |
| 0 | Parent inheritance | 516 |
| 2 | Website scrape (homepage + docs fallback) | ~323 |
| 3a | Audit PDF text extraction | ~149 |
| 3b | Audit HTML index pages | ~245 |
| **Total** | | **~1230** |

Starting from 2180 audited-but-no-github protocols, that's ~56% recovery
without manual curation. The residual gap is dominated by:

- Custodial / CEX entries (no public smart-contract repo by design — null
  is the correct answer).
- Cloudflare bot blocks on the protocol's website.
- Fully client-rendered SPAs (gitbook, notion, vercel) where the homepage
  HTML is an empty React shell and `pdftotext` can't recover the URL from
  a PDF either. Closing this would need a headless browser pass
  (Playwright).

Inspect the JSONL logs to see exactly which slugs ended up in each bucket.

## Iterating

When a new auditor is added, expand `AUDITOR_ORGS` in
`packages/enrichment/src/scrape-github-from-html.ts` to keep their handle
out of overlays. Same for boilerplate orgs that show up as noise in
extracted text.

When the regex misses a URL form found in the wild (PDF text wrap,
JSON-in-HTML escaping, etc.), add a regression test to
`scrape-github-from-html.test.ts` and adjust `HREF_GITHUB_RE`. The
existing test cases cover the gotchas shipped to date.
