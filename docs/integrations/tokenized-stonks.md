# Tokenized Stonks coverage

Protocol pages display saved catalog summaries from [Tokenized Stonks](https://tokenizedstonks.io): covered underlying-asset and token-representation counts, issuer-scoped networks, and up to five example assets. The initial mappings are Ondo Global Markets, xStocks, Dinari, and Robinhood (Europe and Jersey shown separately). Ondo appears inside its family page's Global Markets deployment panel. This is stocks/ETFs/index coverage, not a complete RWA catalog or an assessment of risk.

Mappings live in `packages/registry/src/tokenized-assets.ts`. Add mappings only after checking the legal issuer and product scope; do not map a whole family or unrelated Treasury/credit products by name. Counts for different issuers are not summed, since underlying assets can overlap.

## Refresh

Run `pnpm --filter @defipunkd/enrichment run refresh-tokenized-assets`.

The refresh fetches five compact `/api/analytics?kind=issuer&scope_id=…&view=screen` responses sequentially with a descriptive User-Agent and a one-second pause between requests. These are public website endpoints, without a documented stability guarantee. It validates live mode, issuer scope, required fields and network completeness before writing any snapshots. An API or validation failure leaves the last saved data intact and fails the workflow. Each file is replaced atomically.

The Wednesday workflow opens/updates one `data/tokenized-assets` PR. Merging its data changes updates the deployed snapshot. Pages make no upstream requests, and Vercel already bundles `data/enrichment`. Missing/invalid snapshots hide the section. Source snapshot and retrieval dates are shown; source snapshots older than 14 days have an explicit stale notice.

Example assets come from the issuer-scoped volume-ranked selection, not a complete directory or recommendation. General asset-directory rows contain cross-issuer networks and market metrics even when filtered by issuer, so they must not be used as issuer-specific coverage. We use the matching issuer's network IDs from the scoped analytics response. Asset links lead to comparisons across issuers; issuer links lead to that issuer's coverage and venues.

## Attribution and scope

[Terms](https://tokenizedstonks.io/terms) permit reuse of their compilation and analysis with visible adjacent `Source: tokenizedstonks.io` attribution. The section carries this credit and source links. Partner/provider data retain their own terms. This integration saves only catalog summaries and examples; it discards market prices, liquidity, volume, histories and underlying partner observations. It does not change risk scores, confidence or quorum evidence.
