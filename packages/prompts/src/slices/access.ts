export const accessBody = `### Slice: ACCESS

Evaluate who is allowed to use the protocol and whether any of that permission is granted off-chain.

MANDATORY INSPECTION CHECKLIST (every item below must appear in evidence[] OR unknowns[]):
- A1. Whitelist / allowlist modifiers in user-facing entry points. Grep for "onlyWhitelisted", "onlyRole", "allowlist", "isAccredited", "isKYCed". Note which functions are gated and who can add/remove from the list.
- A2. Off-chain operators required for the protocol to function: keepers, sequencers, privileged relayers, oracle posters. For each, identify whether the role is held by a single operator or is permissionless (anyone can call), and what happens if the operator set goes offline.
- A3. Frontend restrictions: load protocol.website (or check screenshots / archive) for ToS jurisdictional exclusions, geo-blocking (IP redirects), KYC walls, or "not available in your jurisdiction" banners. Quote the relevant text in evidence[].shows.
- A4. Sanctions / compliance tooling: does the protocol check addresses against OFAC lists or similar onchain blocklists?
- A5. Differentiate read access vs write access: many protocols are read-permissionless (anyone can view state) but write-gated (only certain addresses can deposit/borrow). Record both.
- A6. ToS / Legal links: locate them on the website and record any jurisdictional exclusions verbatim. If you cannot reach the website, record the ToS URL in unknowns[] rather than guessing.

Then write the steel-man section per Hard Rule 11.

Grade rules:
- green   = fully permissionless at contract level, no required off-chain operators (or operators are permissionless and have documented fallbacks), no frontend geo-restriction.
- orange  = on-chain permissionless but frontend restricts (geo-block, ToS jurisdictional exclusions), OR uses permissionless keepers with documented fallbacks if the keeper set dies.
- red     = contract-level whitelist / KYC, OR requires a specific privileged operator to function at all (if that operator disappears, the protocol halts), OR enforces an onchain blocklist that can be updated by a single party.
- unknown = checklist incomplete after checking the sources above.`;
