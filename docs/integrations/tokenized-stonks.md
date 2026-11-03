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

## Asset comparisons

`/assets` lists the crawlable site's covered-market subset (not its entire interactive catalog). The initial local comparison is Apple, at `/assets/aapl-us0378331005-xnas`; other assets link to their source catalog pages. Add reviewed catalog IDs to `COMPARISON_ASSET_IDS` to expand local comparisons.

Run `pnpm --filter @defipunkd/enrichment run refresh-asset-catalog`. This fetches the documented `/assets` HTML directory and one `/assets/{id}` page per selected comparison, sequentially with a one-second delay. The asset JSON endpoints returned 503s during implementation, so this uses the source's explicitly crawlable pages. Cheerio extracts catalog facts only: asset identity/type, source timestamp, issuer label, symbol, network, contract/explorer URL and representation form. It checks canonical asset identity, expected table headers, published row counts, unique entries and safe URLs. Any network/parse/validation error leaves `data/enrichment/asset-catalog.json` intact. The initial snapshot was parsed from successfully retrieved public pages; a later live refresh returned HTTP 503 and preserved it.

The existing Wednesday workflow refreshes both issuer summaries and the asset catalog in a data PR. Source attribution/logo, retrieval date, source snapshot date and the two-week stale advisory appear on the new pages. Market prices/volume/liquidity are not copied.

Issuer labels have an explicit product mapping to registry protocols. No fuzzy name matching, family-wide grade inheritance or category heuristics are used. Separate issuer labels (including Robinhood and Robinhood EU) remain separate rows even where they link to shared protocol context. The five cells show only stored assessments and preserve their confidence treatment; submitted reviews without consensus show `Review pending`, absent reviews show `Not assessed`, and an assessed unknown remains unknown. Expanded criteria show the protocol-level scope, rationale and dated submissions with evidence links. No token- or chain-specific grade is inferred. Token forms are preserved, including wrappers, derivatives and off-chain products.

At launch, none of the four mapped protocols has a completed risk-slice assessment. Robinhood has three pending reviews. The comparison intentionally exposes that coverage gap; adding actual security grades requires the usual evidence/quorum process.
