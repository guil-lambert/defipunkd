# Prompt

You are implementing **Phase 0** of DefiBeat (see `spec.md` in the repo root — read it in full before starting). Phase 0's "done" definition: list + detail pages live for all DeFiLlama protocols with raw metadata and `unknown` enrichment rows. Work in **5 sequential implementation phases**. After each phase, stop, summarize what changed, and wait for my go-ahead before starting the next.

## Pre-flight (before Phase 1)

Confirm you've read `spec.md` in full, then ask for or confirm each of the following before writing code:

- **Contact URL** for the `User-Agent: DefiBeat (+<contact-url>)` header sent to DeFiLlama.
- **Shared-secret env var name** for `/api/sync` auth (default: `SYNC_SECRET`, header `x-sync-secret`).
- **Neon connection strings** for (a) production and (b) a throwaway integration-test branch.
- **Vercel project** name/slug this deploys into.
- **GitHub repo** slug for the Actions workflow.
- **pnpm + Node versions** to pin via `packageManager` and `.nvmrc` / `engines`.

Flag contradictions between `spec.md` prose and the "Interview decisions" / "Landing page" sections (those win per spec) before proceeding.

## Ground rules

- Treat `spec.md` as authoritative. Where the **Interview decisions (2026-04-21)** or **Landing page: category tabs + Summary table** sections conflict with earlier prose, those sections win.
- **The DB is derived state** (spec Key Principle #11). Any instance must be rebuildable from scratch via a `pnpm rebuild-db` command: drop → apply `schema.sql` → load curated files (empty at Phase 0) → run DeFiLlama sync. Do not introduce DB-only state that can't be reconstructed.
- No features beyond Phase 0. Stub Phase 1/2/3 tables and queue interfaces but do not implement workers.
- No speculative abstractions, no comments explaining what code does, no README/docs unless I ask.
- TypeScript + Next.js (App Router) on Vercel, Postgres (Neon). pnpm workspaces. Dark-only UI, slate base + cyan (#22d3ee) accent, pizza slices use green/yellow/red.
- Use a feature branch per phase; commit in logical chunks; don't push without asking.
- After each phase, run typecheck + build + tests and report results. If something in the spec is ambiguous, ask before guessing.

## Testing policy (applies to all phases)

- **Framework**: Vitest for units + integration; a single Playwright smoke test added in Phase 5.
- **Philosophy**: test logic that can silently break (diff detection, delist rule, auth, category mapping). Do **not** test framework glue, do **not** write snapshot or component tests, do **not** mock full DeFiLlama payloads — use small hand-crafted fixtures.
- **Integration tests** hit a real Postgres. Pick **one** of: (a) a dedicated Neon branch, or (b) testcontainers-postgres. Decide in Phase 1 and justify in one line. Tests must bootstrap by running `schema.sql` on a clean DB (same path as `rebuild-db`).
- Each phase lists its required tests under **Tests**. Don't add more than listed without asking.

## Phase 1 — Repo skeleton & schema

1. Fork prep: prune the checked-in l2beat packages aggressively (delete rollup packages; keep `@l2beat/discovery` + the UI package in the workspace). List everything you delete.
2. Set up pnpm workspace, Next.js app (App Router, TS strict), shared `@defibeat/db` package. Use **raw SQL migrations** — no ORM. Thin query layer: `pg` (or `postgres`) + hand-written parameterized queries. Justify the driver pick in one line.
3. Write the **full Postgres schema** from spec §"Data model" into a single `schema.sql` (idempotent where practical; destined to be applied to an empty DB). Include all tables listed in the spec — even those empty until Phase 1/2/3. Required columns: `delisted_at`, `last_seen_in_defillama`, `last_updated` (material-change), `last_synced_at` (every run), `is_dead` (derived from DeFiLlama signals), provenance cross-cutting columns, no `parser_version`. Must apply cleanly on a fresh Neon DB.
4. Implement `pnpm rebuild-db`: drops all tables, applies `schema.sql`, loads curated files (none exist yet — leave a `curated/` directory with a `.gitkeep`), then invokes the sync entry point (stubbed in Phase 1; wired in Phase 2).
5. Stub the Postgres-backed queue (pgboss) and leave worker interfaces for site/docs/github/audit/onchain with TODOs.
6. A tiny migration runner (~30 lines) that applies numbered `migrations/*.sql` files in order and records them in a `_migrations` table. Used only for rare in-place changes; the default path is `rebuild-db`.
7. Install Vitest, wire `pnpm test`, decide + document the integration-DB approach (per testing policy above).
8. Pin pnpm via `packageManager` and Node via `.nvmrc` (or `engines`).

**Tests**: none yet (just the harness).

**Checkpoint**: `pnpm rebuild-db` succeeds against a fresh Neon branch, typecheck passes, `pnpm build` succeeds, `pnpm test` runs (zero tests is fine).

## Phase 2 — Sync worker + GitHub Actions trigger

1. Implement `/api/sync` as a protected Vercel route (shared-secret header auth). Sends `User-Agent: DefiBeat (+<contact-url>)` to `https://api.llama.fi/protocols`.
2. Upsert into `protocols` + `chain_deployments` with **per-row diff detection** on material fields (spec §"Refresh cadence"). On each run:
   - always update `last_seen_in_defillama` and `last_synced_at`
   - bump `last_updated` **only** on material-field change (enumerate the material fields in a single constant reused by the diff function)
   - recompute `is_dead` from DeFiLlama's own deprecation signals (`deadUrl`/`deadFrom`/category hints); no TVL-history inference
3. Auto-delist after 14 consecutive days absent from DeFiLlama (set `delisted_at`).
4. `parentProtocol` only for `parent_slug`; no suffix parsing.
5. **Stay under Vercel's 300s function budget**: batch upserts via a single `INSERT ... ON CONFLICT` with `unnest` (or equivalent) — not per-row round-trips. Expect ~6k rows.
6. GitHub Actions `workflow_dispatch` workflow that calls the route with the secret.
7. Silent last-good failure mode; no banners.

**Tests**:
- **Unit**: material-change diff function — fixtures for (a) TVL-only change → no `last_updated` bump (but row is still updated), (b) description-only change → no bump, (c) logo URL change → no bump, (d) chains change → bump, (e) new slug, (f) identical row → no-op.
- **Unit**: `parentProtocol` → `parent_slug` mapping incl. null case.
- **Unit**: `is_dead` derivation from DeFiLlama signals (present `deadUrl` → dead; absent → alive; edge cases).
- **Integration**: run the upsert twice against a clean DB with a small fixture list; assert idempotency, `last_synced_at` bumps both times, `last_updated` only moves on material diffs.
- **Integration**: delist rule boundary — seed rows with `last_seen_in_defillama` 13 and 14 days ago, run sync without them; assert only the 14-day row gets `delisted_at`.
- **Integration**: `/api/sync` returns 401 on missing/wrong secret, 200 with the right one (mock the fetch).

**Checkpoint**: dispatch the workflow against a real Neon DB, confirm ~6k rows land and re-syncs are idempotent. Report counts + test results + wall-clock time (must be <300s).

## Phase 3 — Protocol detail page

1. `/protocol/{slug}` with the L2BEAT dense table component ported near-verbatim, repalette to slate + cyan.
2. Rows per spec §"Detail page field rendering": TVL, Website, Github (`unknown` / em-dash), Audits (count + collapsed expandable list annotated by auditor domain), Admin (`unknown` / em-dash), Review status, Hallmarks as a chronological timeline row, Updated timestamp sourced from `last_synced_at` (UTC ISO-like, always visible).
3. Chain tabs across the header (top-N by per-chain TVL, ~7 visible + "more" dropdown). Collapsed breadcrumb when family == instance.
4. Children table on a parent's page if other protocols point to it via `parent_slug`.
5. Delisted → HTTP 410 with stub page preserving **last-known protocol name**, `delisted_at`, and a DeFiLlama link.
6. `noindex` meta on all `/protocol/*` at Phase 0. Leave a TODO pointing at the spec rule: flip to indexable per-protocol once it reaches `machine_summarized` (Phase 3).
7. ISR hourly revalidation.
8. Pizza chart header placeholder: fully gray 7-slice SVG with em-dash tooltip. Clicking a slice scrolls to the matching dense-table section (wire the anchors even though slices are all unknown).

**Tests**:
- **Unit**: TVL formatter (`$42.3M`, one decimal, K/M/B; null → `unknown` / em-dash; `0` → `$0`).
- **Unit**: UTC timestamp formatter.
- **Unit**: auditor-domain extraction from audit URLs.
- **Unit**: hallmarks tuple parsing (DeFiLlama returns `[[timestamp, description], ...]`); test empty, single, multiple, malformed.
- **Integration**: route handler returns 410 for a row with `delisted_at` set **and response body includes the last-known name + DeFiLlama link**; 200 otherwise; 404 for unknown slug.
- **Integration**: children table — seed a parent + two children via `parent_slug`, assert the parent's page query returns both children; a non-parent's page returns none.

**Checkpoint**: visit 5 real slugs incl. a multi-chain protocol, a parent-with-children, a delisted one. Screenshots or a short written walkthrough + test results.

## Phase 4 — Landing page

1. Category tabs exactly as spec §"Landing page": `All | Lending | DEX | Yield | Derivatives | Bridges | Liquid Staking | CDP | Stablecoins | RWA | Others`. Static `category-map.ts`; unmapped → `Others` + `console.warn` server-side.
2. Summary table columns: `# | Name | Chain | Risks | Stage | Type | TVL`. TVL-desc default, top 200 per tab, "show all" toggle.
3. Server search (name/slug/category ILIKE with prefix-boost ranking; case-insensitive). Review-status filter. Per-slice pizza filter chips (wired; all show "unknown" at Phase 0).
4. `Chain` column: primary + `+N` chip. `Risks`: tiny gray pizza with hover popover. `Stage`: `—`. Tab counts exclude delisted + dead, computed once per ISR window.
5. "Show inactive" toggle re-includes dead protocols (but never delisted).
6. Reviewed grid component built but hidden until any protocol is `reviewed`.

**Tests**:
- **Unit**: `category-map.ts` — every seed mapping in the spec, plus an unknown category routing to `Others`.
- **Unit**: prefix-boost ranking — given a query and a list of candidates, assert prefix matches rank above mid-string matches; assert case-insensitivity.
- **Integration**: landing query returns ≤200 rows per tab, excludes delisted + dead by default, includes dead (not delisted) when "show inactive" is on.
- **Integration**: search + category tab intersect correctly (e.g. search "aave" inside `Lending` tab returns only Lending matches, not DEX matches).

**Checkpoint**: landing renders against the full dataset; confirm counts, sort, search, filters work + test results.

## Phase 5 — Methodology, footer, polish + smoke test

1. `/methodology` as static MDX: Defiscan rubric inheritance + "not yet rating" disclaimer + pizza legend. Indexable.
2. Footer: methodology link, GitHub issues link for corrections/takedowns, Defiscan credit.
3. Landing page indexable; `/protocol/*` stays `noindex`.
4. Dark-only theme final pass, cyan accent audit (pizza is the only non-cyan surface).
5. Lighthouse / typecheck / build pass. Verify HTTP 410 actually returns 410 (not 404 or 200).

**Tests**:
- **Playwright smoke** (one spec, four checks): (a) landing page loads and shows the category tabs; (b) a known protocol detail page loads, shows the dense table, and has `noindex` in its meta; (c) `/methodology` loads and does **not** have `noindex`; (d) a delisted slug returns HTTP 410. Run against `pnpm build && pnpm start` in CI.

**Checkpoint**: full Phase 0 walkthrough against production-like deploy on a preview URL + green smoke test.

---

Before starting Phase 1, complete the Pre-flight checklist at the top and flag any spec contradictions or missing inputs.
