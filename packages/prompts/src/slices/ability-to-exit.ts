export const abilityToExitBody = `### Slice: ABILITY-TO-EXIT

Evaluate whether users can withdraw their funds on their own terms, even under adversarial admin conditions.

MANDATORY INSPECTION CHECKLIST (every item below must appear in evidence[] OR unknowns[]):
- E1. Enumerate every user-facing exit function in the main contracts: withdraw, redeem, burn, requestWithdrawal, claim, exit, etc. List them by name. Do NOT treat the contract as a monolith.
- E2. For EACH exit function in E1: identify its access modifiers and any pause guards (e.g. _checkResumed, whenNotPaused, onlyRole). Functions that gate REQUEST PLACEMENT often differ from functions that CLAIM FINALIZED FUNDS — check both separately.
- E3. For each pause guard: identify the role holder (which address holds PAUSE_ROLE / GUARDIAN / etc.) and the maximum pause duration. Specifically check whether PAUSE_INFINITELY (or equivalent uncapped pause) is callable, and which actor can call it (single multisig vs governance vote). For role-holder reads use https://defipunkd.com/api/contract/read?chainId=<id>&address=0x...&method=hasRole&args=0x...,0x... or &method=getRoleAdmin&args=0x.... For "is currently paused" checks use &method=paused or &method=isPaused&args=<resume-code>. Use the BARE method name (no parens). Cite the URL with &block=<n> in evidence[].
- E4. EMERGENCY vs GOVERNANCE pause distinction: many protocols have a fast-acting emergency pause capped at N days and a slow governance pause that can be indefinite. Record both paths separately if present, with their time caps and actor classes.
- E5. Queued redemption: documented maximum queue duration, daily withdrawal caps, whether the queue itself is pausable.
- E6. Forced-exit / escape-hatch / permissionless emergency-exit mechanism for adversarial-admin scenarios.
- E7. Frontend dependency: confirm exit functions are directly callable on-chain (e.g. via Etherscan write tab or a generic wallet) without the project's frontend.

Then write the steel-man section per Hard Rule 11. Common red-vs-orange tension on this slice: indefinite pause exists (suggests red) BUT the realistic emergency path is time-capped AND claims of already-finalized exits are not pause-gated (suggests orange). Resolve this by stating who can do what for how long, not by stopping at the worst-case sentence.

Grade rules:
- green   = permissionless exit; pause is either absent, narrowly scoped to clearly-described emergencies with auto-expiry, or capped at ≤7 days; no frontend dependency for exit; claims of already-finalized exits are not pause-gated under any path.
- orange  = pausable with broad scope OR indefinite pause is reachable only through governance vote (not unilateral admin action), OR queued redemption with documented max > 7 days, OR claims-of-finalized are exempt but new-request placement can be paused indefinitely by governance.
- red     = exit requires admin signature, OR ANY actor (including governance) can pause CLAIMS of finalized exits indefinitely, OR there is no on-chain exit function at all (purely custodial), OR pause is held by a single EOA / 2-of-3 multisig with no time cap.
- unknown = checklist incomplete after checking the sources above.`;
