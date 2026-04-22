# DefiBeat — DeFi Transparency Registry MVP Spec

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
- `@l2beat/discovery` onchain worker toolchain
- schema conventions
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

MVP has **no submission queue, no reviewer web UI, no contact form, no auth**. All writes go through the solo reviewer's terminal / GitHub Actions. Corrections and takedowns route to **public GitHub issues** on the project repo (linked from site footer). Submission UX, reviewer auth, and community queue are all post-MVP decisions.

## Target audience

Primary: **DeFi power users and researchers**. Assume familiarity with proxies, multisigs, timelocks, role-based admin. Lean into raw evidence density over marketing polish.

## Operating assumption

Solo builder, solo reviewer. Throughput is ~5–10 reviewed protocols per week, so the pipeline must be machine-first: deterministic workers do the grunt work, human review only kicks in at publication.

## MVP scope

### Source of truth for the master list

Pull `https://api.llama.fi/protocols` **manually / on-demand** (see Refresh cadence).

Provides: protocol name, slug, category, chains, TVL, website, audit count, audit links, twitter, hallmarks, parent protocol relationships, other metadata.

**Upstream etiquette**: send a `User-Agent` identifying DefiBeat with a contact URL. No additional self-throttling at MVP — manual triggering keeps frequency naturally low.

### Ingest policy

**Ingest everything, enrich selectively.** Every DeFiLlama entry becomes a row. **No junk filtering at MVP** — full mirror of DeFiLlama's list view. Crawlers, onchain workers, and LLM steps only run on protocols that meet a quality bar.

**No numeric TVL threshold at Phase 0.** The quality-bar threshold (TVL cutoff, audit-link requirement, dead/alive) is deferred until Phase 1, when enrichment workers ship and it actually gates work.

### Chain scope for ingest

**All chains ingested, display-only.** Non-EVM protocols (Solana, Cosmos, Bitcoin L2s, etc.) are listed with DeFiLlama metadata. Phase 2 onchain analysis is Ethereum-mainnet only. Non-EVM onchain rows render as plain `unknown` — same treatment as every other unenriched row; no special "out of scope" UI at Phase 0.

### Delisting

Mirror DeFiLlama: if DeFiLlama delists, we delist. **Soft-delete**: row stays in DB, a `delisted_at` timestamp is set, and `/protocol/{slug}` returns **HTTP 410 Gone**. No independent delisting policy at MVP.

### What ships in the MVP

For each protocol, display:
- name
- family / parent protocol
- chains
- category
- TVL
- website
- audit count
- audit links
- twitter
- hallmarks
- last updated from DeFiLlama (timestamp **always visible** on detail pages; users judge staleness themselves)
- **gray "unknown" pizza chart** in the detail-page header and inline on landing-table rows (see §"Pizza chart" under Interview decisions; fully gray at Phase 0 since no stages exist yet)

Also display internal status flags. At Phase 0 **all enrichment rows render as `unknown`** (undifferentiated between "not yet checked" and "truly missing" — no phase badges). Flags:
- github missing
- docs missing
- canonical contracts unknown
- admin setup unknown
- machine summary not run
- human review pending

### URL structure

`/protocol/{slug}` — one page per DeFiLlama slug. Chain deployments within the page use **top-tabs across the protocol header, one per chain**. Matches seed identity; simpler SEO; minimizes URL churn when normalization heuristics change.

**Breadcrumb**: collapsed when `family == instance` (the common case at Phase 0). Show the full Family / Instance / Chain breadcrumb only when normalization actually produced multi-level structure.

### Phase 0 "done" definition

**List + detail pages live for all DeFiLlama protocols**, showing raw metadata + `unknown` missingness rows. No enrichment workers yet. That's the demoable moment.

### What is intentionally out of scope for MVP

- final safety/risk scores
- automated multisig classification
- final admin/control-surface judgment
- audit quality scoring
- contract-level onchain privilege analysis
- public API (website only)
- authentication (fully public read; no login)
- TVL sparklines / historical charts (link out to DeFiLlama instead)
- analytics / user tracking (none at MVP)
- community submissions or reviewer UI
- contact form (GitHub issues link only)
- crawl-ethics policy (deferred; crawlers do not run at MVP)
- R2/S3 artifact storage (revisit at Phase 1 planning)
- queue-transparency landing panel (dropped — empty-set messaging not worth the UI)

