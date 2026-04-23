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
  web/                Next.js 15 site (the registry UI)
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
pnpm dev         # next dev on :3000
pnpm test        # vitest, all workspaces
pnpm typecheck   # tsc --noEmit, all workspaces
pnpm build       # production build
```

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
