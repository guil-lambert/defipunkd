export const controlBody = `### Slice: CONTROL

Evaluate who can change the protocol's rules, how fast, and how broadly.

Examine (in this order):
1. For each address in address_book — or, if null, the contract addresses linked from protocol.website or the project's docs — the owner / admin / governor roles. On block explorers, check the "Read Contract" and "Contract" tabs for owner(), admin(), pendingAdmin(), governor().
2. Upgrade mechanism: is it a transparent proxy, UUPS proxy, Beacon proxy, Diamond (EIP-2535), or immutable? Who is the proxy admin?
3. Timelock: is the admin/owner a timelock contract? Record the minimum delay (MIN_DELAY / minDelay) in seconds.
4. Multisig config: if any admin is a Gnosis Safe, record threshold, signer count, and whether signers are EOAs or contracts. Flag when threshold is ≤ 2 or signers are mostly anonymous.
5. On-chain governance: is there a Governor / GovernorBravo / OpenZeppelin Governor contract with token-weighted voting? Record the timelock delay, proposal threshold, and voting period.

Grade rules:
- green   = immutable contracts, OR a long timelock (≥7 days) combined with a 4-of-7+ multisig of identified signers, OR active on-chain governance with ≥7-day timelock.
- orange  = shorter timelock (<7d but >0), OR 3-of-5 multisig with mostly anonymous signers, OR unclear upgrade authority.
- red     = a single EOA or 2-of-3 multisig can upgrade with no timelock, OR the upgrade admin is not a smart contract you can audit.
- unknown = you checked the sources above and still cannot determine the upgrade authority.`;
