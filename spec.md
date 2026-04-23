# DefiBeat — DeFi Transparency Registry MVP Spec

> **Pivot — DEFI@home (2026-04-23).** This spec was originally written around a three-phase enrichment pipeline (Phase 1 crawlers, Phase 2 `@l2beat/discovery`-based onchain workers, Phase 3 LLM classification). **That plan is superseded.** Risk-slice grading now happens via **DEFI@home**: contributors run a pinned prompt through an LLM of their choice, submit JSON output as a pull request against `data/submissions/<slug>/<slice>/`, and a quorum bot merges to `data/assessments/` once ≥3 independent runs agree on grade and overlapping evidence. See `README.md` (top section), `packages/prompts/` (prompt source), and `data/schema/slice-assessment.v1.json` (output contract).
>
> Specifically superseded:
> - **Phase 1 crawlers / artifact extraction** — replaced by DEFI@home submissions citing block explorers, pinned GitHub commits, and audit PDFs. No `data/artifacts/` directory; no crawler workers; no robots.txt / UA / rate-limit policy needed.
> - **Phase 2 onchain workers** (`@l2beat/discovery` integration, SQLite cache, contract / discovery tables) — DEFI@home contributors and the autorun GitHub Action read onchain state via block explorers and cite the URLs as evidence. The "Phase 2 may introduce a DB" provision lapses; the project stays git-native indefinitely.
> - **Phase 3 LLM classification** (machine-generated claims with hash + substring citation enforcement) — replaced by DEFI@home's per-submission JSON schema, which already enforces evidence URLs and the conditional "grade=unknown ⇒ unknowns[] non-empty, else evidence[] non-empty" rule.
>
> What carries over unchanged: the DeFiLlama seed (`pnpm sync` → `data/defillama-snapshot.json`), the `packages/registry` merge of snapshot + overlays, the read-only / git-native operating model, the radiographic visual design, and the `[defillama]` / `[curated]` provenance tagging. Phase 0 (the static-rendered MVP) shipped as described and is the production codebase today.
>
> The provenance system gains one new tag class: `[assessment]` for fields populated from `data/assessments/<slug>/<slice>.json`, replacing the planned `[crawler]` / `[onchain]` / `[llm_inference]` classes. The Defiscan stage adoption (originally Phase 3) becomes the next milestone after the quorum bot lands.

## Goal

Build a live, evidence-based registry of DeFi protocols that can evolve into an L2BEAT-for-DeFi style review system.

The initial version is **not** a final risk rating system. It is a protocol registry and evidence intake layer with human-reviewed publication later.

## Product name

**DefiBeat.** Matches the repo; evokes L2BEAT lineage.

## Core idea

Use **DeFiLlama as the protocol universe seed**, then layer deterministic evidence collection and later human-reviewed analysis on top.

```
curl https://api.llama.fi/protocols
```

This avoids rebuilding the protocol master list from scratch and gets an MVP live quickly.

## Origin / codebase

