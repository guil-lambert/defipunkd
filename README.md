# DefiBeat

Live, evidence-based transparency registry for DeFi protocols. An L2BEAT-for-DeFi in spirit, forked from [l2beat/l2beat](https://github.com/l2beat/l2beat) (MIT).

DefiBeat is **not** a risk-rating system. It is a protocol registry and evidence intake layer with deterministic data collection today and human-reviewed publication later. Phase 0 displays raw DeFiLlama fields with missingness visible; grades for specific dimensions are filled in by human review over time.

Audience: DeFi power users, researchers, and auditors who want dense evidence on proxies, multisigs, timelocks, upgradeability, and dependencies — without marketing polish. See [`spec.md`](./spec.md) for the full product framing and phase plan.

## Architecture at a glance

- **Git-native.** Protocol metadata lives as committed files; the repo is the source of truth. Every deploy is a deterministic, immutable snapshot of a commit SHA. No database at Phase 0.
- **DeFiLlama seeds the universe.** `pnpm sync` fetches `https://api.llama.fi/protocols`, normalizes the payload, and writes `data/defillama-snapshot.json`. Curated overlays live in `data/overlays/<slug>.json` and merge on top.
- **Read-only.** No submission queue, no auth, no forms. Corrections route to GitHub PRs and issues.

## Workspace layout

```
apps/
  web/                Astro 5 site (the registry UI), one Svelte 5 island
data/
  defillama-snapshot.json   Full DeFiLlama seed (committed)
  overlays/                 Curator overlays (per-slug JSON, committed)
packages/
  registry/           Snapshot + overlay merge + typed access
  sync/               DeFiLlama fetcher / normalizer / carry-forward logic
spec.md               Product spec and phase roadmap
```

## Development

Requirements: Node 22, pnpm 9.

```bash
pnpm install
pnpm dev                              # astro dev on :4321
pnpm test                             # vitest, all workspaces
pnpm typecheck                        # astro check + tsc --noEmit
pnpm build                            # production build (all workspaces)
pnpm --filter @defibeat/web preview   # serve dist/ statically
```

## Frontend stack

- **Astro 5** (`output: "static"`) owns routing, layouts, and static page generation. All 8100+ protocol pages are emitted at build time via `getStaticPaths()`; `dist/` is plain HTML + CSS + JS suitable for any static host (including IPFS).
- **Svelte 5** is used for exactly one interactive island: `apps/web/src/components/LandingTable.svelte` (tabs, search, pizza-filter chips, sort, row expansion, pagination), mounted with `client:load` on `/`. Every other page and component — methodology, protocol detail, chain tabs, pizza chart, footer, delisted template — is a zero-JS `.astro` component.
- **Typography** via `@fontsource-variable/ibm-plex-sans` (variable) and `@fontsource/ibm-plex-mono` (static 400/500; no variable build is published on npm).
- **Delisted protocols** resolve at `/protocol/{slug}` and render a statically generated page with `<meta name="robots" content="noindex">`, preserving the last-known name, `delisted_at`, and a DeFiLlama link. There is no server runtime and no HTTP 410 — static output is the invariant.

### Build characteristics

Measured on the current snapshot (8105 protocols, 8107 total pages = landing + methodology + one per slug):

| Metric | Value |
|---|---|
| Pages emitted | 8107 |
| Build wall-clock | ~290 s (~35 ms/page, per-page Astro render dominates) |
| JS on `/` | ~8.6 KB gzipped (Svelte runtime + `LandingTable` island) |
| JS on `/methodology` | 0 B |
| JS on `/protocol/{slug}` | 0 B |
| Snapshot parses per build | 1 (registry singleton) |

## Refreshing the snapshot

```bash
pnpm sync
```

Pulls `api.llama.fi/protocols`, re-normalizes, writes `data/defillama-snapshot.json`, and prints a human-readable TVL diff. Commit the resulting file; the site rebuilds from it.

Upstream etiquette: sync sends `User-Agent: DefiBeat (+<contact>)`. Run manually or via a scheduled `workflow_dispatch` that commits the diff as a PR — do not hammer the API.

## Curating a protocol

Overlay a DeFiLlama slug with a file at `data/overlays/<slug>.json`. Keys present in the overlay override the snapshot; keys absent defer to DeFiLlama. Commit and open a PR.

See `packages/registry/src/overlay-schema.ts` for the accepted shape and `packages/registry/src/merge.ts` for the three-state precedence rules.

## Corrections and takedowns

Open a GitHub issue or PR. The repo is the review surface — no contact form by design.

## Design

Visual direction: radiographic — clinical, monochrome, evidentiary. One typeface (IBM Plex), muted neutrals with surgical accent colors that each carry a single meaning (link, verified-onchain, contradiction). Density over breathing room. See `.impeccable.md` for the full design context.

## License

MIT, inherited from L2BEAT upstream. The Defiscan rubric is adapted with attribution.