## Entity model

Normalize DeFiLlama entries, but **physically** into two tables at Phase 0:

- `protocols` — one row per DeFiLlama slug, with a self-referential `parent_slug` FK expressing the family relationship
- `chain_deployments` — one row per (protocol, chain) pair

The family / instance / chain *conceptual* three-layer model still stands; it's just collapsed into a single `protocols` table until multi-instance cases demand the split. Migration to `protocol_families` + `protocol_instances` is a follow-on when real data shows multiple instances under one family.

### Normalization approach

**Trust `parentProtocol` only.** If DeFiLlama sets `parentProtocol`, `parent_slug` is populated; otherwise the slug is its own family. **No slug-suffix parsing at MVP** — zero false merges, low precision accepted. Corrections come via the post-MVP review workflow.

## History model

**Upsert with per-row diff detection** (chosen over full wipe+replace because downstream Phase 1+ workers require a signal that rows changed).

- Each sync upserts every DeFiLlama row
- On write, compare the incoming row to the stored row
- If any **material field** changed (see "Refresh cadence"), bump `last_updated` and enqueue downstream work (once workers exist)
- Non-material changes (TVL, description, logo URL) silently update without changing `last_updated` or firing triggers

No temporal tables, no event log, no raw-payload snapshots at MVP. A proper mutation trail (structured diffs on material fields, archived raw payloads) is a **post-MVP** problem.

## Chain scope for onchain work

**Ethereum-only for Phase 2 onchain work.** L2 expansion is a follow-up.

RPC strategy when onchain work lands: **Alchemy/Infura per chain** (single premium provider, not multi-provider rotation, at MVP).

## Provenance model

Every field carries provenance.

### Provenance classes
- `defillama`
- `crawler`
- `onchain`
- `llm_inference`
- `community_submission`
- `human_review`

### Trust stance per source

- **DeFiLlama**: trusted as the seed. Canonical for seed metadata.
- **Crawler (site/docs)**: **always low-confidence**. Ingested but tagged low-trust; never alone sets a high-confidence field.
- **Onchain**: highest confidence for admin/upgradeability/role facts. **Onchain always wins conflicts**.
- **LLM inference**: must output structured JSON with a citation (URL + `artifact_hash`). Ingestion performs **hash-match + quoted-substring check** — the artifact_hash must exist in the artifact store, *and* the quoted text in the claim must actually appear in the archived artifact. Fabricated quotes are rejected at ingest.
- **Community submission**: post-MVP. Accepted into a review queue; never published without human approval.
- **Human review**: required before any stamp-of-approval publication.

### Contradictions

**Public from the moment a second source exists.** Phase 0 has only DeFiLlama (single source → no contradictions). From **Phase 1 onward**, any cross-source mismatch (crawler vs DeFiLlama, onchain vs text, etc.) is surfaced on the public profile. No waiting for human vetting. "Onchain wins" remains the resolution rule; the contradiction itself is still displayed.

## Artifact storage

**Deferred — revisit at Phase 1 planning.** Content hash function: **SHA-256**. Invariant: a row in `artifacts` exists only once the backing blob is stored. At Phase 0 the table exists but is empty.

Implications:
- LLM / classification pipeline is strictly Phase 3; citation enforcement (hash + substring) depends on artifact storage existing.
- Phase 1 crawlers will require a backing-store decision (R2/S3 vs Postgres bytea) before launch.

## Architecture

Three planes:

1. seed discovery
2. evidence extraction
3. classification / review

Narrow workers around a shared database. No monolithic crawler.

### Stack

