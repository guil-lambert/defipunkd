export const dependenciesBody = `### Slice: DEPENDENCIES

Evaluate which third-party systems this protocol must trust for correctness and solvency.

Examine:
1. Oracles: grep the source (or, if unavailable, read the verified contract) for "oracle", "aggregator", "getPrice", "latestAnswer", "chainlink". Record each oracle provider and whether there is redundancy (e.g. ≥2 independent providers with a median or TWAP).
2. External protocol calls: which external contract addresses do the main contracts read from or call? For each, identify the protocol (e.g. Aave pool, Curve pool, Lido stETH). For bridged or wrapped collateral, identify the bridge operator.
3. Category-level structural dependency: if protocol.category is Bridge / Canonical Bridge / Cross Chain Bridge / Bridge Aggregator / Liquid Staking / Liquid Restaking / RWA Lending, this is a red by DeFiLlama's category assignment.
4. forkedFrom lineage: if DeFiLlama records a forkedFrom relationship, the contracts inherit logic from another codebase. Note this as orange at minimum; real fork detection requires bytecode comparison.
5. Bridge exposure: if any major TVL component is a bridged token (wstETH on a non-Ethereum chain, USDC.e, etc.), the protocol inherits the bridge's risk.

Grade rules:
- green   = minimal external dependencies; oracles from ≥2 independent providers; no category-level structural risk.
- orange  = single-provider oracle with documented mitigations (TWAP, bounds), OR one material dependency on an otherwise-healthy external protocol, OR DeFiLlama records non-empty forkedFrom lineage.
- red     = protocol's category is bridge / LST / RWA, OR protocol critically depends on a single external protocol or oracle with no fallback, OR material TVL is bridged collateral with unresolved bridge-operator centralization.
- unknown = cannot determine the dependency graph after checking source and verified contracts.`;
