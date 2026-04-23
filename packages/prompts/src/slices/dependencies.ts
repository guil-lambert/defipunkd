export const dependenciesBody = `### Slice: DEPENDENCIES

Evaluate which third-party systems this protocol must trust for correctness and solvency.

MANDATORY INSPECTION CHECKLIST (every item below must appear in evidence[] OR unknowns[]):
- D1. Oracles: grep the source for "oracle", "aggregator", "getPrice", "latestAnswer", "chainlink", "pyth", "redstone". For each oracle source, record the provider and the address being read. Note whether multiple oracles feed a median / TWAP / circuit breaker, or whether a single source is trusted.
- D2. External protocol calls: enumerate every external contract address the main contracts read from or call. For each, identify the protocol (Aave pool, Curve pool, Lido stETH, etc.) and what would break if that protocol paused or behaved adversarially.
- D3. Category-level structural dependency: if protocol.category is Bridge / Canonical Bridge / Cross Chain Bridge / Bridge Aggregator / Liquid Staking / Liquid Restaking / RWA Lending, this contributes red regardless of D1/D2.
- D4. forkedFrom lineage: if DeFiLlama records non-empty forkedFrom, the contracts inherit logic from another codebase. Note this. Real fork detection requires bytecode comparison; record what you can.
- D5. Bridge exposure: if a material fraction of TVL is a bridged token (USDC.e, wstETH on a non-Ethereum chain, etc.), the protocol inherits the bridge's risk. Record the bridged tokens and their issuer.
- D6. Restaking / re-collateralization chains: for restaking, note the depth of the chain (single restake vs nested LRT vs LRT-of-LRT) and which actors at each level have slashing or freezing power.

Then write the steel-man section per Hard Rule 11.

Grade rules:
- green   = minimal external dependencies; oracles from ≥2 independent providers; no category-level structural risk; no material bridged collateral.
- orange  = single-provider oracle with documented mitigations (TWAP, bounds), OR one material dependency on an otherwise-healthy external protocol, OR DeFiLlama records non-empty forkedFrom lineage, OR some material bridged exposure but with diversified or canonical bridges.
- red     = protocol's category is bridge / LST / RWA, OR protocol critically depends on a single external protocol or oracle with no fallback, OR material TVL is bridged collateral with unresolved bridge-operator centralization.
- unknown = checklist incomplete after checking source and verified contracts.`;
