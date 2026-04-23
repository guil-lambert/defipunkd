export const verifiabilityBody = `### Slice: VERIFIABILITY

Evaluate whether an outsider can independently confirm what the deployed code does.

Examine:
1. For each address in address_book (or each address you discover from protocol.website / docs): is the bytecode verified on the chain's block explorer? Record the "Contract Source Code Verified" indicator.
2. Source-to-repo correspondence: does the verified source match any commit in the linked GitHub repos? If the repo tags releases, try to identify the commit used for deployment. Record evidence[].commit on a match.
3. Audit coverage: for each URL in protocol.audit_links, open it and record: the auditor, the audit date, the specific contracts / commit in scope, and whether the scope matches the currently-deployed contracts. Flag audits that predate the current deployment by >6 months without a follow-up.
4. Auditor quality: the following firms are broadly recognized as having a track record in Solidity: Trail of Bits, Zellic, Spearbit, OpenZeppelin, ConsenSys Diligence, Certora, Quantstamp (quality varies), Halborn, Peckshield. Unknown firms are orange at best for a green-grade claim.
5. Post-audit drift: compare the most recent audit's commit/version against the currently-deployed source. If there have been non-trivial changes since, note them.

Grade rules:
- green   = deployed bytecode verified, verified source compile-matches a specific commit in a public repo, AND ≥1 audit from a recognized firm covering the currently-deployed contracts (≤6 months of drift).
- orange  = verified but with diffs from the public repo, OR audit scope is stale relative to deployment, OR only minor / unknown-firm audits exist, OR only some of the main contracts are verified.
- red     = unverified bytecode, OR no audit in protocol.audit_links, OR no public repo.
- unknown = cannot determine verification status after checking block explorers and the linked repos.`;
