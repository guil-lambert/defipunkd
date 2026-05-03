export const controlBody = `### Slice: CONTROL

Evaluate who can change the protocol's rules, how fast, and how broadly.

(Step 0 capability probe and the off-chain-only fallback live in the preamble — those rules apply here.)

### MANDATORY INSPECTION CHECKLIST (every item below must appear in evidence[] OR unknowns[])

- **C1.** For each address you assess: who is the contract owner / admin / pendingAdmin / governor — read these via the block explorer's "Read Contract" tab OR \`https://defipunkd.com/api/contract/read?chainId=<id>&address=0x...&method=owner\` (BARE method names: \`&method=owner\`, \`&method=admin\`, \`&method=pendingOwner\`, \`&method=governor\`). For Safes use \`/api/safe/owners?chainId=<id>&address=0x...\`. When a protocol has multiple major versions deployed (v2/v3/v4), perform C1 reads on the NEWEST deployment separately — newer deployments often have weaker control surfaces than the legacy core.
- **C2.** Upgrade mechanism: transparent proxy / UUPS / Beacon / Diamond / immutable. Identify the proxy admin address. Check upgradeability of GOVERNANCE contracts too — a Governor / Aragon Voting / OZ Governor is often itself a proxy whose admin is the Timelock. Asymmetry: when fund-holding cores are immutable AND governance has no admin path that reaches them, an upgradable Governor/Timelock is T3-only and must NOT drag the verdict below green on that basis alone (see grade rules and the "immutable cores" caveat). Only call upgradability "mixed" if you can name a concrete function on the upgradable surface that reaches T1 or T2 on user funds.
- **C3.** EXECUTION PATH (enumerate every stage, in order, with delays in seconds). The operative path is usually a chain (voting → scheduler → timelock → executor; or governor → queue → execute; or Aragon Voting → DualGovernance → EmergencyProtectedTimelock → AdminExecutor). For each stage, record (a) the contract address, (b) the delay constant name + value in seconds, (c) the URL you read it from (block-explorer Read Contract OR \`/api/contract/read?...&method=MIN_DELAY&block=<n>\`). Do NOT stop at the first timelock-shaped contract — if its admin is itself called by another contract, keep walking. The grading delay is the SUM OF DELAYS ON THE UNCONTESTED FAST PATH (shortest time a proposal with no opposition can go from submission to executable). Dynamic / contested extensions (veto signaling, rage quit, escrow delay) are modifiers, not the basis — note them separately.
- **C4.** Enumerate EVERY multisig with reachable control — main proxy admin, emergency activation, emergency execution, reseal / pause, gate-seal committees, tiebreaker, per-module admins. For each Safe, fetch threshold + owners + version via \`/api/safe/owners?chainId=<id>&address=0x...\` (response includes raw eth_call data, so the URL is citable evidence). Enumerate ops/council/incentives multisigs even when off the upgrade path — record their scope so a reader can see they are NOT on the upgrade path. For each: (a) address, (b) threshold / total signers, (c) signer identities classified as insider (team, paid auditors under ongoing engagement, mandated service providers) vs non-insider (independent community members, unaffiliated researchers), (d) the specific power held (upgrade, pause, parameter, etc.).
- **C5.** On-chain governance: Governor / GovernorBravo / OZ Governor / Aragon Voting with token-weighted voting? Record proposal threshold, voting period, quorum, and the timelock delay between queue and execute. Every numeric constant must come from a Read Contract call you can link to, or be in unknowns[] with the C-code. If votingDelay / votingPeriod are denominated in BLOCKS, convert to seconds at the chain's CURRENT block time (Ethereum mainnet ≈ 12s post-Merge, not the 15s in older Compound/Bravo deployments) — cite both block count and converted seconds.
- **C6.** EMERGENCY POWERS: separate emergency-pause / guardian role with a different time cap or different actor than the main upgrade authority? Record it explicitly.
- **C7.** POWER TIER (blast radius). For each privileged path in C3–C6, classify the WORST thing that path can do, choosing the highest applicable tier. Cite the specific function name and any on-chain bound — tier claims without a named function are unsupported.
    - **T1 — FUND-CRITICAL**: replace implementation of contracts holding user funds; change AMM math / accounting / collateral logic; mint unbacked debt or shares; pause withdrawals; drain user-fund treasury; change oracle to attacker-controlled source; replace upgrade admin with EOA.
    - **T2 — ECONOMICALLY MATERIAL**: change fee parameters within bounded ranges; redirect protocol fees; add/remove markets / collateral types; bounded inflation or token mint within hard-capped schedule; spend protocol-owned (non-user) treasury.
    - **T3 — GOVERNANCE-INTERNAL**: change voting rules, quorum, voting period, proposal threshold; upgrade the Governor itself; rotate Timelock admin; mint governance tokens within a capped annual schedule.
    - **T4 — OPERATIONAL**: incentives distribution, grants, ENS / frontend canonicalization, deployment coordination, periphery router deprecation.
  The grade is set by the HIGHEST tier reachable on the uncontested fast path, not the median. State the tier and the binding function in the verdict.

### Read Contract discipline (applies to C3, C4, C5)

Every numeric constant cited (timelock delays, voting periods, multisig thresholds, quorum percentages) must come from EITHER (a) a block-explorer Read Contract URL, OR (b) a DeFiPunkd \`/api/contract/read\` or \`/api/safe/owners\` URL (preferred with \`&block=<n>\` for content-addressed evidence), OR (c) an unknowns[] entry with the C-code. Docs / blog posts are corroboration only — they cannot be the sole citation for a value that is also readable on-chain.

### Off-chain-only substitute hierarchy (when grading_basis="off-chain-only" — see preamble Rule 16)

When on-chain reads were genuinely unreachable this run, eligible off-chain substitutes in priority order:
1. Linked audit PDFs (admin roles, multisig members, timelock delays usually enumerated).
2. Governance forum posts that quote constants from a successful on-chain proposal (cite post URL + linked execution-tx URL).
3. Official protocol docs pages with named addresses and roles (must be on a domain owned by the protocol).
4. GitHub README / SECURITY.md / governance/*.md at a pinned commit SHA.

Forbidden substitutes: third-party blog posts, X / Twitter threads, search-result snippets, model memory. Required degradation: any C-code citing a numeric constant from docs/forum/audit prose ONLY must also carry an \`unknowns[]\` entry with \`-offchain\` suffix noting "value not re-read on-chain in this run; corroboration only".

### Grade rules (apply the timelock bar conditional on the highest C7 tier reachable on the fast path)

Security Council standard (used below): a multisig qualifies as "Security Council" only if ALL of: ≥7 signers, ≥51% threshold, ≥50% non-insider signers, every signer publicly announced. Failing any criterion = NOT a Security Council, regardless of signer reputation.

- **green**: highest reachable tier is T3 or T4 regardless of timelock; OR T2 reachable with uncontested-fast-path delay ≥7 days; OR T1 reachable only via immutable contracts (T1 is unreachable); OR T1 reachable with uncontested-fast-path delay ≥7 days combined with a Security Council multisig; OR T1 reachable with uncontested-fast-path delay ≥7 days through active on-chain governance with broad token distribution.
- **orange**: T2 reachable with uncontested-fast-path delay >0 but <7 days; OR T1 reachable with uncontested-fast-path delay >0 but <7 days; OR a multisig failing one or more Security Council criteria sits on a T1/T2 path; OR unclear upgrade authority on a T1/T2 path; OR governance with very short timelock or low quorum on a T1/T2 path.
- **red**: T1 reachable with no timelock by a single EOA or 2-of-3 multisig; OR a T1 upgrade admin that is not a smart contract you can audit.
- **unknown**: completed the checklist but still cannot determine the upgrade authority OR cannot classify the highest tier reachable on the main contracts.

Tiering caveats:
- "Bounded" must be enforced ON-CHAIN to count as T2. A function that sets fees with no upper-bound check is T1 — cite the bound check.
- Recurring T2 economic extraction (e.g. fee redirect with no rate limit) approaches T1 over time. A single proposal that can permanently redirect all future revenue is T1.
- T3 assumes the governance contract cannot itself authorize a T1/T2 action without going through the same timelock. If governance can self-upgrade to bypass the timelock, T3 collapses into T1.
- Do not downgrade tier by hand-waving ("realistically governance would never…"). Tier on what the contract permits, not what feels likely.

Notes:
- **Dynamic / dual-governance timelocks** (Lido, Compound escrow veto): the rubric grades on the uncontested path because that is the path most upgrades take. A dynamic extension that fires only under stake-weighted opposition is a real protection — name it in the green steel-man, but it does not lift an orange fast path into green; state the tension in the verdict.
- **Immutable cores with upgradable governance** (Uniswap-style): if fund-holding contracts are immutable and have no admin-reachable function moving / freezing / re-routing user funds, the highest reachable tier on the upgrade path is T3 — green regardless of timelock. Don't grade this orange just because the Governor is a proxy — that's a C2 fact, not a downgrade. Downgrade only applies if you can cite a concrete function on the upgradable surface that reaches T1 or T2 (privileged hook, upgradable factory controlling fund-routing, fee-switch redirecting protocol revenue without bound).
- **The 7-day bar** reflects the exit-window standard — users need notice after a queued upgrade to withdraw if they disagree. The ability-to-exit slice grades the exit side; this slice grades the delay side; both must hold for users to actually benefit from the delay.`;
