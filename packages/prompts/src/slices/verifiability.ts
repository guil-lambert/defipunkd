export const verifiabilityBody = `### Slice: VERIFIABILITY

Evaluate whether an outsider can independently confirm what the deployed code does.

MANDATORY INSPECTION CHECKLIST (every item below must appear in evidence[] OR unknowns[]):
- V1. For each address you assess: is the bytecode verified on the chain's block explorer? Record the "Contract Source Code Verified" indicator. If the contract is a proxy, verify BOTH the proxy contract AND the current implementation contract. An explorer "Similar Match" on a well-known proxy pattern (Aragon AppProxyUpgradeable, ERC1967Proxy, OssifiableProxy, OZ TransparentUpgradeableProxy) is expected for that pattern and does NOT count as a verification gap on its own — what matters is that the implementation is independently verified.
- V2. Source-to-repo correspondence: for each verified contract, attempt to find a matching commit in the linked GitHub repos. Record evidence[].commit on a match. Independent compile/bytecode-match is NOT required for green — a recognized public repo whose structure and file contents correspond to the explorer-visible source is sufficient. If you did not pin a commit SHA or run a bytecode diff, record that plainly in unknowns[] and proceed; it is a scope limit, not a downgrade signal.
- V3. Audit coverage: for each URL in protocol.audit_links, open it and record: auditor name, audit date, the specific contracts / commit in scope. Flag audits that predate the current deployment by >6 months without a follow-up review.
- V4. Auditor recognition: the following firms are broadly recognized in Solidity: Trail of Bits, Zellic, Spearbit, OpenZeppelin, ConsenSys Diligence, Certora (formal verification), Quantstamp, Halborn, Peckshield, Sigma Prime, ChainSecurity, Ackee Blockchain, MixBytes, Statemind. Unknown firms are orange-at-best for any green-grade claim. Name the firm explicitly in evidence[].
- V5. Post-audit drift: compare the most recent in-scope audit's commit/version against the currently-deployed source. If there have been non-trivial changes (new functions, modified access control, modified accounting) since, this is post-audit drift and downgrades the grade.
- V6. Implementation vs proxy: a verified proxy with an unverified implementation is effectively unverified. State whether the implementation is verified separately.

EVIDENCE DISCIPLINE (read before writing findings[]):
- Do not assert a specific deploy-commit SHA, bytecode equivalence, or "identical to audited commit" unless you actually fetched the artifact that shows it (e.g., a deployed-addresses JSON you opened, an explorer page you read). Inferred or plausible matches belong in unknowns[], never in findings[] or evidence[].
- Evidence[] entries must correspond to pages/files you actually retrieved this run. A URL you did not open is not evidence.

Then write the steel-man section per Hard Rule 11.

Grade rules:
- green   = deployed bytecode verified on the explorer (proxy AND implementation if proxied; "Similar Match" on a standard proxy pattern is fine per V1), a public source repo exists whose contents correspond to the explorer-visible source, AND ≥1 audit from a recognized firm covering the currently-deployed contracts (≤6 months of drift OR drift was re-audited). A missing local compile-match is not a downgrade — record it in unknowns[] and still grade green if the other conditions hold.
- orange  = verified but with visible drift from the public repo, OR audit scope is stale relative to deployment, OR only minor / unknown-firm audits exist, OR only some of the main contracts are verified, OR proxy verified but implementation only partially verified.
- red     = unverified bytecode (or verified proxy with unverified implementation), OR no audit in protocol.audit_links, OR no public repo.
- unknown = reserved for when the protocol's verifiability posture genuinely cannot be assessed (e.g., explorer and repo both inaccessible for this protocol). Do NOT use unknown merely because you, the analyst, could not run a particular check such as a bytecode diff — that goes in unknowns[] while the grade is still assigned from the evidence you do have.`;
