export const controlBody = `### Slice: CONTROL

Evaluate who can change the protocol's rules, how fast, and how broadly.

MANDATORY INSPECTION CHECKLIST (every item below must appear in evidence[] OR unknowns[]):
- C1. For each address you assess: who is the contract owner / admin / pendingAdmin / governor (read these on the block explorer's "Read Contract" tab).
- C2. Upgrade mechanism: transparent proxy / UUPS / Beacon / Diamond / immutable. Identify the proxy admin address.
- C3. EXECUTION PATH (enumerate every stage, in order, with its delay in seconds).
  Modern protocols rarely have a single timelock — the operative path is usually a chain of contracts (e.g. voting contract → scheduler → timelock → executor, or governor → queue → execute, or Aragon Voting → DualGovernance → EmergencyProtectedTimelock → AdminExecutor). Walk the full call chain from "vote passes" to "implementation slot written." For each stage, record:
    a) the contract address,
    b) the delay constant (name + value in seconds),
    c) the Read Contract function / storage slot you read it from.
  Do NOT stop at the first timelock-shaped contract you find — if the admin of the core proxy is itself called by a further contract, keep walking.
  The timelock that matters for grading is the SUM OF DELAYS ON THE UNCONTESTED FAST PATH — the shortest time a proposal with no opposition can go from submission to executable state. Dynamic / contested extensions (veto signaling, rage quit, escrow-based delay) are modifiers, not the basis — note them separately.
- C4. If any admin / proxy admin / timelock-proposer is a Gnosis Safe (or other multisig): record threshold and signer count. Note whether signers are EOAs vs known-identity addresses.
- C5. On-chain governance: is there a Governor / GovernorBravo / OZ Governor / Aragon Voting with token-weighted voting? Record proposal threshold, voting period, quorum, and the timelock delay between queue and execute. Every numeric constant you cite here must either come from a Read Contract call you can link to, or be listed in unknowns[] prefixed with its checklist code.
- C6. EMERGENCY POWERS: is there a separate emergency-pause / guardian role with a different (often shorter) time cap or different actor than the main upgrade authority? Record it explicitly — many protocols separate "fast emergency multisig" from "slow governance upgrade."

### Read Contract discipline (applies to C3, C4, C5)

Every numeric constant you cite — timelock delays, voting periods, multisig thresholds, quorum percentages, proposal thresholds — must come from ONE of:
  (a) a block-explorer Read Contract view function call, cited with a URL and fetched_at; or
  (b) an entry in unknowns[] prefixed with the checklist code.

Citing a docs page or blog post as the sole source for a value that is also readable on-chain is not enough — docs and blog posts drift, on-chain constants do not. Docs are fine as CORROBORATION but cannot be the only citation. Empty unknowns[] on a protocol with more than ~3 admin-class contracts will be flagged by the quorum bot as suspiciously thorough-looking; if you did not actually read a given constant on-chain during this run, say so in unknowns[].

Then write the steel-man section per Hard Rule 11.

Grade rules:
- green   = immutable contracts, OR uncontested-fast-path delay ≥7 days combined with a 4-of-7+ multisig of identified signers, OR active on-chain governance with uncontested-fast-path delay ≥7 days and broad token distribution.
- orange  = uncontested-fast-path delay >0 but <7 days (even if a dynamic / contested timelock can extend above 7 days — note the extension as a steel-man for green, but grade on the fast path), OR 3-of-5 multisig with mostly anonymous signers, OR unclear upgrade authority, OR governance exists but with very short timelock or low quorum.
- red     = a single EOA or 2-of-3 multisig can upgrade with no timelock, OR the upgrade admin is not a smart contract you can audit.
- unknown = you completed the checklist but still cannot determine the upgrade authority for the main contracts.

Note on dynamic / dual-governance timelocks (Lido-style, Compound-style escrow veto, etc.): the rubric grades on the uncontested path deliberately, because that is the path most upgrades actually take. A dynamic extension that only fires under stake-weighted opposition is a real user protection and should be named in the green steel-man, but it does not lift an orange fast path into green — state this tension in the verdict rather than collapsing it.`;
