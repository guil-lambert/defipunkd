# DeFiPunk'd → DeFiLlama (showcase extension)

A throwaway **demo** Chrome extension that overlays DeFiPunk'd decentralization
assessments — the 5-slice "risk pizza" (Control · Ability to exit · Autonomy ·
Open Access · Verifiability) and the tier medal — directly onto defillama.com,
to show the DeFiLlama team what an integration could look like.

## What it injects

1. **Rankings table** — a small pizza badge inline with each protocol's name.
2. **Protocol page header** — a small pizza next to the bookmark icon.
3. **Protocol page** — a streamlined DeFiPunk'd block (pizza + tier medal +
   per-slice risk matrix + link) appended to the existing "Protocol Information" card.

Clicking any pizza opens the full assessment on `defipunkd.com`.

**Family defaulting:** a parent product whose row links to the parent slug (e.g.
`uniswap`) inherits the assessment of its best-assessed child (highest consensus
tier, tie-break by TVL — e.g. `uniswap-v4`), matching defipunkd.com.

## Load it (unpacked)

1. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked**
   → select this `extension/` folder.
2. Visit `https://defillama.com` and `https://defillama.com/protocol/aave`.

(For local API development, point `globalThis.DPK_API_BASE` in `src/config.js` at your
dev server, e.g. `http://localhost:4321`, and add it to `host_permissions`. Re-run
`pnpm --filter @defipunkd/web build:extension-data` to refresh the bundled fallback.)

## How it works

- **Data is fetched live** from defipunkd.com. A background service worker
  (`src/background.js`) fetches `/api/extension/index.json` (a lightweight all-protocol
  map: tier + slice grades, for the badges) and `/api/extension/protocol/<slug>.json`
  (the full record — verdicts, pills, family tabs — for the streamlined block), caches
  both in `chrome.storage.local` with stale-while-revalidate, and answers `GET_INDEX` /
  `GET_DETAIL` messages from the content scripts. The API reuses the website's own
  `assessProtocol` / `deriveTier` / `getProtocolMetadata` (via
  `apps/web/src/lib/extension-data.ts`) so the overlay matches defipunkd.com exactly.
- **Instant first paint, offline-safe:** `src/index-fallback.js` bundles the lightweight
  index (`globalThis.DEFIPUNKD_INDEX_FALLBACK`) so badges render immediately; the live
  index from the worker then overrides it and re-renders. Regenerate the fallback with
  `pnpm --filter @defipunkd/web build:extension-data`.
- **Slug matching is 1:1** with DeFiLlama (DeFiPunk'd ingests DeFiLlama slugs). The
  slug is read from the stable `/protocol/<slug>` href.
- **Rendering** (`src/pizza.js`) is pure SVG ported from the web app — no chart
  library, no build step.
- **Injection** (`src/inject-*.js`) is driven by a single MutationObserver +
  history-patch watcher (`src/common.js`) so it survives DeFiLlama's React
  re-renders, row virtualization, and SPA navigation. Injected nodes are marked
  `data-dpk*` for idempotency.

## Caveats (it's a showcase)

- DeFiLlama ships hashed class names, so the DOM selectors are **heuristic**. They
  live as named constants at the top of each `inject-*.js` for quick fixing if the
  markup shifts. The slug anchor (`/protocol/<slug>`) is the robust part.
- Data is served from the live `/api/extension/*` routes; the bundled
  `src/index-fallback.js` is only a first-paint / offline fallback and may lag the API
  by however long since it was last regenerated.
- Chrome MV3 only (uses `oklch()` slice fills).
- This folder is intentionally **outside** the pnpm workspace; `src/index-fallback.js`
  is committed so it loads without a build.
