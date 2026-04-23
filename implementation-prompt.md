# Prompt

> **Status: historical — Phase 0 MVP is shipped.** This prompt drove the initial 5-phase build (registry → sync CLI → protocol page → landing → methodology + smoke test). The codebase is now beyond that scope. The original `spec.md` enrichment phases (crawlers, onchain workers, LLM classification) have **also been superseded** by **DEFI@home** — see the pivot note at the top of `spec.md` and the dedicated section in `README.md`. Risk-slice grading happens via contributor-submitted LLM-generated JSON, validated against `data/schema/slice-assessment.v1.json`, merged via a quorum bot. There is no crawler worker phase; do not build one.
>
> Anything below references the original Phase 0 build as it was actually executed. Keep for historical reference; do not use as a forward-looking roadmap.

You are implementing **Phase 0** of defipunkd (see `spec.md` in the repo root — read it in full before starting). Phase 0's "done" definition: list + detail pages live for all DeFiLlama protocols with raw metadata and `unknown` enrichment rows, **fully statically rendered from committed files — no database**. Work in **5 sequential implementation phases**. After each phase, stop, summarize what changed, and wait for my go-ahead before starting the next.

## Pre-flight (before Phase 1)

Confirm you've read `spec.md` in full, then ask for or confirm each of the following before writing code:

- **Contact URL** for the `User-Agent: defipunkd (+<contact-url>)` header sent to DeFiLlama.
- **Vercel project** name/slug this deploys into.
- **GitHub repo** slug.
- **pnpm + Node versions** to pin via `packageManager` and `.nvmrc` / `engines`.

Flag contradictions between `spec.md` prose and the "Interview decisions" / "Landing page" / "Deployment inputs (2026-04-22 pivot)" sections (those win, pivot wins hardest) before proceeding.

## Ground rules

