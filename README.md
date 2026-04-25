# DeFiPunkd

Live, evidence-based transparency registry for DeFi protocols. An L2BEAT-for-DeFi in spirit.

DeFiPunkd is **not** a centralized risk-rating system. It is a protocol registry and evidence intake layer: every protocol from DeFiLlama gets a page with raw fields and missingness visible, and per-dimension grades are filled in over time by the DEFI@home pipeline (LLM submissions → quorum → optional human signoff). Tiers gate publication; a tier is a data-readiness signal, not an editorial endorsement.

Audience: DeFi power users, researchers, and auditors who want dense evidence on proxies, multisigs, timelocks, upgradeability, and autonomy — without marketing polish. See [`spec.md`](./spec.md) for the full product framing and phase plan.

## Not quite a "*beat"

Unlike L2BEAT, WalletBeat, and the other "beat" projects, **DeFiPunkd is not human-curated**. It is tool-assisted first, with an optional human curation layer that is deliberately minimal and not strictly required. There are thousands of DeFi protocols — hand-curating each one does not scale. The registry starts from DeFiLlama, layers deterministic signals (verifiability, autonomy), and defers judgment calls to a distributed `DEFI@home` process where any number of independent auditors submit graded assessments and a quorum decides.

## DEFI@home — distributed protocol assessment

DeFiPunkd does not run crawlers. Instead, contributors assess protocols by running a pinned prompt through an LLM of their choice (Claude, ChatGPT, Gemini, etc.) and submitting the JSON output as a pull request. A quorum bot merges your submission once ≥3 independent runs agree on grade and overlapping evidence.

**The flow:**

1. Open any protocol page on the site and click **Audit this slice yourself** under one of the 5 Risk analysis cards.
2. Copy the generated prompt — it has the snapshot timestamp, chains, GitHub repos, and audit links already pinned in. Paste into your LLM.
3. The LLM returns one JSON object matching [`data/schema/slice-assessment.v2.json`](./data/schema/slice-assessment.v2.json) — every claim must cite a verifiable URL (block explorer, repo at a pinned commit SHA, or audit PDF).
4. Click **Submit your run**. GitHub opens its new-file UI pre-pointed at `data/submissions/<slug>/<slice>/` with a JSON stub. Paste your output, commit, open the PR.
5. CI validates the schema within ~30 s; if 2+ contributors agree, the quorum bot opens a follow-up PR merging your assessment into `data/assessments/` within 24 h. Disagreements open a per-(slug, slice) aggregation issue instead.

The determinism comes from **consensus across re-runs**, not from the LLM being deterministic. Every submission records the model used, the prompt version, and the snapshot timestamp — anyone can re-run the same prompt later and the citations should still be re-verifiable. See [`/contribute`](./apps/web/src/pages/contribute.astro) on the site for full documentation, and [`packages/prompts/`](./packages/prompts/) for the prompt source.

The full pipeline is live: prompt + schema + submission UX, plus the schema validator (`validate-submission.yml`), the quorum bot (`quorum.yml`), an autorun action that runs the pinned prompt as an Anthropic SDK "third voice" so quorum doesn't stall on contributor availability (`autorun.yml`), and a reconciliation action that promotes assessments into `data/master/` (`reconcile.yml`).

## Architecture at a glance

- **Git-native.** Protocol metadata lives as committed files; the repo is the source of truth. No database. Master-file updates surface within the ISR window (60s) without a redeploy.
- **DeFiLlama seeds the universe.** `pnpm sync` fetches `https://api.llama.fi/protocols`, normalizes the payload, and writes `data/defillama-snapshot.json`. Curated overlays live in `data/overlays/<slug>.json` and merge on top.
- **Read-only.** No submission queue, no auth, no forms. Corrections route to GitHub PRs and issues.
- **DEFI@home for assessments.** Risk-slice grades are filled in by contributors running pinned LLM prompts and submitting JSON via PR (see above); the quorum bot merges once independent runs agree. No unilateral grading.
- **Tier system gates publication.** Protocols receive `none` / `bronze` (≥1 slice has quorum) / `silver` (all 5 slices have quorum) / `gold` (any slice has human signoff). Quorum threshold = 3 independent models. Tiers are a data-readiness signal, not a safety claim. Defiscan stages will be layered over tiers once human review formalizes. Logic in [`apps/web/src/lib/tier.ts`](./apps/web/src/lib/tier.ts).

## Workspace layout

