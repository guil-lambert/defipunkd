export const accessBody = `### Slice: ACCESS

Evaluate who is allowed to use the protocol and whether any of that permission is granted off-chain.

Examine:
1. Whitelist / allowlist modifiers in user-facing entry points (deposit, borrow, mint, swap). Grep for "onlyWhitelisted", "onlyRole", "allowlist", "KYC", "isAccredited". Note which functions are gated.
2. Off-chain operators that must be running for the protocol to function: keepers, sequencers, privileged relayers, oracle posters. For each, identify whether the role is held by a single operator or is permissionless.
3. Frontend restrictions: check protocol.website for ToS language, geo-blocking (IP-based redirects), KYC walls, or "this product is not available in your jurisdiction" banners. These do not affect on-chain access but do affect real user access.
4. Sanctions / compliance tooling: does the protocol check addresses against OFAC lists or similar? Is there a blocklist contract?
5. Regional restriction signals: read the first screen of any ToS / Legal link. Record any jurisdictional exclusions verbatim.

Grade rules:
- green   = fully permissionless at contract level, no required off-chain operators, no frontend geo-restriction.
- orange  = on-chain permissionless but frontend restricts (geo-block, ToS jurisdictional exclusions), OR uses permissionless keepers with documented fallbacks if the keeper set dies.
- red     = contract-level whitelist / KYC, OR requires a specific privileged operator to function at all (if that operator disappears, the protocol halts).
- unknown = cannot determine access rules after checking the sources above.`;
