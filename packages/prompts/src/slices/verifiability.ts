export const verifiabilityBody = `### Slice: VERIFIABILITY

Evaluate whether an outsider can independently confirm what the deployed code does.

MANDATORY INSPECTION CHECKLIST (every item below must appear in evidence[] OR unknowns[]):
- V1. For each address you assess: is the bytecode verified on the chain's block explorer? Record the "Contract Source Code Verified" indicator. If the contract is a proxy, verify BOTH the proxy contract AND the current implementation contract.
- V2. Source-to-repo correspondence: for each verified contract, attempt to find a matching commit in the linked GitHub repos. Record evidence[].commit on a match. If you cannot match, say so explicitly in unknowns[] — "I confirmed the contract is verified but did not compile-match it to a repo commit" is a useful unknown.
- V3. Audit coverage: for each URL in protocol.audit_links, open it and record: auditor name, audit date, the specific contracts / commit in scope. Flag audits that predate the current deployment by >6 months without a follow-up review.
- V4. Auditor recognition: the following firms are broadly recognized in Solidity: Trail of Bits, Zellic, Spearbit, OpenZeppelin, ConsenSys Diligence, Certora (formal verification), Quantstamp, Halborn, Peckshield. Unknown firms are orange-at-best for any green-grade claim. Name the firm explicitly in evidence[].
- V5. Post-audit drift: compare the most recent in-scope audit's commit/version against the currently-deployed source. If there have been non-trivial changes (new functions, modified access control, modified accounting) since, this is post-audit drift and downgrades the grade.
- V6. Implementation vs proxy: a verified proxy with an unverified implementation is effectively unverified. State whether the implementation is verified separately.

Then write the steel-man section per Hard Rule 11.

Grade rules:
- green   = deployed bytecode verified (proxy AND implementation if proxied), verified source compile-matches a specific commit in a public repo, AND ≥1 audit from a recognized firm covering the currently-deployed contracts (≤6 months of drift OR drift was re-audited).
- orange  = verified but with diffs from the public repo, OR audit scope is stale relative to deployment, OR only minor / unknown-firm audits exist, OR only some of the main contracts are verified, OR proxy verified but implementation only partially verified.
- red     = unverified bytecode (or verified proxy with unverified implementation), OR no audit in protocol.audit_links, OR no public repo.
- unknown = checklist incomplete after checking block explorers and the linked repos.`;