This project starts as a **fork of [l2beat/l2beat](https://github.com/l2beat/l2beat)** (MIT). Inherited pieces to keep:

- monorepo structure (pnpm workspaces retained; **pruned aggressively on Day 1** — delete rollup packages immediately, keep `@l2beat/discovery` + the UI package)
- `@l2beat/discovery` onchain worker toolchain (Phase 2)
- **L2BEAT-identical dense table component** for protocol detail pages — port near-verbatim; inherit their layout mechanics, but swap the palette (see "Visual design")

Rip out L2 rollup-specific code: rollup stages tied to DA/sequencer concerns, data-availability modules, sequencer/proposer modeling, and any logic that only makes sense for a rollup rather than a DeFi app.

The rubric is adapted from **[Defiscan's framework](https://www.defiscan.info/framework)**. Adopt Defiscan stages verbatim at launch; revisit as real review cases expose gaps.

**License**: MIT, inherited from L2BEAT upstream.

## Product framing

Version 1 is:

- a live registry of DeFi protocols (**read-only**; no user-writable surfaces at MVP)
- a transparency and control-surface evidence hub
- a review pipeline with explicit missingness and provenance (pipeline added in later phases)

It does **not** claim protocols are safe or unsafe based on incomplete data. Published reviewed profiles use a graded stage label (Defiscan stages) with prominent disclaimers.

### Read-only MVP

MVP has **no submission queue, no reviewer web UI, no contact form, no auth, no database**. All writes go through the solo reviewer's terminal as **git commits**. Corrections and takedowns route to **public GitHub PRs and issues** on the project repo (linked from site footer).

## Target audience

Primary: **DeFi power users and researchers**. Assume familiarity with proxies, multisigs, timelocks, role-based admin. Lean into raw evidence density over marketing polish.

## Operating assumption

Solo builder, solo reviewer. Throughput is ~5–10 reviewed protocols per week, so the pipeline must be machine-first: deterministic workers do the grunt work, human review only kicks in at publication.

## Key principles

1. **DeFiLlama is the registry seed, not the final truth**
2. **Stored artifacts and deterministic chain reads come before LLM analysis**
3. **Missingness should be visible** (even if undifferentiated at Phase 0)
4. **All claims must have provenance; LLM claims must carry citations enforced by hash + substring match** (Phase 3)
5. **Onchain beats text in any conflict — but contradictions are shown publicly, not hidden**
6. **Human review is required before stamp-of-approval publication**
7. **Do not collapse everything into one score too early**
8. **The moat is the admin/control-surface graph, not just scraped metadata**
9. **Machine-first pipeline — the solo reviewer is the scarce resource**
10. **Read-only MVP — no writes from the internet until Phase 3**
11. **There is no database at Phase 0; the git repo is the source of truth.** Protocol metadata lives as committed JSON/TS files. Every deploy is an immutable snapshot of the repo at a given SHA. When a DB finally enters (Phase 2+, for onchain data only), it remains derived state — any instance must be rebuildable from scratch using git + a live DeFiLlama fetch.

### Why git-native (Phase 0)

- **Reviewer flow is already GitHub.** Corrections are PRs; the review surface is `gh pr view`. No second system to build.
- **Provenance is `git blame`.** Who curated a field, when, and why (commit message + PR discussion) comes free. No `source_type` / `retrieved_at` / `artifact_hash` columns to maintain at Phase 0.
- **Deploys are immutable.** The site at commit X is deterministically reproducible. No "what did the DB look like on Tuesday" questions.
- **Forks are trivial.** Anyone can `git clone` DefiBeat and run their own instance with zero infra beyond Vercel.
- **L2BEAT precedent.** l2beat/l2beat keeps static project metadata in `packages/config/src/projects/**.ts`; their DB only holds time-series. We go further and skip the DB entirely until Phase 2.

## MVP scope

### Source of truth for the master list

Pull `https://api.llama.fi/protocols` via `pnpm sync` — a node CLI run locally (or via a `workflow_dispatch` GitHub Action that commits the diff as a PR). It normalizes the payload and writes **`data/defillama-snapshot.json`**, which is committed to the repo.

Provides: protocol name, slug, category, chains, TVL, website, audit count, audit links, twitter, hallmarks, parent protocol relationships, other metadata.

**Upstream etiquette**: send a `User-Agent: DefiBeat (+<contact-url>)`. Manual triggering keeps frequency naturally low.

### Ingest policy

**Ingest everything, enrich selectively.** Every DeFiLlama entry becomes an entry in the snapshot. **No junk filtering at MVP.** Crawlers, onchain workers, and LLM steps (Phase 1+) only run on protocols that meet a quality bar defined at their owning phase.

### Chain scope for ingest

**All chains ingested, display-only.** Phase 2 onchain analysis is Ethereum-mainnet only. Non-EVM onchain rows render as plain `unknown` at Phase 0.

### Delisting

Mirror DeFiLlama: if DeFiLlama delists, we delist. **Soft-delete**: the entry stays in the snapshot with a `delisted_at` field set by the sync script (14-day absence rule — see §"Interview decisions"). `/protocol/{slug}` returns **HTTP 410 Gone** via a route handler.

### What ships in the MVP

For each protocol, display:
- name, family / parent, chains, category, TVL, website, audit count, audit links, twitter, hallmarks
- `last_synced_at` timestamp (always visible)
- **gray "unknown" pizza chart** in the detail-page header and inline on landing-table rows

All enrichment rows render as `unknown` with em-dash provenance at Phase 0.

### URL structure

`/protocol/{slug}` — one page per DeFiLlama slug. Chain deployments within the page use **top-tabs across the protocol header, one per chain**.

**Breadcrumb**: collapsed when `family == instance` (the common case at Phase 0).

### Phase 0 "done" definition

**List + detail pages live for all DeFiLlama protocols**, fully statically rendered from `data/defillama-snapshot.json` + `data/overlays/*.json`, showing raw metadata + `unknown` missingness rows.

### What is intentionally out of scope for MVP

- final safety/risk scores
- automated multisig classification
- final admin/control-surface judgment
- audit quality scoring
- contract-level onchain privilege analysis
- public API (website only)
- authentication
- TVL sparklines / historical charts
- analytics / user tracking
- community submissions or reviewer UI
- contact form (GitHub issues/PRs only)
- crawl-ethics policy (no crawlers at MVP)
- R2/S3 artifact storage
- any database

## Architecture

Three planes, git-native at Phase 0:

1. **Seed discovery** — `pnpm sync` writes `data/defillama-snapshot.json`.
2. **Evidence extraction** (Phase 1) — crawler workers write artifacts into `data/artifacts/<sha256>` + JSON index entries, also committed.
3. **Classification / review** (Phase 3) — LLM-generated structured claims, human-reviewed via GitHub PRs.

### Data layout

```
data/
  defillama-snapshot.json     # one big normalized JSON blob, regenerated by pnpm sync
  overlays/
    <slug>.json               # human-curated per-field overrides (Wikipedia-style); starts empty
  artifacts/                  # (Phase 1+) SHA-256-addressed blobs
```

- **`data/defillama-snapshot.json`** — single file, rewritten whole on each sync. Not per-protocol files (avoids ~6k file changes per sync, keeps diffs legible, avoids filesystem pathology on Vercel build). Shape sketched below.
- **`data/overlays/<slug>.json`** — per-protocol partials validated by a Zod schema in `packages/registry`. Schema is the source of truth; the TS `Overlay` type is derived via `z.infer`. Unknown keys and malformed values fail the build. Overlays override the snapshot on a per-field basis at merge time.

### Registry package

`packages/registry` exports:

- `listProtocols(): Protocol[]` — merged snapshot + overlays, full index in memory
- `getProtocol(slug): Protocol | undefined`
- `listChildren(parentSlug): Protocol[]`

Merge happens once at module load (build time in Next.js server components). No DB, no async. Unknown slugs return `undefined`. Overlay handling: malformed overlays (Zod parse/validation failure, unknown keys) **fail the build**. Orphan overlays (valid schema, slug not in current snapshot) log a warning and are skipped — they do not resurrect the protocol.

### Stack

- **Frontend + API**: TypeScript + Next.js (App Router) on Vercel
- **Rendering**: **full static generation** via `generateStaticParams` over all live slugs (~6k). No ISR needed — the site is a deterministic function of the commit. Delisted → `notFound()` (404) from the page; HTTP 410 achieved via a `route.ts` when feasible.
- **Database**: none at Phase 0. Re-evaluated at Phase 2 kickoff for onchain tables only (contracts, contract_relationships, discovery output). SQLite is a strong candidate — `@l2beat/discovery` already uses `sqlite3` for caching.
- **Object storage**: deferred; may not be needed at all if Phase 1 artifacts stay small enough to keep in-repo.
- **Queue**: none at Phase 0. Phase 1+ workers run as local node scripts writing into `data/`.
- **Seed trigger**: `pnpm sync` locally, or a GitHub Actions `workflow_dispatch` that runs the same script and opens a PR with the resulting diff. No Vercel API route, no shared secret.
- **Observability**: GitHub Actions workflow logs + Vercel build logs. Nothing else at Phase 0.

## Visual design

**Dark-only, radiographic palette** at Phase 0. No light theme shipped. Aesthetic direction: clinical, unbothered, evidence-first — see `.impeccable.md` for full design context.

- Base: deep ink (`#08090c`) with a tinted surface hierarchy (`#10131a`, `#1e2330`).
- Primary text `#d8e4ec`, muted text `#6b7785` (WCAG AA on base).
- Single system accent: **cool blue `#7bb4cc`** — links, active tabs, selection. Used sparingly; accents are evidentiary, not decorative.
- Pizza slice palette: green `#34ad70`, orange `#e28e28`, red `#d13b3b`, unknown/gray `#6b7785`. Each slice color carries a single meaning.
- **CEX category short-circuits grading**: all five slices render red regardless of per-dimension signals. Custodial exchanges fail every transparency axis by construction.
- Typography: **IBM Plex Sans + IBM Plex Mono**, one-family carried hard. Mono + `tabular-nums` on every TVL display.
- Dense table component inherited from L2BEAT near-verbatim; palette and type swapped.
- Logos: `logo` URL from the DeFiLlama payload, rendered client-side with a letter-tile fallback for nulls and 404s.

### Provenance badge style

**Text tag in brackets**, inline after the value. At Phase 0 there are two tags:

- `[defillama]` — value came from the DeFiLlama snapshot
- `[curated]` — value came from a `data/overlays/<slug>.json` override

Example:

```
TVL      $42M       [defillama]
Website  panoptic.xyz  [curated]
Github   unknown    —
Admin    unknown    —
```

`[human_review]` and richer provenance classes (`crawler`, `onchain`, `llm_inference`) arrive with their owning phases. For Phase 0 curated content, git blame on the overlay file is the audit trail.

## Phase plan

### Phase 0: read-only MVP (git-native)
- scaffold Next.js + pnpm workspace; prune l2beat aggressively
- `pnpm sync` writes `data/defillama-snapshot.json`
- `data/overlays/` directory (empty; JSON files validated by Zod in `packages/registry`)
- `packages/registry` merges snapshot + overlays and exports the in-memory API
- protocol detail pages statically rendered for all slugs
- delisted slugs → HTTP 410 (route handler)
- landing browse-all table + 11 category tabs
- `/methodology` static MDX page
- footer link to GitHub issues/PRs
- `noindex` on `/protocol/*` pages
- no DB, no secrets, no Vercel functions

### Phase 1: evidence enrichment
Crawler workers (site, docs, github, audit) run as local node scripts. Output lands in `data/artifacts/<sha256>` + typed JSON index entries, committed via PR. Still no DB. R2/S3 decision re-evaluated here, but likely unnecessary if artifacts stay small.

Crawl-ethics policy (robots.txt, UA, rate-limit) decided at Phase 1 kickoff. Public contradictions UI activates here (crawler vs DeFiLlama).

### Phase 2: onchain worker
- Integrate `@l2beat/discovery`, ripping out rollup-specific code
- Ethereum mainnet only
- canonical contracts, proxy detection, implementation/admin resolution, role extraction, Safe detection, timelock detection
- admin/control graph construction
- Canonical contract discovery uses DeFiLlama's own TVL adapter source code as primary signal. **On adapter parse failure: leave `canonical_contracts` null** — no LLM or scraping fallback.
- **This is where a DB may enter**, but only for onchain tables (contracts, contract_relationships, discovery output). The seed registry stays git-native forever. Re-evaluate SQLite vs Postgres at Phase 2 kickoff.

### Phase 3: classification + review
- machine-generated structured claims with citations (enforced hash + substring)
- onchain-source contradictions join the public contradictions UI
- provisional machine summaries
- human review: already PR-native; a dedicated reviewer UI may or may not be needed
- published reviewed assessments using **Defiscan stages** with disclaimers
- LLM provider decision deferred to this phase

## Refresh cadence

**Manual / on-demand at MVP.** Operator runs `pnpm sync`; the resulting diff to `data/defillama-snapshot.json` is committed (locally or via a `workflow_dispatch` action that opens a PR). Merging the PR redeploys Vercel. Freshness in days is acceptable.

Every sync regenerates the full snapshot. `git diff` is the mutation trail — there is no separate "material fields" diff logic at Phase 0, because there are no downstream workers to trigger. When workers arrive (Phase 1), the snapshot-diff-at-commit-time is a sufficient trigger signal.

## Worker design

### Seed worker → `pnpm sync` (Phase 0)
A plain node CLI. Pulls DeFiLlama, normalizes, writes `data/defillama-snapshot.json`. Computes the 14-day delist rule by comparing current slugs against the previous snapshot and carrying forward `last_seen_at` / `delisted_at` timestamps. Applies `parentProtocol` as `parent_slug`. Derives `is_dead` from DeFiLlama's own deprecation signals (`deadUrl`, `deadFrom`, category hints).

### Site / docs / github / audit workers (Phase 1)
Same shape as Phase 0 sync: local node scripts that write into `data/` (artifacts + JSON index entries) and commit via PR. No queue, no DB.

### Onchain worker (Phase 2)
Forked `@l2beat/discovery`. Output target TBD at Phase 2 (most likely a local SQLite cache plus committed discovery TS configs).

### Classification / review workers (Phase 3)
Designed when Phase 3 starts.

## Community / submissions

**Deferred until Phase 3.** Contact channel at MVP is a footer link to **public GitHub issues and PRs**. Corrections already flow naturally as PRs against `data/overlays/`.

## Data model

At Phase 0, the data model is **TypeScript types**, not SQL tables.

### Snapshot shape (`data/defillama-snapshot.json`)

```ts
type Snapshot = {
  generated_at: string;        // ISO UTC
  protocols: Record<Slug, ProtocolSnapshot>;
};

type ProtocolSnapshot = {
  slug: string;
  name: string;
  category: string;            // raw DeFiLlama string
  chains: string[];
  tvl: number | null;
  tvl_by_chain: Record<string, number>;
  website: string | null;
  twitter: string | null;
  github: string[] | null;     // DeFiLlama-supplied only
  audit_count: number;
  audit_links: string[];
  hallmarks: Array<[number, string]>;  // [unix_ts, description]
  parent_slug: string | null;          // from parentProtocol only
  forked_from: number[] | null;        // DeFiLlama forkedFrom list (numeric ids)
  logo: string | null;                 // canonical URL from /protocols payload
  is_dead: boolean;                    // derived from deadUrl/deadFrom/category
  is_parent: boolean;                  // true for synthesized parent rows
  first_seen_at: string;               // ISO UTC, carried forward across syncs
  last_seen_at: string;                // ISO UTC, bumped when present in latest sync
  delisted_at: string | null;          // set after 14 consecutive days absent
};
```

### Overlay shape (`data/overlays/<slug>.json`)

Overlays are JSON files validated by a Zod schema in `packages/registry` (the schema is the source of truth; the TS `Overlay` type is derived via `z.infer`). Each field is a strict subset of `ProtocolSnapshot`. Unknown keys fail Zod validation (and the build).

```json
{
  "website": "https://example.com",
  "github": ["https://github.com/example/repo"]
}
```

Three-state per-field semantics:

- key **absent** → defer to the snapshot
- key = `null` → curated "known to have no value" (overrides the snapshot with null)
- key = value → override

Empty string / empty array is literal `""` / `[]`, not a sentinel. There is no `hidden` field (no takedown mechanism at Phase 0).

Merge rule: any defined overlay field wins over the snapshot. Undefined / omitted fields defer to the snapshot. The merged result carries an inline `_provenance` map on each field (`"defillama"` or `"curated"`) used by the detail page to render the `[defillama]` / `[curated]` tag.

### Forward-looking (not implemented at Phase 0)

Conceptual tables for later phases — listed here so naming stays consistent when they land:

- `contracts`, `contract_relationships` (Phase 2 onchain)
- `claims`, `claim_evidence`, `reviews` (Phase 3 classification/review)
- `artifacts` (content-addressed SHA-256; Phase 1+)

At Phase 2+, when a DB actually enters, these will be proper tables. Until then, they are placeholders for schema design, not code.

## Review status taxonomy

Public status values (unchanged from original plan):

- `listed` — default; seed metadata only
- `evidence_collecting` — crawler workers have run (Phase 1)
- `machine_summarized` — classification worker has produced structured claims (Phase 3)
- `needs_human_review` — queued for reviewer
- `reviewed` — stamp-of-approval publication
- `monitored` — reviewed + active drift watch

At Phase 0 everything is `listed`.

## Public UX

### Landing / index

**Browse-all table by default.** Fully static.

- Default view: top 200 by TVL within the active tab
- Server search across **name, slug, category** (in-memory substring match with prefix-boost ranking over the registry index)
- Default sort: **TVL desc**
- Filters: review status, per-slice pizza filter chips (wired; all `unknown` at Phase 0)
- Flat sortable table

### Protocol detail page

**L2BEAT-identical dense table** layout, DefiBeat palette. Every field row shows value + `[defillama]` / `[curated]` tag + missingness state.

- Chain sub-nav: tabs across the top, one per chain (top-N by per-chain TVL + "more" dropdown, threshold ~7)
- Breadcrumb collapsed when family == instance
- `last_synced_at` from the snapshot: always visible
- Delisted slugs: route handler returns HTTP 410, body preserves last-known name + `delisted_at` + DeFiLlama link

### Chart / history

No in-app charts at MVP. TVL history → link out to DeFiLlama.

### Footer

Minimal: methodology link, GitHub issues/PRs link for corrections/takedowns, Defiscan credit.

## Rubric (Phase 3)

Adopt **Defiscan stages verbatim** at first public publication. Publish a methodology page that links to Defiscan's framework and notes we inherit their stage definitions unchanged.

## Immediate next steps (Phase 0)

1. Fork `l2beat/l2beat`; delete rollup-specific packages on Day 1; keep `@l2beat/discovery` + UI package in the pnpm workspace.
2. Scaffold Next.js App Router app + `packages/registry` + `packages/sync`.
3. Implement `pnpm sync`: pull DeFiLlama → normalize → write `data/defillama-snapshot.json`. Apply `parentProtocol` → `parent_slug`; derive `is_dead`; carry forward `first_seen_at` / `last_seen_at` / `delisted_at` (14-day rule).
4. Implement `packages/registry` merge layer (snapshot + overlays → in-memory index with per-field provenance).
5. Build `/protocol/{slug}` detail pages (dense table, chain tabs, breadcrumb, gray pizza, `noindex`, `generateStaticParams` over all live slugs). Delisted slugs → HTTP 410 via a `route.ts`.
6. Build landing page (11 category tabs, summary table, top-200-by-TVL default, server search, filters).
7. `/methodology` as static MDX.
8. Footer with GitHub issues/PRs link.
9. Commit an initial `data/defillama-snapshot.json` generated from a real fetch so deploys are reproducible from the repo alone.
10. Add an optional `workflow_dispatch` GitHub Action that runs `pnpm sync` and opens a PR with the resulting diff.

---

## Interview decisions (2026-04-21)

Addendum resolving spec ambiguities. Where this section conflicts with earlier prose, this section wins.

### Pizza chart (L2BEAT-style risk summary)

- **Axes**: Defiscan stage sub-dimensions. **7 slices**: chain/ownership, upgradeability, exit window, autonomy/accessibility, oracle dependency, external dependencies, **collateral risk**.
  - Collateral risk applies to **every category**, not just credit markets.
- **Placement**: landing browse-all table row (tiny), protocol detail page header (large), and `/methodology` legend.
- **Phase 0 empty state**: fully gray "unknown" pizza with em-dash tooltip.
- **Color semantics**: narrow **green / orange / red** risk palette for slices, with a muted gray for unknown. The cool-blue `#7bb4cc` accent is reserved for links and active state — never a slice fill.
- **CEX override**: if `category === "CEX"`, all five slices render red. Decided because custodial exchanges fail every transparency dimension by construction; applying the normal per-dimension rubric would misleadingly show unknowns as gray.
- **Stage encoding**: overall Defiscan stage = **worst slice**.
- **Multi-chain handling**: pizza reflects the **primary (highest-TVL) chain only**.
- **Interaction**: clicking a slice **anchors/scrolls to the matching section of the detail dense table**.
- **Landing filter**: per-slice filter chips on the browse-all table.
- **Accessibility**: deferred to Phase 3.

### Data & ingest decisions

- **Delist grace window**: protocols absent from DeFiLlama for **14 consecutive days** get `delisted_at` set by `pnpm sync`. Requires `last_seen_at` per protocol, carried forward across syncs.
- **Dead/alive signal**: derived from DeFiLlama's own deprecation signals (`deadUrl`, `deadFrom`, category hints). No independent inference at Phase 0. Stored as `is_dead` on each snapshot entry, recomputed every sync. Dead protocols are **hidden from the default landing list**. Direct URL still works. A "show inactive" toggle re-includes them.
- **Null TVL**: render as `unknown` with em-dash. `$0` TVL renders literally as `$0`. Null ≠ zero.
- **TVL format**: `$42.3M` with one decimal, K/M/B suffixes.
- **Category**: store raw from DeFiLlama, display raw, filter raw. Zero normalization.
- **Sync cadence**: daily manual `pnpm sync`. No cron.
- **Sync concurrency**: n/a — sync produces a file; git is the serialization point.
- **Sync failure**: the PR simply isn't opened; site keeps serving the last committed snapshot.
- **"Last updated" timestamp**: the snapshot's `generated_at` drives the detail-page "Updated" row. No separate material-change timestamp at Phase 0 (workers don't exist yet).
- **Time format**: always UTC, ISO-like: `2026-04-21 14:02 UTC`.
- **Rate limiting**: none at Phase 0. Vercel platform defaults only. Sync runs off-Vercel.

### URL & navigation

- **Family pages**: no separate `/family/{slug}` route. A parent's `/protocol/{parent_slug}` page gains a **children table**. If parent is not itself a slug, breadcrumb-only family signal.
- **Chain tabs with many deployments**: top-N tabs by per-chain TVL + "more" dropdown. Threshold ~7 visible tabs.
- **410 page content**: route handler returns 410; body preserves last-known protocol name, `delisted_at`, and a DeFiLlama link.
- **noindex flip**: per-protocol. A page becomes indexable once it reaches **`machine_summarized`** (Phase 3).

### Landing UX

- **Search**: substring match on name/slug/category with **prefix-boost ranking**, case-insensitive. In-memory over the registry index.
- **Review-status filter default**: all statuses shown.

### Detail page field rendering

- **Audit links**: row shows count + expandable list of URLs annotated with auditor domain. Default collapsed.
- **Hallmarks**: dedicated **chronological timeline row**, rendered as dated events with descriptions and `[defillama]` badge.
- **Contradictions UI (from Phase 1)**: row displays the winning value with a small warning glyph; **click expands** to show alternative values + sources + resolution reasoning.

### Deferred to their owning phase

- **Artifact storage**: Phase 1, likely just in-repo under `data/artifacts/`.
- **Database introduction**: Phase 2, onchain-only, SQLite re-evaluated vs Postgres.
- **Monitored-state drift rule**: Phase 2.
- **Reviewer identity/attribution**: Phase 3 (though git commit authorship is already a partial answer).
- **Pizza a11y**: Phase 3.

---

## Landing page: category tabs + Summary table

Modeled on L2BEAT's landing, adapted to DeFi categories.

### Category tabs

- **Tab set (11 tabs)**: `All | Lending | DEX | Yield | Derivatives | Bridges | Liquid Staking | CDP | Stablecoins | RWA | Others`
- **Default tab**: `All`.
- **Tab scope**: each tab contains all protocols in that category across every chain.
- **"Not Reviewed" tab**: deferred. At Phase 0, 100% of protocols are `listed`.
- **Multi-category protocols**: bucketed by the **primary DeFiLlama category only**.
- **Category mapping**: a static TypeScript map (`category-map.ts`) routes each DeFiLlama category string to one of the 11 buckets. Unmapped categories fall into `Others` and are **logged at build time** so the reviewer can add them.
  - Seed mappings (non-exhaustive): `Lending`, `Liquid Lending` → Lending; `CDP` → CDP; `Dexes`, `DEX Aggregator` → DEX; `Yield`, `Yield Aggregator` → Yield; `Derivatives`, `Options`, `Perps` → Derivatives; `Cross Chain`, `Bridge` → Bridges; `Liquid Staking`, `Liquid Restaking` → Liquid Staking; stablecoin-issuer categories → Stablecoins; `RWA`, `RWA Lending` → RWA.
- **Tab counts**: computed at build time from the merged registry. Counts **exclude delisted and dead** protocols.

### Summary table columns

| # | Name | Chain | Risks | Stage | Type | TVL |
|---|------|-------|-------|-------|------|-----|

- **`#`** — TVL rank within current tab and sort.
- **`Name`** — links to `/protocol/{slug}`.
- **`Chain`** — primary chain (highest TVL) + `+N` chip.
- **`Risks`** — stage-colored pizza icon; hover/click expands. Phase 0: all gray.
- **`Stage`** — Defiscan stage badge; Phase 0: all `—`.
- **`Type`** — raw DeFiLlama category.
- **`TVL`** — `$42.3M` format.

### Sorting and filtering

- **Default sort**: TVL desc.
- **Sortable columns**: `#`, `Name`, `Chain`, `Stage`, `Type`, `TVL`.
- **Risks column sort**: by Defiscan stage (worst-slice-wins), then count of red slices as tiebreaker.
- **In-tab filters**: review-status + per-slice pizza chips.
- **Delisted + dead**: excluded by default. "Show inactive" re-includes dead; delisted stays 410.

### Row count default

Top 200 by TVL per tab. "Show all" expands.

---

## Deployment inputs (2026-04-22 pivot)

**Pivot note (2026-04-22)**: the earlier DB-based plan (Neon Postgres, `/api/sync` Vercel route with shared secret, pgboss queue, per-row diff detection) is **superseded** by this git-native architecture. Skip any spec reading that contradicts this section.

Current Phase 0 inputs:

- **GitHub repo**: `guil-lambert/defibeat`
- **User-Agent contact URL**: `https://github.com/guil-lambert/defibeat` — sent as `User-Agent: DefiBeat (+https://github.com/guil-lambert/defibeat)` from `pnpm sync`.
- **Footer corrections/takedowns link**: `https://github.com/guil-lambert/defibeat/issues` (and the `data/overlays/` directory for PRs).
- **Vercel project slug**: `defibeat`.
- **Node**: 22 LTS, pinned via `.nvmrc` + `engines`.
- **pnpm**: 9 (latest), pinned via `packageManager` for Corepack.

**No database, no `DATABASE_URL`, no `SYNC_SECRET`, no Neon branch, no `/api/sync` route at Phase 0.**

---

## Interview decisions (2026-04-22, round 2)

Addendum resolving further Phase 0 ambiguities. Where this section conflicts with earlier prose, **this section wins**.

### Overlays

- **Format**: **JSON**, not TypeScript. Files at `data/overlays/<slug>.json` (flat layout, no sharding). Overlay authors can edit via GitHub web UI without fearing TS syntax; overlays are data, not code.
- **Validation**: **Zod schema** in `packages/registry` (schema is source of truth; TS `Overlay` type derived via `z.infer`). Any overlay that fails parse or validation **fails the build**. No silent skip on malformed overlays.
- **Empty vs unset semantics**: **explicit `null` sentinel**. Three states per field:
  - key **absent** → defer to snapshot
  - key = `null` → curated "known to have no value" (overrides snapshot with null)
  - key = value → override
  Empty string / empty array is not a magic sentinel; it means literally "" / [].
- **Identity-with-snapshot**: when an overlay value is byte-equal to the snapshot value, the field still renders `[curated]`. The sync script emits a **build-time warning** listing overlay fields that exactly duplicate the snapshot, so the reviewer can trim noise.
- **Orphan overlays**: if an overlay's slug is not present in the current snapshot, **warn at build and skip**. Do not fail the build; do not resurrect the protocol from the overlay.
- **Takedown requests**: **no takedown mechanism at Phase 0.** Policy is: delisting happens upstream at DeFiLlama. Revisit at Phase 3 when reviewer workflow formalizes. No `hidden` field in the overlay schema.

### Slug identity

- **Slug is identity forever.** If DeFiLlama renames a slug, old becomes delisted under the 14-day rule and new appears as first-seen. No DeFiLlama numeric `id` tracking, no alias map at Phase 0.

### Parent protocol resolution

- **Strict slug-only linkage.** DeFiLlama's `parentProtocol` is only treated as a link when it matches an existing slug in the snapshot. String-label parents are ignored at Phase 0 (no slugification, no alias file). Breadcrumb collapses as usual.

### Categories

- **Null / empty category** → bucket to **`Others`** tab (same bucket as unmapped categories). Logged at build.

### Sync behavior

- **Trust DeFiLlama**: no sanity check on protocol-count drops. If upstream returns 500 protocols where it used to return 6000, we write the snapshot. The 14-day grace window on `delisted_at` absorbs transient outages.
- **Determinism controls** (Phase 0): **pinned Node 22 LTS + pnpm 9** via `.nvmrc`, `engines`, and `packageManager`. Sorted-key JSON output and fixed `generated_at` sourcing are nice-to-have but not required for correctness at Phase 0.
- **Sync PR body**: the sync script writes a markdown summary into the PR body (also emitted to stdout). Summary contains:
  - counts: new protocols, newly `delisted_at`, `is_dead` toggles
  - **TVL movers**: every protocol whose TVL changed **≥±50% day-over-day** (one list). No separate "top-N absolute" list.
- **Raw JSON diff** remains viewable on the PR for reviewers who want it; the summary is the primary review surface.

### Null TVL

- **Landing sort**: null-TVL protocols sort **after** all ranked entries in every tab. In practice they never appear in the top-200 default view.
- **Rendering**: `unknown` with em-dash (unchanged from round 1). `$0` renders literally.

### Pizza chart at Phase 0

- **Primary-chain flip policy**: N/A at Phase 0 (all pizzas gray). Decide at Phase 3 alongside stage attachment.

### Detail page rendering

- **Show every row, all unknown.** No hiding of Phase-2 or Phase-3-dependent rows at Phase 0. The wall of em-dashes is intentional — it signals the roadmap and enforces transparency about missingness.
- **Timestamp scope**: single "Updated" row driven by snapshot `generated_at`. Curated-field edit times are implicit in `git blame` on the overlay file; no per-field UI timestamp.

### Dev ergonomics

- **Full snapshot in dev**, same file as prod. No subset dev snapshot, no env-flag filter. Prevents dev/prod divergence bugs; slower HMR accepted.

### Search

- **Case-insensitive substring match on name / slug / category**, with prefix-boost ranking. No punctuation normalization, no diacritic folding, no fuzzy/Levenshtein at Phase 0. Power-user audience assumed.

### Bot / crawler policy

- **`noindex` meta tag only** on `/protocol/*` pages at Phase 0. No `robots.txt` Disallow, no Vercel bot mitigation. `noindex` flip to indexable happens per-protocol at `machine_summarized` (Phase 3), unchanged from round 1.

### Build scaling

- **Accept any build time** at Phase 0. Full SSG over all live slugs via `generateStaticParams` regardless of Vercel build cost. Revisit only if the 45-minute platform limit is approached.

### Family / children table

- **Columns match the landing Summary table**: `# | Name | Chain | Risks | Stage | Type | TVL`, sorted TVL desc. Consistent UX with the browse-all table.

### `/methodology` MDX

- **Minimal content + pizza legend** at Phase 0:
  - "Registry only, no ratings" framing
  - DeFiLlama seed + curated overlays explanation
  - **7-slice pizza legend** (all gray at Phase 0) explaining each slice
  - Note that Defiscan stages arrive in Phase 3 with links out to Defiscan's framework

### Repo pruning from l2beat fork

- **Single Day-1 nuke commit** deleting all rollup-specific packages. One big diff, legible `git log`, no per-package archaeology. `@l2beat/discovery` and the UI package retained, as per spec.