```
apps/
  web/                       Astro 5 site (the registry UI), one Svelte 5 island
data/
  defillama-snapshot.json    Full DeFiLlama seed (committed)
  overlays/                  Curator overlays (per-slug JSON, committed)
  schema/
    slice-assessment.v2.json JSON Schema for DEFI@home submissions
  submissions/<slug>/<slice>/*.json
                             Raw per-contributor LLM runs (one JSON per run)
  assessments/<slug>/<slice>.json
                             Merged per-slice assessments (quorum bot output)
  master/                    Reconciled master records from assessments
packages/
  registry/                  Snapshot + overlay merge + assessments + typed access
  sync/                      DeFiLlama fetcher / normalizer / carry-forward logic
  prompts/                   DEFI@home prompt generator (preamble + 5 slice bodies)
  validator/                 Schema/quorum/reconcile/priority-queue CLIs
spec.md                      Product spec and phase roadmap
```

## Development

Requirements: Node 22, pnpm 9.

```bash
pnpm install
pnpm dev                              # astro dev on :4321
pnpm test                             # vitest, all workspaces
pnpm typecheck                        # astro check + tsc --noEmit
pnpm build                            # production build (all workspaces)
pnpm --filter @defipunkd/web preview   # local preview of the built app
```

## Frontend stack

- **Astro 5** (`output: "server"`) owns routing and layouts. **Hybrid rendering**: landing (`/`), `/methodology`, and `/contribute` are marked `prerender = true` and emit static HTML at build. `/protocol/[slug]` is server-rendered on demand and cached at the Vercel edge via **ISR (60s expiration)** — master-file updates become visible within the window without a redeploy. Configured in [`apps/web/astro.config.mjs`](./apps/web/astro.config.mjs).
- **Svelte 5** is used for exactly one interactive island: `apps/web/src/components/LandingTable.svelte` (tabs, search, tier and pizza-filter chips, sort, row expansion, pagination), mounted with `client:load` on `/`. Every other page and component — methodology, protocol detail, chain tabs, pizza chart, footer, delisted template — is a zero-JS `.astro` component.
- **Runtime data access.** The Vercel adapter's `includeFiles` ships `data/defillama-snapshot.json`, `data/overlays/`, `data/assessments/`, `data/master/`, and `data/submissions/` into the serverless function bundle. `@defipunkd/registry` reads them from `process.cwd()` at request time.
- **Typography** via `@fontsource-variable/ibm-plex-sans` (variable) and `@fontsource/ibm-plex-mono` (static 400/500; no variable build is published on npm).
- **Delisted protocols** resolve at `/protocol/{slug}` and render a normal page with `<meta name="robots" content="noindex">`, preserving the last-known name, `delisted_at`, and a DeFiLlama link. No HTTP 410.

### Build characteristics

| Metric | Value |
|---|---|
| Pages prerendered at build | 3 (landing, `/methodology`, `/contribute`) |
| Pages rendered on demand + ISR-cached | one per `/protocol/[slug]` (~8000+ live slugs) |
| ISR expiration | 60 s |
| JS on `/` | ~8.6 KB gzipped (Svelte runtime + `LandingTable` island) |
| JS on `/methodology` and `/contribute` | 0 B |
| JS on `/protocol/{slug}` | 0 B |
| Cold-start snapshot parses | 1 per serverless function instance (registry singleton) |

## Refreshing the snapshot

```bash
pnpm sync
```

Pulls `api.llama.fi/protocols`, re-normalizes, writes `data/defillama-snapshot.json`, and prints a human-readable TVL diff. Commit the resulting file; merging the PR is the refresh.

Upstream etiquette: sync sends `User-Agent: defipunkd (+<contact>)`. The intended path is the scheduled `.github/workflows/sync.yml` action (weekly, Monday 06:00 UTC) which runs `pnpm sync` and opens a PR with the diff as the body. Run `pnpm sync` locally only as an ad-hoc escape hatch; do not hammer the API from CI or cron jobs outside this workflow.

## Curating a protocol

Overlay a DeFiLlama slug with a file at `data/overlays/<slug>.json`. Keys present in the overlay override the snapshot; keys absent defer to DeFiLlama. Commit and open a PR.

See `packages/registry/src/overlay-schema.ts` for the accepted shape and `packages/registry/src/merge.ts` for the three-state precedence rules.

## Corrections and takedowns

Open a GitHub issue or PR. The repo is the review surface — no contact form by design.

## Design

Visual direction: radiographic — clinical, monochrome, evidentiary. One typeface (IBM Plex), muted neutrals with surgical accent colors that each carry a single meaning (link, verified-onchain, contradiction). Density over breathing room. See `.impeccable.md` for the full design context.

## License

MIT. The Defiscan rubric is adapted with attribution.
