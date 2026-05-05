export const accessBody = `### Slice: OPEN-ACCESS

Evaluate who is allowed to use the protocol and whether any of that permission is granted off-chain.

Scope: this slice is about ADMISSION — who can enter, exit, or transact. Operator LIVENESS (what breaks if keepers/oracles go offline) is assessed in the dependencies slice and is out of scope for the grade here. You may note operator dependencies as context, but do not let "the protocol halts if operator X disappears" drive the access grade on its own; that belongs in dependencies. Source verification / contract verification on block explorers is assessed in the verifiability slice and is out of scope here — do NOT let "contract is unverified" drive the access grade.

Framing: the smart contracts are the access layer; frontends are UX. A permissionless contract is reachable by any client (SDK, third-party UI, aggregator, wallet integration). Frontend ToS, IP geo-blocking, and wallet screening are publisher policies on one specific client — they are reported as context but do NOT determine the grade. The grade hinges on (1) what the contract itself permits, and (2) whether the protocol is practically reachable without the official publisher's cooperation.

Meta-check before finalizing: if your verdict cites phrases from this prompt as evidence ("the protocol meets the 'credible alternatives' condition", "this fits the 'documented fallback' rule"), redo the verdict. The prompt describes the rubric; evidence must come from the protocol. A verdict should cite what the protocol does, not what the rubric says.

MANDATORY INSPECTION CHECKLIST (every item below must appear in evidence[] OR unknowns[]):
- A1. Whitelist / allowlist modifiers in user-facing entry points. Grep for "onlyWhitelisted", "onlyRole", "allowlist", "isAccredited", "isKYCed". Note which functions are gated and who can add/remove from the list.
- A2. Off-chain operators in the admission path: keepers, sequencers, privileged relayers, oracle posters whose approval is required to admit a user action (not just to keep the protocol live). For each, identify whether the role is held by a single operator, a permissioned committee, or is permissionless. Enumerate per user-facing function class (deposit vs withdraw-request vs claim-finalized vs transfer) which ones require operator approval to be admitted, and which ones admit users unconditionally. A function whose placement is unconditional but whose downstream settlement depends on an operator is an admission-permissionless function — flag the liveness dependency as context and defer its grading weight to the dependencies slice.
- A3. Frontend restrictions on the official interface — record as context, not as a grade lever. Distinguish:
    - A3-passive: boilerplate ToS clauses (sanctions attestation, restricted-territory self-certification, VPN-circumvention prohibition, "comply with applicable law" eligibility, age of majority).
    - A3-active: runtime enforcement — IP-based geo-blocking, wallet-address screening against a sanctions oracle (Chainalysis, TRM, Elliptic), KYC wall, rendering-blocking jurisdiction banner.
  Record findings under the correct tier. Quote ToS text or banner text in evidence[].shows. These findings populate the headline and rationale but do NOT move the grade by themselves; the grade is set by A1, A2, and the A3b path check below.
- A3b. Independent access paths (the operative grade input). Enumerate paths that do not require the official publisher's cooperation:
    - Published SDK / library / CLI for direct contract interaction.
    - Third-party frontends operated by separate legal entities.
    - Wallet-integrated access (MetaMask Swaps, Safe apps, etc.).
    - DEX / lending / yield aggregators that route through the contracts.
  Record at least one concrete link per path that exists. The protocol does NOT have to self-document these — the test is existence, not UX cost. An A3b-i redistribution of the official UI bound by the same ToS does NOT count as an independent path.
- A4. Sanctions / compliance tooling at the contract level: does the protocol check addresses against OFAC lists or similar on-chain blocklists in the contract itself? (Frontend-only screening belongs in A3.)
- A5. Differentiate read access vs write access: many protocols are read-permissionless (anyone can view state) but write-gated (only certain addresses can deposit/borrow). Record both.
- A6. ToS / Legal links: locate them on the website and produce a VERBATIM quote of any jurisdictional, sanctions, or eligibility clause in evidence[].shows. If you cannot extract the clause text verbatim (SPA render failure, paywall, dead link, etc.), do NOT paraphrase or infer from general knowledge — record the ToS URL in unknowns[] with the reason extraction failed. Assertions about ToS content without a verbatim quote will be downweighted by reviewers.

Then write the steel-man section per Hard Rule 11.

Grade rules (admission-focused; liveness concerns belong in dependencies; source verification belongs in verifiability):
- green   = no contract-level whitelist/KYC on user entry/exit; no operator approval required to admit a user action; AND at least one independent A3b path exists (published SDK, third-party frontend, wallet integration, or aggregator routing). Frontend ToS posture and A3-active enforcement on the official UI do NOT block green when contracts are permissionless and an independent path exists — they are reported as context.
- orange  = contracts admit users unconditionally, BUT the protocol is operationally captured by the official publisher: no published SDK, no third-party frontend, no wallet integration, no aggregator routing. The contract is theoretically open but practically reachable only through the official UI. Also applies when admission requires approval from a permissioned committee that is governance-managed with a documented replacement procedure.
- red     = contract-level whitelist / KYC on user entry/exit, OR admission of a core user action requires approval from a single privileged operator or a small committee with no documented replacement procedure, OR enforces an on-chain blocklist updatable by a single party.
- unknown = checklist incomplete after checking the sources above.

Default-grade guidance: when contracts are fully permissionless AND any A3b independent path exists, the default grade is green regardless of frontend ToS or A3-active enforcement on the official UI. Frontend geo-blocking, sanctions-oracle wallet screening, and ToS sanctions clauses are publisher policies on one client and are reported in findings/headline as context, not as grade levers. To grade orange on operational-capture grounds, the auditor must affirmatively show that ALL independent paths are absent or also gated.

Guideline on committees: where admission depends on a multi-operator committee, the relevant axes are (a) set size, (b) whether replacement/rotation is governed on-chain, (c) whether the replacement procedure is publicly documented. A large set with on-chain governance replacement should not be graded as a single-party operator even if rotation is not instantaneous. A small set with informal replacement should be treated as a single-party operator.`;