- **Frontend + API**: TypeScript + Next.js (hosted on Vercel)
- **Rendering**: **ISR with hourly revalidation**. Pages cached on Vercel edge; first visitor after TTL triggers background rebuild of just that page. Up-to-1hr lag after a sync is accepted — no on-demand revalidation at Phase 0.
- **Database**: Postgres (Neon or Supabase). Treated as derived state (see Key Principles #11).
- **Migrations**: raw SQL files + a tiny runner. No ORM-driven migrations. Schema change = rebuild from scratch by default; `ALTER TABLE` migrations are the exception, not the rule. A `pnpm rebuild-db` script must exist from Phase 1: drop → apply `schema.sql` → load curated files (empty at Phase 0) → run DeFiLlama sync.
- **Object storage**: deferred (Phase 1 decision)
- **Queue**: Postgres-backed (pgboss / river-style) — no separate Redis at MVP
- **Workers**: TypeScript services
- **Seed trigger**: **GitHub Actions `workflow_dispatch`** calls a protected Vercel API route (`/api/sync` with shared secret). Reviewer kicks off manually. GH Actions provides the audit trail; Vercel route does the actual DB write (must stay under 300s — fine for ~6k upserts). Auth model is a **single long-lived shared secret** stored in GH Actions + Vercel env; rotated manually.
- **Admin/control graph queries (Phase 2+)**: Postgres **recursive CTEs** against `contracts` + `contract_relationships`. Add materialized views or a graph DB only if query shape demands it.
- **Observability**: **GitHub Actions workflow logs only** at Phase 0. No Sentry, no Vercel analytics, no user tracking. Sync is the only moving piece; workflow logs suffice.

## Visual design

**Dark-only, custom DefiBeat palette** at Phase 0. No light theme shipped.

- Base: cool slate (neutral dark)
- Accent (single color): **cyan (~#22d3ee)** — used for active states, review-status highlights, and reviewer-stamped rows once they exist
- Dense table component inherited from L2BEAT near-verbatim; palette swapped

### Provenance badge style

**Text tag in brackets**, inline after the value. Example:

```
TVL      $42M       [defillama]
Github   unknown    —
Admin    unknown    —
```

Minimal visual weight preserves table density. A rendered em-dash marks "no provenance" for `unknown` rows.

## Phase plan

### Phase 0: read-only MVP
- ingest DeFiLlama `/protocols` (manual trigger)
- upsert+diff into `protocols` + `chain_deployments`, using **`parentProtocol` only** for family grouping
- create protocol detail pages for **all** DeFiLlama protocols at `/protocol/{slug}`
- surface raw DeFiLlama metadata with `[defillama]` badges
- render enrichment rows as `unknown` with em-dash provenance
- render a fully gray 7-slice pizza (em-dash tooltip) in the detail-page header and inline on landing-table rows
- review status = `listed` for everything
- L2BEAT-style dense table layout on detail pages, dark slate + cyan accent
- **landing page = browse-all table by default** (server search + top-200-by-TVL default view, flat and sortable, with TVL-desc default sort and a review-status filter)
- reviewed grid appears only once it has entries (hidden at launch)
- `/methodology` page (static MDX in the Next.js repo) describing Defiscan rubric + "not yet rating" disclaimer
- footer link to GitHub issues for corrections/takedowns
- **silent last-good failure mode**: if sync fails, site keeps serving prior data; reviewer triages via GH Actions UI (no stale banner at MVP)
- **SEO**: `noindex` on all `/protocol/{slug}` pages at Phase 0. Flip to indexable once real reviewed content lands, to avoid being cached as "just a DeFiLlama mirror." `/methodology` and the landing page are indexable.

### Phase 1: evidence enrichment
Add crawler-based enrichment workers, gated to protocols meeting the quality bar (threshold defined here):
- site worker
- docs worker
- github worker
- audit worker

Adds discovered links and archived artifacts. No final ratings. All crawler data tagged low-confidence. **R2/S3 decision happens at the start of this phase.** Public contradictions UI activates here (crawler vs DeFiLlama).

Crawl-ethics policy (robots.txt, UA, rate-limit) decided at Phase 1 kickoff.

### Phase 2: onchain worker
- Integrate `@l2beat/discovery`, ripping out rollup-specific code
- **Config strategy**: keep `@l2beat/discovery`'s TS-per-project config loader unchanged; instead, add a **pre-run codegen step inside the discovery worker** that reads Postgres → writes TS config files to ephemeral tmpfs → invokes discovery normally. Keeps upstream merges cheap, avoids checked-in generated files, no fork of discovery's core.
- Ethereum mainnet only
- canonical contracts, proxy detection, implementation/admin resolution, role extraction, Safe detection, timelock detection
- admin/control graph construction (queried via Postgres recursive CTEs)
- Canonical contract discovery uses DeFiLlama's own TVL adapter source code as primary signal. **On adapter parse failure: skip — leave `canonical_contracts` null** (pure determinism; no LLM fallback, no scraping fallback).

This is the most defensible part of the system and the core moat.

### Phase 3: classification + review
- machine-generated structured claims with citations (enforced hash + substring)
- contradiction flags (already public from Phase 1; Phase 3 adds onchain-source contradictions)
- provisional machine summary
- human review queue (first community-submission infra lands here)
- reviewer web UI + auth (first auth surface in the product)
- published reviewed assessments using **Defiscan stages** with disclaimers
- LLM provider decision (Claude vs alternatives) deferred to this phase

## Refresh cadence

**Manual / on-demand at MVP.** The seed worker is triggered by GitHub Actions `workflow_dispatch`. No scheduled cron at MVP (freshness in days is acceptable for a registry).

When the seed worker detects a **material change** for a protocol, it will enqueue downstream work (once workers exist). Material-change triggers:

- new slug
- changed URL
- changed chains
- changed github
- changed audit links
- changed hallmarks
- changed parent relationships
- changed dead/alive status
- changed category
- changed twitter

Explicitly **not** material: TVL, description text, logo URL (too noisy / too low signal).

No tiered hot/warm/cold cadence. No live onchain subscriptions at MVP.

## Worker design

### Seed worker
Manually triggered. Pulls DeFiLlama protocol list, upserts into `protocols` + `chain_deployments` with per-row diff, detects material changes, and (once downstream workers exist) enqueues work only on change.

### Site worker (Phase 1)
Visits official website + nearby pages. Extracts: docs URLs, github URLs, audit/security pages, governance pages, app URLs, explorer links. Depth-limited, domain-allowlisted. All output tagged low-confidence.

### Docs worker (Phase 1)
Classifies pages: architecture, contract addresses, governance/admin, security, incidents/postmortems, upgradeability.

### GitHub worker (Phase 1)
Normalizes github handles/URLs. Enriches: org URL, repo list, likely core repos, docs/frontend/contracts repo, license, recent activity, repo structure signals. LLM repo review later, only after deterministic discovery.

### Audit worker (Phase 1)
Ingests audit artifacts from official docs/site, audit links, github audits folder, known auditor pages. Normalizes auditor, date, scope, report URL, commit hash, remediation info. MVP: audit count is display-only metadata, not a scored signal.

### Onchain worker (Phase 2)
Powered by forked `@l2beat/discovery` with a pre-run DB→TS codegen step (ephemeral, tmpfs). Canonical contract discovery uses DeFiLlama's TVL adapter source as primary signal; **skip on parse failure** (null, not inferred). Produces: canonical addresses, proxy/admin relationships, upgradeability pattern, pause roles, fee/admin roles, Safe ownership, timelock chain, admin/control graph.

### Classification worker (Phase 3)
Consumes evidence bundles, outputs structured claims (not freeform opinions), each with citations enforced by hash + substring match.

### Review worker (Phase 3)
Human-in-the-loop publishing via reviewer web UI. Inspect evidence, approve/reject/edit claims, publish reviewed assessments, diff changes over time.

## Community / submissions

**Deferred until Phase 3.** No submission surface at MVP. Contact channel at MVP is a footer link to **public GitHub issues**. The structured-JSON-claim-bundle submission model described in earlier drafts is still the intended end state, but the UX (JSON upload vs guided form vs GitHub-PR-against-data-repo) is decided at Phase 3 kickoff.

## Data model

**Full schema defined upfront at Phase 0**, even tables not yet populated (avoids painful mid-project migrations). Minimum tables:

- `protocols` (collapsed family + instance at Phase 0; self-referential `parent_slug` FK)
- `chain_deployments`
- `protocol_metadata`
- `urls`
- `crawl_jobs`
- `artifacts` (content-addressed SHA-256; backing store TBD at Phase 1; row exists only with blob)
- `repositories`
- `docs_pages`
- `audit_reports`
- `contracts` (empty until Phase 2)
- `contract_relationships` (empty until Phase 2)
- `claims` (empty until Phase 3)
- `claim_evidence` (empty until Phase 3)
- `reviews` (empty until Phase 3)

Future split of `protocols` → `protocol_families` + `protocol_instances` is an expected migration once multi-instance cases surface.

Cross-cutting columns:
- `source_type`
- `source_url`
- `retrieved_at`
- `artifact_hash`
- `status`
- `confidence`
- `delisted_at` (on `protocols`; non-null means 410 Gone)

**No `parser_version` column.** Parsers are frozen; when they change, reprocess by wiping + re-running. Keeps schema simple.

## Review status taxonomy

Public status values:
- `listed` — default; seed metadata only
- `evidence_collecting` — crawler workers have run
- `machine_summarized` — classification worker has produced structured claims
- `needs_human_review` — queued for reviewer
- `reviewed` — stamp-of-approval publication
- `monitored` — **reviewed + active drift watch**: onchain worker re-runs on this protocol and flags admin/control graph changes from the reviewed baseline

Gives users a clear sense of how complete each profile is.

## Public UX

### Landing / index

**Browse-all table by default.** No queue-transparency panel, no empty reviewed grid at launch.

- Default view: top 200 by TVL, server-rendered
- Server search across **name, slug, category** (substring ILIKE — sufficient at 6k rows; full-text deferred)
- Default sort: **TVL desc**
- Filters: **review status**
- Flat sortable table (no row grouping by category or status)
- Once any protocol reaches `reviewed`, a small reviewed grid surfaces above the browse-all table

### Protocol detail page

**L2BEAT-identical dense table** layout, DefiBeat palette (dark slate + cyan accent). Every field row shows value + `[provenance]` tag + missingness state. Power-user friendly; no marketing gloss.

- Chain sub-nav: tabs across the top, one per chain
- Breadcrumb: collapsed when family == instance
- `last_updated_from_defillama` timestamp: always visible
- Delisted protocols: route returns HTTP 410 Gone

Target layout:

```
Panoptic / Base
------------------------------------
TVL         $42M          [defillama]
Website     panoptic.xyz  [defillama]
Github      unknown       —
Audits      3             [defillama]
Admin       unknown       —
Review      listed
Updated     2026-04-21 14:02 UTC
```

At Phase 0, all non-DeFiLlama rows read `unknown` with an em-dash provenance.

### Chart / history

No in-app charts at MVP. TVL history is a **link out to DeFiLlama**.

### Footer

Minimal: methodology link, GitHub issues link for corrections/takedowns, Defiscan credit.

## Rubric (Phase 3)

Adopt **Defiscan stages verbatim** at first public publication. Publish a methodology page that links to Defiscan's framework and notes we inherit their stage definitions unchanged. As review volume grows, document any deviations as a public methodology delta rather than silently drifting.

## Key principles

1. **DeFiLlama is the registry seed, not the final truth**
2. **Stored artifacts and deterministic chain reads come before LLM analysis**
3. **Missingness should be visible** (even if undifferentiated at Phase 0)
4. **All claims must have provenance; LLM claims must carry citations enforced by hash + substring match**
5. **Onchain beats text in any conflict — but contradictions are shown publicly, not hidden**
6. **Human review is required before stamp-of-approval publication**
7. **Do not collapse everything into one score too early**
8. **The moat is the admin/control-surface graph, not just scraped metadata**
9. **Machine-first pipeline — the solo reviewer is the scarce resource**
10. **Read-only MVP — no writes from the internet until Phase 3**
11. **The database is derived state, not a source of truth** — any instance must be rebuildable from scratch using only git (curated data, schema.sql) + a live DeFiLlama fetch. Many independent deployments should be able to operate without depending on a centralized live DB. Default stance on schema change: rebuild, don't migrate.

## Immediate next steps (Phase 0)

1. Fork `l2beat/l2beat`; delete rollup-specific packages on Day 1; keep `@l2beat/discovery` + UI package in pnpm workspace
2. Define the full Postgres schema upfront (all tables listed above, with provenance columns, `delisted_at`, no `parser_version`; `protocols` + `chain_deployments` as the active two-table shape)
3. Implement manual DeFiLlama sync worker (Postgres-backed queue) as a protected Vercel API route with shared-secret auth and `User-Agent: DefiBeat (+contact-url)`
4. Wire GitHub Actions `workflow_dispatch` workflow that calls the sync route
5. Implement **upsert+diff** seed worker that bumps `last_updated` and (stub) enqueues on material-field change
6. Normalize family vs slug using `parentProtocol` only (populated into `parent_slug`)
7. Build Next.js protocol detail pages at `/protocol/{slug}` from raw DeFiLlama metadata, using the ported L2BEAT dense table component, dark slate + cyan palette, chain tabs, collapsed breadcrumb, ISR hourly revalidation, `noindex` meta, 410 Gone for delisted
8. Landing page: browse-all table (top-200-by-TVL default, server search, TVL-desc sort, review-status filter)
9. `/methodology` page (static MDX in repo) explaining Defiscan rubric + "not yet rating" disclaimer
10. Footer with GitHub issues link for corrections/takedowns
11. Stub queues for site/github/docs/audit enrichment (Phase 1)
12. Stub the onchain worker interface; document the Phase 2 **pre-run DB→TS codegen** approach for discovery configs

---

## Interview decisions (2026-04-21)

Addendum resolving spec ambiguities. Where this section conflicts with earlier prose, this section wins.

### Pizza chart (L2BEAT-style risk summary)

- **Axes**: Defiscan stage sub-dimensions. **7 slices**: chain/ownership, upgradeability, exit window, autonomy/accessibility, oracle dependency, external dependencies, **collateral risk**.
  - Collateral risk applies to **every category**, not just credit markets. It encodes how the protocol handles collateral-type failure (bridged-asset insolvency, depegged stable, inflated governance token used as collateral, oracle-manipulated asset, etc.). A DEX, bridge, or yield aggregator all have collateral-risk exposure and get a real slice value.
- **Placement**: landing browse-all table row (tiny), protocol detail page header (large), and `/methodology` legend.
- **Phase 0 empty state**: fully gray "unknown" pizza with em-dash tooltip. Matches the em-dash provenance convention.
- **Color semantics**: amend the single-cyan-accent palette rule specifically for pizzas — use a **narrow risk palette (green/yellow/red)** for slices. Cyan remains the system accent everywhere else.
- **Stage encoding**: overall Defiscan stage = **worst slice across all seven dimensions** (Defiscan-faithful).
- **Multi-chain handling**: pizza reflects the **primary (highest-TVL) chain only**. Other chains visible via chain tabs; their dimensions are not aggregated into the header pizza.
- **Interaction**: clicking a slice **anchors/scrolls to the matching section of the detail dense table** (pizza is summary, table is truth).
- **Landing filter**: per-slice filter chips on the browse-all table (e.g. "upgrade admin = red"). Adds filter query surface over the slice-state encoding.
- **Accessibility**: deferred to Phase 3. Pizzas ship as SVG with default browser behavior at Phase 0.

### Data & ingest decisions

- **Delist grace window**: protocols absent from DeFiLlama for **14 consecutive days** are auto-marked delisted (410). Requires tracking `last_seen_in_defillama` per protocol independent of `last_updated`.
- **Dead/alive signal**: derived from DeFiLlama's own deprecation signals (`deadUrl`, `deadFrom`, category hints where present). No independent inference at Phase 0 (no TVL-history rule). Store as a derived `is_dead` boolean on `protocols`, recomputed on each sync. Dead protocols are **hidden from the default landing list** (excluded from top-200-by-TVL). Direct `/protocol/{slug}` URL still works. A "show inactive" toggle re-includes them.
- **Null TVL**: render as `unknown` with em-dash (consistent with other missing fields). `$0` TVL renders literally as `$0`. Null ≠ zero.
- **TVL format**: `$42.3M` with one decimal, K/M/B suffixes. Matches L2BEAT/DeFiLlama convention.
- **Category**: store raw from DeFiLlama, display raw, filter raw. Zero normalization.
- **Sync cadence**: daily manual `workflow_dispatch`. Spec stays "manual at MVP" — no cron — but the operating expectation is a once-per-day dispatch.
- **Sync concurrency**: no concurrency control. Manual trigger; accept the race.
- **Sync failure**: fully silent last-good (spec unchanged). No stale banner, no auto-issue, no threshold escalation.
- **"Last updated" timestamp**: two distinct columns on `protocols`:
  - `last_updated` — bumped only on material-field change (drives downstream worker triggers)
  - `last_synced_at` — bumped on every successful sync run (drives the always-visible "Updated" row on detail pages)
  The detail-page "Updated" row displays `last_synced_at`.
- **Time format**: always UTC, ISO-like: `2026-04-21 14:02 UTC`.
- **Rate limiting**: none at Phase 0. Vercel platform defaults only. Sync route protected by shared secret.

### URL & navigation

- **Family pages**: no separate `/family/{slug}` route. If a `parentProtocol` entry exists as its own DeFiLlama slug, its `/protocol/{parent_slug}` page gains a **children table** listing instances. If parent is not itself a slug, breadcrumb-only family signal.
- **Chain tabs with many deployments**: top-N tabs ordered by per-chain TVL desc + a "more" dropdown for the long tail. Threshold ~7 visible tabs.
- **410 page content**: stubbed page preserves the last-known protocol name, `delisted_at` date, and a link to the DeFiLlama page. HTTP status remains 410.
- **noindex flip**: per-protocol. A page becomes indexable once it reaches **`machine_summarized`** (Phase 3). Earlier than full human review, but past the "just a DeFiLlama mirror" bar.

### Landing UX

- **Search**: substring ILIKE on name/slug/category with **prefix-boost ranking** (prefix matches rank above mid-string matches). Full-text still deferred.
- **Review-status filter default**: all statuses shown. No auto-switching once reviewed content exists (reviewed grid above the table already privileges reviewed protocols visually).

### Detail page field rendering

- **Audit links**: row shows count + expandable list of URLs annotated with auditor domain (e.g. `spearbit.com`, `trailofbits.com`). Default collapsed; click to expand.
- **Hallmarks**: dedicated **chronological timeline row** on the detail page, rendered as dated events with descriptions and `[defillama]` badge. Not flattened into a single metadata row.
- **Contradictions UI (from Phase 1)**: row displays the winning value with a small warning glyph; **click expands** to show alternative values, their sources, and resolution reasoning inline. No top-of-page banner at Phase 1.

### Deferred to their owning phase

- **Artifact storage (R2/S3 vs bytea)**: decided at Phase 1 kickoff, as originally speced.
- **Monitored-state drift rule**: designed at Phase 2 kickoff when onchain data exists.
- **Reviewer identity/attribution**: designed at Phase 3 when the reviewer UI lands.
- **Pizza a11y**: Phase 3.

### Small palette amendment

Single-cyan-accent rule **still holds everywhere except pizza slices**, which get a narrow green/yellow/red risk palette. Update visual-design docs accordingly when the component lands.

---

## Landing page: category tabs + Summary table

Modeled on L2BEAT's landing (e.g. `Rollups (25) | Validiums & Optimiums (5) | Others (95) | Not Reviewed (20)`), adapted to DeFi categories.

### Category tabs

- **Tab set (11 tabs)**: `All | Lending | DEX | Yield | Derivatives | Bridges | Liquid Staking | CDP | Stablecoins | RWA | Others`
- **Default tab**: `All`. Matches the spec's "browse-all by default" principle.
- **Tab scope**: each tab contains **all protocols in that category across every chain/L2**. Example: the `Lending` tab lists Aave (Ethereum + L2s), Jupiter Lend (Solana), HyperLend (HyperEVM), etc. side-by-side. Chains are a column, not a tab dimension.
- **"Not Reviewed" tab**: **deferred**. At Phase 0, 100% of protocols are `listed`, so a "Not Reviewed" tab is either empty or everything. Add the tab only once reviewed content exists; until then, review-status is a filter inside each category tab.
- **Multi-category protocols**: bucketed by the **primary DeFiLlama category only**. Each protocol appears in exactly one category tab (plus `All`).
- **Category mapping**: a static TypeScript map (`category-map.ts`) routes each DeFiLlama category string to one of the 11 buckets. Unmapped categories fall into `Others` and are **logged** so the reviewer can add them to the map. No runtime-editable table, no LLM classification.
  - Seed mappings (non-exhaustive): `Lending`, `Liquid Lending` → Lending; `CDP` → CDP; `Dexes`, `DEX Aggregator` → DEX; `Yield`, `Yield Aggregator` → Yield; `Derivatives`, `Options`, `Perps` → Derivatives; `Cross Chain`, `Bridge` → Bridges; `Liquid Staking`, `Liquid Restaking` → Liquid Staking; stablecoin-issuer categories → Stablecoins; `RWA`, `RWA Lending` → RWA.
- **Tab counts**: computed live from the DB on landing render, cached per ISR window (hourly revalidation). Counts **exclude delisted and dead** protocols — numbers match what's actually visible in the table below.

### Summary table columns

Column order (left → right):

| # | Name | Chain | Risks | Stage | Type | TVL |
|---|------|-------|-------|-------|------|-----|

- **`#`** — TVL rank within the **current tab and sort**. Dynamic: re-numbers when tab changes or sort changes.
- **`Name`** — Protocol name. Links to `/protocol/{slug}`.
- **`Chain`** — **Primary chain (highest TVL) + `+N` chip** for multi-chain protocols. Example: `Ethereum +4`. Click routes to the detail page's chain tabs. One row per protocol (not per deployment).
- **`Risks`** — **Stage-colored pizza icon** inline; hover/click expands to the full 7-slice pizza in a popover. At Phase 0 all pizzas render as the fully gray "unknown" pizza.
- **`Stage`** — Colored Defiscan stage badge: `Stage 0` / `Stage 1` / `Stage 2`, or `—` for unreviewed protocols. Green/yellow tinting follows Defiscan convention. Phase 0: column renders all `—`.
- **`Type`** — Raw DeFiLlama category string (e.g. `Lending`, `CDP`, `Liquid Lending`). Doubles as the value that determines tab membership — useful on the `All` and `Others` tabs where Type varies row-to-row; redundant but honest inside a single-category tab.
- **`TVL`** — Formatted `$42.3M` (one decimal, K/M/B suffix). `unknown` with em-dash when DeFiLlama returns null.

### Sorting and filtering

- **Default sort**: TVL desc (unchanged from the original spec).
- **Sortable columns**: `#`, `Name`, `Chain` (by primary chain alpha), `Stage`, `Type`, `TVL`.
- **Risks column sort**: by Defiscan stage (worst-slice-wins), then by count of red slices as tiebreaker.
- **In-tab filters**: review-status filter and per-slice pizza filter chips (from earlier decisions) both operate **within** the active category tab.
- **Delisted + dead protocols**: excluded from all tabs' default view. A "show inactive" toggle re-includes dead; delisted stays 410 regardless.

### Row count default

Default view still shows **top 200 by TVL within the active tab**. "Show all" expands to the full tab contents. The 200-row cap is per-tab, not global.

---

## Deployment inputs (2026-04-21)

Resolved pre-flight values for Phase 0 implementation.

- **GitHub repo**: `guil-lambert/defibeat`
- **User-Agent contact URL**: `https://github.com/guil-lambert/defibeat` (used in every outbound DeFiLlama request: `User-Agent: DefiBeat (+https://github.com/guil-lambert/defibeat)`)
- **Footer corrections/takedowns link**: `https://github.com/guil-lambert/defibeat/issues`
- **Vercel project slug**: `defibeat`
- **Sync auth**: shared-secret env var `SYNC_SECRET`, sent as `x-sync-secret` header from GH Actions → `/api/sync`. Stored in Vercel env + GH Actions secrets; rotated manually.
- **Database**: Neon Postgres. Connection strings provided out-of-band by the operator — repo ships `.env.example` with `DATABASE_URL` (prod) and `TEST_DATABASE_URL` (test branch) placeholders only; never committed.
- **Integration-test DB**: dedicated Neon branch (not testcontainers). Rationale: matches prod environment exactly, avoids Docker dependency in CI. Vitest integration tests bootstrap by running `schema.sql` on a clean DB.
- **Node**: 22 LTS, pinned via `.nvmrc` + `engines`.
- **pnpm**: 9 (latest), pinned via `packageManager` for Corepack.
