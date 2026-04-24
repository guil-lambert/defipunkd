export const preamble = `You are contributing a single-slice assessment to defipunkd, a git-native transparency registry for DeFi protocols. Your JSON output will be attached to a pull request and compared against ≥2 other independent runs. Disagreements are surfaced publicly — be conservative, cite everything, return grade="unknown" when a signal cannot be determined, and resist stopping at the first damning finding.

### Pinned inputs (do not infer; these are ground truth)
- protocol.slug:              {{slug}}
- protocol.name:              {{name}}
- protocol.chains:            {{chains}}
- protocol.category:          {{category}}
- protocol.website:           {{website}}
- protocol.github:            {{github_urls}}
- protocol.audit_links:       {{audit_urls}}
- snapshot.generated_at:      {{snapshot_generated_at}}
- analysis_date:              {{analysis_date}}
- prompt_version:             {{prompt_version}}
- address_book:               {{addresses_or_null}}

### Hard rules
1. Treat your training data as potentially stale. Facts about this protocol must be sourced from a URL you can cite in evidence[]. Do not claim anything you have not just verified.
2. Only these source classes count as evidence:
   a) Public block explorers (etherscan.io, basescan.org, arbiscan.io, optimistic.etherscan.io, etc.) for the addresses above or addresses you discover transitively from them.
   b) The linked GitHub repos, at a specific commit SHA you record in evidence[].commit.
   c) The audit PDFs or reports linked above.
   d) DeFiLlama's pinned fields (for category / chain lists only — not for risk assessment).
3. If you cannot find a signal after checking the sources above, set grade="unknown" with at least one entry in unknowns[] naming what you looked for and why you could not determine it.
4. Every factual claim in rationale must map to at least one evidence[] entry.
5. Output exactly one JSON object matching the output contract at the end of this prompt, wrapped in a single fenced code block with language tag "json" (\`\`\`json ... \`\`\`). This gives the chat UI's copy button a clean single-click copy of the JSON content (the fence is stripped automatically). Nothing before or after the fence — no prose, no explanations, no summary, no follow-up questions. The fence is the ONLY thing that should wrap the JSON; do not nest additional fences inside it.

### Format rules (validation will reject submissions that violate these)
6. evidence[].url must be a bare URL string starting with https:// or http://. NEVER wrap it in markdown link syntax. Concretely:
     CORRECT:   "url": "https://etherscan.io/address/0x889edC2e..."
     WRONG:     "url": "[https://etherscan.io/address/0x889edC2e...](https://etherscan.io/address/0x889edC2e...)"
     WRONG:     "url": "[Etherscan: 0x889edC2e...](https://etherscan.io/address/0x889edC2e...)"
   This rule applies even when your default JSON serializer or your platform's chat formatting tries to auto-link URLs. The string inside the JSON quotes must be the URL and nothing else.
7. evidence[].commit, when present, must be a hex commit SHA between 7 and 40 characters, lowercase, matching ^[0-9a-f]{7,40}$. NEVER use branch names ("main", "master", "develop", "head"), tag names, or any non-hex value. Prefer full 40-char SHAs over 7-char shorts when you have them. If you cannot pin a commit SHA, omit the field — do not substitute a branch name.
8. evidence[].fetched_at, when present, must be an ISO-8601 datetime in UTC (e.g. 2026-04-23T11:20:00Z). Include it whenever you actually fetched the URL during this run.
9. evidence[].address, when present, must be a 0x-prefixed 40-hex-char EVM address. Mixed case is fine; checksum is not validated.
10. Checklist codes (used in both rationale.findings[].code and as prefixes on unknowns[] entries) must match the regex /^[A-Z][A-Za-z0-9-]{0,15}$/ — they start with an uppercase letter and may include digits, letters, and hyphens, up to 16 chars total. Examples: "E1", "A3b", "C2-emergency", "V4a", "V4-auditor". DO NOT use parentheses, spaces, dots, slashes, or underscores. If a slice body defines a code (e.g. "A3b") use it verbatim; do not invent sub-codes like "A3b(alt)" or "A3-passive" unless the slice body explicitly introduces them. unknowns[] entries must be prefixed with the relevant checklist code followed by a colon (e.g. "A3b: frontend fetch failed") so reviewers can map an unknown back to the inspection step. Free-form unknowns without a checklist prefix are accepted but downweighted.
11. chat_url: ALWAYS set this field to null in your output. You cannot generate this URL yourself — the default share links produced by Claude, ChatGPT, and Gemini require viewer login (private/account-scoped) and are not publicly readable. The user will enable the "Share publicly" toggle on this conversation after you respond, then paste the resulting public URL into the JSON before opening the PR. Do not invent or guess a chat_url; do not paste your platform's default share link. Public-sharing is a deliberate user action that produces a different URL than the one available to you.

### Thoroughness rules (the difference between a useful submission and a noisy one)
12. Each per-slice body below contains a "MANDATORY INSPECTION CHECKLIST". For every item on it, you must EITHER produce an evidence[] entry that addresses it OR add a specific entry to unknowns[] naming that item by code (per Format Rule 10). Submissions with empty unknowns[] that silently skip checklist items will be rejected as incomplete by reviewers.
13. Before assigning a grade other than "unknown", rationale.steelman must contain a one-sentence strongest argument for each of the three plausible grades (red / orange / green), and rationale.verdict must state which one best fits the evidence and why. This forces you past the first-damning-finding stopping point. If the steel-man for the grade you're picking is weaker than the steel-man for an adjacent grade, you have probably picked the wrong grade. When grade="unknown", set rationale.steelman to null and use rationale.verdict to summarize what blocked the assessment (which checklist items are unresolved).
14. Distinguish actor classes when assessing pause / upgrade / control powers: an EOA, a 2-of-3 multisig, a 4-of-7+ multisig with identified signers, an emergency-scoped time-capped multisig, and an on-chain governance vote with a timelock are NOT equivalent. State which actor class holds each power and what its time bound is, if any. "An admin can pause" is insufficient — say which admin and for how long.
15. Distinguish function classes when assessing exit / access powers: claim-of-finalized vs new-request-placement, deposit vs borrow, mint vs redeem may have different access controls and pause guards. Enumerate each entry/exit function separately rather than treating the contract as a monolith.
16. For slices that make claims about on-chain state (control, ability-to-exit, autonomy, verifiability), evidence[] must include AT LEAST ONE block-explorer URL pointing at the deployed contract being assessed. Source repositories tell you what the code SHOULD do; the deployed contract tells you what it ACTUALLY does today. Submissions with zero block-explorer URLs on these slices will be downweighted by the quorum bot regardless of grade. The "access" slice is exempt when its claims are entirely about frontend / off-chain operator behavior.
17. Prompt-level meta-check (applies to every slice, run it before finalizing): If your verdict quotes prompt language as evidence for a grade, re-do the verdict — the prompt is describing the rubric, not the protocol. Evidence must cite what THIS protocol does (contracts, docs, ToS quotes, explorer pages), never what the rubric says a protocol of type X would do. Phrases like "the protocol meets the 'documented fallback' condition" or "this satisfies the 'credible alternatives' rule" are rubric echoes, not evidence; rewrite the verdict with concrete citations or downgrade to grade="unknown".

### Protocol metadata refresh (populate protocol_metadata in the output)
The pinned inputs above come from DeFiLlama and may be stale, incomplete, or wrong. As a side-effect of this assessment you must also populate the \`protocol_metadata\` object in the JSON output with anything you verify during your investigation. Treat this as a best-effort refresh of the protocol's summary record — leave fields null / empty arrays if you did not verify them in this run (do NOT copy the pinned input values through; null means "not re-verified this run", which is different from "confirmed same as pinned").

Fields to populate (all optional, but fill what you find):
- \`github\`: array of canonical source-code repo URLs (may include monorepos + satellite repos). One string per URL.
- \`docs_url\`: string — the canonical developer / protocol documentation site.
- \`audits\`: array of \`{ firm, url, date }\` objects for each audit report you can locate (date as YYYY-MM or YYYY-MM-DD, firm as the auditor's name, url as the report PDF or summary page).
- \`governance_forum\`: string — URL of the primary discussion forum used for governance proposals (e.g. Discourse, Commonwealth).
- \`voting_token\`: \`{ chain, address, symbol }\` or null — the ERC-20 used for governance voting. Omit / null if the protocol is not token-governed.
- \`bug_bounty_url\`: string — public bug bounty program page (Immunefi, HackerOne, self-hosted).
- \`security_contact\`: string — private-disclosure channel. Prefer a security@ email or a SECURITY.md URL in the repo. This is the channel to report a vulnerability privately, distinct from the public bug bounty.
- \`deployed_contracts_doc\`: string — URL of the docs page that lists deployed contract addresses per chain. Do NOT enumerate addresses here — just link the canonical index.
- \`admin_addresses\`: array of \`{ chain, address, role, actor_class }\` — multisig / timelock / owner addresses that hold privileged powers. \`actor_class\` is one of \`"eoa"\`, \`"multisig"\`, \`"timelock"\`, \`"governance"\`, \`"unknown"\`. Include these because they are the anchors for future control / exit assessments.
- \`upgradeability\`: one of \`"immutable"\`, \`"upgradeable"\`, \`"mixed"\`, \`"unknown"\`. "mixed" means some core contracts are immutable and others are behind proxies.
- \`about\`: string — a concise 2–4 sentence plain-English description of what the protocol actually does, who uses it, and what makes it distinctive. Write for an informed DeFi reader who may not have heard of this specific protocol. Avoid generic filler ("X is a protocol on Ethereum"); name the primary user action (stake, borrow, swap, bridge, mint, redeem), the asset or market it operates on, and the concrete mechanism if it has one (liquid staking receipt token, isolated lending pools, constant-product AMM, intents auction, etc.). Mention the governance token or DAO only if it is load-bearing to what the protocol does. Do NOT restate the category, chain list, or TVL — those are shown elsewhere. Leave null only if you genuinely cannot determine what the protocol does from the sources available.

Every non-null field in \`protocol_metadata\` must be backed by at least one entry in \`evidence[]\` (the same evidence array used for the slice assessment — a single URL can support both the slice grade and a metadata field). If you cannot verify a field, leave it null / empty rather than guessing.`;
