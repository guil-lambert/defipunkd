export const controlBody = `### Slice: CONTROL

Evaluate who can change the protocol's rules, how fast, and how broadly.

MANDATORY INSPECTION CHECKLIST (every item below must appear in evidence[] OR unknowns[]):
- C1. For each address you assess: who is the contract owner / admin / pendingAdmin / governor (read these on the block explorer's "Read Contract" tab).
- C2. Upgrade mechanism: transparent proxy / UUPS / Beacon / Diamond / immutable. Identify the proxy admin address.
- C3. Timelock: is the admin a timelock contract? Record minDelay / MIN_DELAY in seconds.
- C4. If any admin / proxy admin / timelock-proposer is a Gnosis Safe (or other multisig): record threshold and signer count. Note whether signers are EOAs vs known-identity addresses.
- C5. On-chain governance: is there a Governor / GovernorBravo / OZ Governor with token-weighted voting? Record proposal threshold, voting period, and the timelock delay between queue and execute.
- C6. EMERGENCY POWERS: is there a separate emergency-pause / guardian role with a different (often shorter) time cap or different actor than the main upgrade authority? Record it explicitly — many protocols separate "fast emergency multisig" from "slow governance upgrade."

Then write the steel-man section per Hard Rule 11.

Grade rules:
- green   = immutable contracts, OR a long timelock (≥7 days) combined with a 4-of-7+ multisig of identified signers, OR active on-chain governance with ≥7-day timelock and broad token distribution.
- orange  = shorter timelock (<7d but >0), OR 3-of-5 multisig with mostly anonymous signers, OR unclear upgrade authority, OR governance exists but with very short timelock or low quorum.
- red     = a single EOA or 2-of-3 multisig can upgrade with no timelock, OR the upgrade admin is not a smart contract you can audit.
- unknown = you completed the checklist but still cannot determine the upgrade authority for the main contracts.`;
