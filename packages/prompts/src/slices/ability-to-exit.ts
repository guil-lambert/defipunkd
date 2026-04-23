export const abilityToExitBody = `### Slice: ABILITY-TO-EXIT

Evaluate whether users can withdraw their funds on their own terms, even under adversarial admin conditions.

Examine:
1. Withdrawal / redeem / burn / exit functions in the main contracts. Are they callable directly by token holders, or gated by a role / whitelist?
2. Pause switches on those functions. Identify who holds the pause role. Can it be held indefinitely, or does it auto-expire? Is there documented scope (e.g. "pause only in hack emergencies")?
3. Queued redemptions: for vaults, LSTs, and RWA protocols, what is the documented maximum queue duration? Are there daily withdrawal caps? Is the queue itself pausable?
4. Forced-exit / escape-hatch mechanisms: in the event of malicious admin behavior, is there a permissionless path for users to recover their collateral (e.g. force-exit to L1 for rollups, direct collateral claim for lending markets)?
5. Frontend dependency: does exiting require the project's frontend to be live, or can users call the exit function directly on-chain?

Grade rules:
- green   = permissionless exit; pause is either absent, narrowly scoped to clearly-described emergencies, or auto-expiring; no frontend dependency for exit.
- orange  = pausable with broad scope, OR queued redemption with documented max > 7 days, OR frontend-dependent exit path.
- red     = exit requires admin signature, OR can be paused indefinitely with no override, OR there is no on-chain exit function at all (purely custodial).
- unknown = cannot determine after checking the sources above.`;