- Treat `spec.md` as authoritative. The **Deployment inputs (2026-04-22 pivot)** note wins over anything DB-shaped elsewhere.
- **The git repo is the source of truth at Phase 0** (spec Key Principle #11). Protocol data lives in `data/defillama-snapshot.json` + `data/overlays/<slug>.json` (JSON, not TS — per round-2 decision). Do not introduce a database, a queue, a shared secret, or a Vercel API route.
- No features beyond Phase 0. No stubs for Phase 1/2/3 workers beyond what the registry API naturally permits.
- No speculative abstractions, no comments explaining what code does, no README/docs unless I ask.
- TypeScript + Next.js (App Router) on Vercel. pnpm workspaces. Dark-only UI, slate base + cyan (#22d3ee) accent, pizza slices use green/yellow/red.
- Use a feature branch per phase; commit in logical chunks; don't push without asking.
- After each phase, run typecheck + build + tests and report results. If something in the spec is ambiguous, ask before guessing.

## Testing policy (applies to all phases)

- **Framework**: Vitest for units + integration; a single Playwright smoke test added in Phase 5.
- **Philosophy**: test logic that can silently break (snapshot normalization, parent mapping, `is_dead` derivation, 14-day delist rule, overlay merge precedence, category mapping, prefix-boost ranking). Do **not** test framework glue, do **not** write snapshot or component tests, do **not** mock full DeFiLlama payloads — use small hand-crafted fixtures under `fixtures/`.
- **Integration tests** run against a small committed fixture snapshot (e.g. `fixtures/snapshot.small.json`) plus a couple of fixture overlays. No database, no testcontainers, no Neon branch.
- Each phase lists its required tests under **Tests**. Don't add more than listed without asking.

## Phase 1 — Repo skeleton & registry package

1. Fork prep: prune the checked-in l2beat packages aggressively as a **single Day-1 nuke commit** (delete all rollup-specific packages in one diff; keep `@l2beat/discovery` + the UI package in the workspace). List everything you delete.
2. Set up pnpm workspace + Next.js app (App Router, TS strict). Pin Node 22 LTS via `.nvmrc` + `engines`; pnpm 9 via `packageManager`.
3. Create `packages/registry` exporting:
   - `type Protocol`, `type Snapshot` (TS types), and an `Overlay` **Zod schema** with `type Overlay = z.infer<typeof OverlaySchema>`.
   - `listProtocols(): Protocol[]`
   - `getProtocol(slug: string): Protocol | undefined`
   - `listChildren(parentSlug: string): Protocol[]`
   The implementation reads `data/defillama-snapshot.json`, reads every `data/overlays/*.json` at module load, validates each via the Zod schema (failed parse/validation → **fail the build**, no silent skip), merges per-field, attaches a `_provenance` map (`"defillama" | "curated"` per field), and caches the merged index for the lifetime of the process.
4. Overlay schema is the source of truth; `Overlay` TS type is derived via `z.infer`. Unknown keys fail Zod validation. Fields carry neither `_provenance` nor timestamps — those come from the snapshot. Three-state semantics per field:
   - key **absent** → defer to snapshot
   - key = `null` → curated "known to have no value" (overrides snapshot with null)
   - key = value → override
   Empty string / empty array is literal `""` / `[]`, not a sentinel. No `hidden` field (no takedown mechanism at Phase 0).
5. **Orphan overlays** (slug not in current snapshot): `console.warn` at build, skip. Do not resurrect the protocol.
6. **Identity-with-snapshot**: when an overlay value is byte-equal to the snapshot value, field still renders `[curated]`, but emit a build-time warning listing duplicated fields so the reviewer can trim noise.
7. Create `data/` with a placeholder `defillama-snapshot.json` (can be an empty `{ "generated_at": "...", "protocols": {} }` at this stage) and an empty `data/overlays/` with a `.gitkeep`.
8. Install Vitest + Zod, wire `pnpm test`.

**Tests**: none yet (just the harness).

**Checkpoint**: typecheck passes, `pnpm build` succeeds, `pnpm test` runs (zero tests is fine), registry `listProtocols()` returns `[]` on the empty placeholder snapshot.

## Phase 2 — `pnpm sync` CLI

1. Create `packages/sync` — a plain node CLI (no Vercel route, no HTTP server). Entry point: `pnpm sync`.
2. Fetch `https://api.llama.fi/protocols` with `User-Agent: defipunkd (+<contact-url>)`.
3. Normalize into the `ProtocolSnapshot` shape from spec §"Data model":
   - `parent_slug` from `parentProtocol` only, and **only when it matches an existing slug in the snapshot** (strict slug-only linkage; string-label parents ignored, no slugification, no alias file).
   - `is_dead` from `deadUrl` / `deadFrom` / category hints.
   - Raw `category`, raw `chains`, `tvl`, `tvl_by_chain`, `website`, `twitter`, `audit_count`, `audit_links`, `hallmarks`.
4. **Carry forward** per-slug timestamps by reading the existing `data/defillama-snapshot.json` first:
   - `first_seen_at`: set on first appearance; immutable thereafter.
   - `last_seen_at`: bumped to `generated_at` whenever the slug is present in the latest DeFiLlama response.
   - `delisted_at`: set to the current `generated_at` iff the slug has been absent for **≥14 days** since `last_seen_at`. Once set, stays set.
5. Write the whole `data/defillama-snapshot.json` file atomically. One file, not per-slug.
6. **Trust DeFiLlama**: no sanity-check / abort on large protocol-count drops. 14-day grace absorbs transient outages.
7. **Sync summary**: emit a markdown summary to stdout (and into the PR body when run via Actions) containing: counts (new protocols, newly `delisted_at`, `is_dead` toggles) and **TVL movers** — every protocol whose TVL changed **≥±50% day-over-day**, as one list. No separate top-N absolute list.
8. (Optional, can defer) GitHub Actions `workflow_dispatch` that runs `pnpm sync` and opens a PR with this summary as the body if the diff is non-empty. Fine to skip this in Phase 2 and do it by hand.

**Tests** (all unit, against small hand-crafted DeFiLlama-response fixtures):
- normalize: key fields map correctly; null TVL stays null; empty arrays stay empty.
- `parentProtocol` → `parent_slug` mapping incl. null case.
- `is_dead` derivation: `deadUrl` present → dead; absent → alive; category hint edge case.
- **14-day delist rule boundary**: given a prior snapshot where slug X has `last_seen_at` 13 days before the new `generated_at` and slug Y has it 14 days before, and neither appears in the new response: X stays live, Y gets `delisted_at` set.
- `first_seen_at` immutability across runs; `last_seen_at` bumps when present.
- Reappearing slug after delist: default behavior is that reappearance clears `delisted_at` and bumps `last_seen_at`. Flag this decision in the PR for confirmation.

**Checkpoint**: run `pnpm sync` against real DeFiLlama, confirm ~6k entries land in `data/defillama-snapshot.json`, commit the initial snapshot so deploys are reproducible from the repo alone. Report counts + test results + wall-clock time.

## Phase 3 — Protocol detail page

1. `/protocol/[slug]/page.tsx` with the L2BEAT dense table component ported near-verbatim, repalette to slate + cyan.
2. `generateStaticParams` returns every non-delisted slug from `listProtocols()`. Delisted slugs are excluded from SSG and handled by a sibling `route.ts` (see #5).
3. Rows per spec §"Detail page field rendering": TVL, Website, Github (`unknown` / em-dash), Audits (count + collapsed expandable list annotated by auditor domain), Admin (`unknown` / em-dash), Review status, Hallmarks as a chronological timeline row, Updated timestamp sourced from the snapshot's `generated_at` (UTC ISO-like `2026-04-21 14:02 UTC`, always visible). **Show every row even when unknown** — the wall of em-dashes is intentional, signals the roadmap. No per-field UI timestamp (git blame on the overlay is the audit trail).
4. Chain tabs across the header (top-N by per-chain TVL from `tvl_by_chain`, ~7 visible + "more" dropdown). Collapsed breadcrumb when family == instance.
5. Delisted → a `route.ts` that checks `getProtocol(slug)?.delisted_at`; if set, return an HTML response with **HTTP 410** preserving last-known name + `delisted_at` + DeFiLlama link. Unknown slug → `notFound()` (404).
6. Children table on a parent's page using `listChildren(slug)`. **Columns match the landing Summary table**: `# | Name | Chain | Risks | Stage | Type | TVL`, sorted TVL desc.
7. `noindex` **meta tag only** on all `/protocol/*` at Phase 0 (no `robots.txt` Disallow, no Vercel bot mitigation). TODO comment referencing the spec's per-protocol flip rule at `machine_summarized`.
8. Pizza chart header placeholder: fully gray 7-slice SVG with em-dash tooltip. Clicking a slice scrolls to the matching dense-table section (wire the anchors).
9. Each rendered field reads its `_provenance` and renders `[defillama]` / `[curated]` / em-dash accordingly.

**Tests**:
- **Unit**: TVL formatter (`$42.3M`, one decimal, K/M/B; null → `unknown` / em-dash; `0` → `$0`).
- **Unit**: UTC timestamp formatter.
- **Unit**: auditor-domain extraction from audit URLs.
- **Unit**: hallmarks tuple parsing (`[[timestamp, description], ...]`; empty, single, multiple, malformed).
- **Unit**: overlay merge three-state semantics — absent key defers to snapshot; explicit `null` overrides snapshot with null; value overrides; `_provenance` tags accordingly. Orphan overlay (slug not in snapshot) warns and is skipped. Identity-with-snapshot overlay still renders `[curated]` but emits a build-time warning.
- **Unit**: overlay Zod validation — unknown keys and malformed values fail the build (not silently skipped).
- **Unit**: strict parent-slug linkage — `parentProtocol` not matching any known slug yields `parent_slug: null`.
- **Integration** (against `fixtures/snapshot.small.json` + a fixture overlay): the `/protocol/[slug]` route returns 410 for a delisted slug with body including last-known name + DeFiLlama link; 200 for live; 404 for unknown slug.
- **Integration**: `listChildren(parent)` returns children; non-parent returns none.

**Checkpoint**: visit 5 real slugs incl. a multi-chain protocol, a parent-with-children, a delisted one. Screenshots or a short walkthrough + test results.

## Phase 4 — Landing page

1. Category tabs: `All | Lending | DEX | Yield | Derivatives | Bridges | Liquid Staking | CDP | Stablecoins | RWA | Others`. Static `category-map.ts`; unmapped **or null/empty** category → `Others` + `console.warn` at build time.
2. Summary table columns: `# | Name | Chain | Risks | Stage | Type | TVL`. TVL-desc default, top 200 per tab, "show all" toggle. **Null-TVL protocols sort after all ranked entries** in every tab (so they never appear in the top-200 default view).
3. Search + filters work as **in-memory filter/sort over `listProtocols()`**. Prefix-boost ranking on name/slug/category, case-insensitive substring match. No punctuation normalization, no diacritic folding, no fuzzy/Levenshtein.
4. Per-slice pizza filter chips (wired; all "unknown" at Phase 0 so they're no-ops).
5. `Chain` column: primary (highest per-chain TVL) + `+N` chip. `Risks`: tiny gray pizza with hover popover. `Stage`: `—`. Tab counts exclude delisted + dead, computed at build time.
6. "Show inactive" toggle re-includes dead (never delisted).
7. Reviewed grid component built but hidden until any protocol is `reviewed`.
8. Page is fully static (no ISR needed — the registry is a function of the commit).

**Tests**:
- **Unit**: `category-map.ts` — every seed mapping in the spec, plus unknown/null/empty category routing to `Others`.
- **Unit**: prefix-boost ranking — prefix matches rank above mid-string matches; case-insensitive.
- **Unit**: primary-chain-selection from `tvl_by_chain` (empty → null; single chain; tie-break on chain name alpha).
- **Integration** (against `fixtures/snapshot.small.json`): landing query returns ≤200 per tab, excludes delisted + dead by default, includes dead (not delisted) when "show inactive" is on.
- **Integration**: search + category tab intersect correctly (search inside `Lending` returns only Lending matches).
- **Unit**: null-TVL sort order — null-TVL protocols come after all ranked entries regardless of direction of tie-break.

**Checkpoint**: landing renders against the real committed snapshot; confirm counts, sort, search, filters work + test results.

## Phase 5 — Methodology, footer, polish + smoke test

1. `/methodology` as static MDX (minimal content): "Registry only, no ratings" framing; DeFiLlama seed + curated overlays explanation; **7-slice pizza legend** (all gray at Phase 0) explaining each slice (chain/ownership, upgradeability, exit window, autonomy/accessibility, oracle dependency, external dependencies, collateral risk); note that Defiscan stages arrive in Phase 3 with links out to Defiscan's framework. Indexable.
2. Footer: methodology link, GitHub issues link (`https://github.com/guil-lambert/defipunkd/issues`) for corrections/takedowns, note pointing curators at `data/overlays/`, Defiscan credit.
3. Landing page indexable; `/protocol/*` stays `noindex`.
4. Dark-only theme final pass, cyan accent audit (pizza is the only non-cyan surface).
5. Lighthouse / typecheck / build pass. Verify HTTP 410 actually returns 410 (not 404 or 200) in a real `next start`.

**Tests**:
- **Playwright smoke** (one spec, four checks): (a) landing loads and shows category tabs; (b) a known protocol detail page loads, shows the dense table, and has `noindex` in its meta; (c) `/methodology` loads and does **not** have `noindex`; (d) a delisted slug returns HTTP 410. Run against `pnpm build && pnpm start` in CI.

**Checkpoint**: full Phase 0 walkthrough against a Vercel preview URL + green smoke test.

---

Before starting Phase 1, complete the Pre-flight checklist at the top and flag any spec contradictions or missing inputs.
