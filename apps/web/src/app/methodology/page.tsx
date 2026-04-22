import { PIZZA_SLICES, PizzaChart } from "../../components/PizzaChart";

export const dynamic = "force-static";

export const metadata = {
  title: "Methodology · DefiBeat",
};

const SLICE_DESCRIPTIONS: Record<string, string> = {
  control:
    "Who holds admin privileges, how contracts can be upgraded, and how quickly. Combines the old chain-ownership and upgradeability questions — a single assessment per protocol rather than per chain, since a one-chain-red / mainnet-green split is more misleading than useful.",
  "ability-to-exit":
    "Whether users can exit on their own terms if the protocol team disappears or acts adversarially.",
  dependencies:
    "Third-party protocols the contracts rely on: oracles, bridges, yield wrappers, stable issuers, and collateral counterparties. The Kelp\u2009\u2194\u2009Aave unwind is a recent reminder that collateral exposure is just another dependency, so it lives in this slice rather than alone.",
  access:
    "Whether the protocol depends on privileged operators, off-chain infrastructure, whitelists, or regional restrictions to function.",
  verifiability:
    "Whether anyone outside the team can independently verify what the code does: open-source status, audit quality and scope, bytecode-to-source correspondence at the deployed address, and whether post-audit changes were themselves reviewed.",
};

export default function MethodologyPage() {
  return (
    <main
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: "2rem 1.5rem",
        color: "#e2e8f0",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ color: "#22d3ee", marginBottom: "0.5rem" }}>Methodology</h1>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>
        DefiBeat is a registry, not a rating. No protocol on this site has been reviewed.
      </p>

      <h2 style={{ color: "#e2e8f0", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem" }}>
        Where the data comes from
      </h2>
      <p>
        Every protocol is seeded from{" "}
        <a
          href="https://defillama.com/"
          style={{ color: "#22d3ee" }}
          rel="noreferrer"
          target="_blank"
        >
          DeFiLlama
        </a>{" "}
        via{" "}
        <code style={{ color: "#cbd5e1" }}>pnpm sync</code>, which writes the full list into a
        committed JSON snapshot. Human curators can override individual fields by dropping a JSON
        file into <code style={{ color: "#cbd5e1" }}>data/overlays/</code> and opening a PR.
      </p>
      <p>
        Every field displays a provenance tag so you always know where the value came from:
        <code style={{ color: "#cbd5e1", marginLeft: 6 }}>[defillama]</code> for the raw DeFiLlama
        value, <code style={{ color: "#cbd5e1" }}>[curated]</code> for a human-authored overlay,
        and <code style={{ color: "#cbd5e1" }}>[defillama-parent]</code> when a child protocol
        inherits a field (github, twitter, website) from its parent protocol because DeFiLlama
        only records the value at the family level.
      </p>
      <p>
        DefiBeat mirrors DeFiLlama: if DeFiLlama delists a protocol, DefiBeat delists it after a
        14-day grace window.
      </p>

      <h2 style={{ color: "#e2e8f0", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem", marginTop: "2rem" }}>
        The 5-slice risk pizza
      </h2>
      <p>
        DefiBeat uses the five assessment dimensions from{" "}
        <a
          href="https://github.com/deficollective/defiscan-v2"
          style={{ color: "#22d3ee" }}
          rel="noreferrer"
          target="_blank"
        >
          DeFiScan v2
        </a>
        : <strong style={{ color: "#cbd5e1" }}>Control</strong>,{" "}
        <strong style={{ color: "#cbd5e1" }}>Ability to exit</strong>,{" "}
        <strong style={{ color: "#cbd5e1" }}>Dependencies</strong>,{" "}
        <strong style={{ color: "#cbd5e1" }}>Access</strong>, and{" "}
        <strong style={{ color: "#cbd5e1" }}>Verifiability</strong>. At Phase 0 every slice is
        gray — nothing has been reviewed. The slices exist now so the shape of future assessments
        is already visible.
      </p>
      <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <PizzaChart size="lg" />
        <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1, minWidth: 300 }}>
          {PIZZA_SLICES.map((s) => (
            <li key={s.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid #1e293b" }}>
              <strong style={{ color: "#cbd5e1" }}>{s.label}</strong>
              <br />
              <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                {SLICE_DESCRIPTIONS[s.id]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <h2 style={{ color: "#e2e8f0", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem", marginTop: "2rem" }}>
        What is graded today
      </h2>
      <p>
        Only{" "}
        <strong style={{ color: "#cbd5e1" }}>Verifiability</strong> currently carries a real color
        on the pizza. The rule is a deliberately coarse first-pass heuristic from raw DeFiLlama
        signals:
      </p>
      <ul style={{ color: "#cbd5e1" }}>
        <li>
          <strong style={{ color: "#16a34a" }}>green</strong> — protocol has a GitHub repo{" "}
          <em>and</em> at least one audit
        </li>
        <li>
          <strong style={{ color: "#f59e0b" }}>orange</strong> — it has one but not the other
        </li>
        <li>
          <strong style={{ color: "#dc2626" }}>red</strong> — neither
        </li>
      </ul>
      <p>
        For family rows (Uniswap, Aave, Morpho, &hellip;) the family&rsquo;s slice takes the grade
        of the highest-TVL child so a small outlier deployment doesn&rsquo;t drag a well-graded
        family down. A thorough Verifiability assessment in a later phase will replace this with
        auditor-reputation weighting, scope review, and source-to-bytecode correspondence.
      </p>
      <p>
        <strong style={{ color: "#cbd5e1" }}>Dependencies</strong> is graded with a simple
        category-based first pass plus an opportunistic <code style={{ color: "#cbd5e1" }}>forkedFrom</code>{" "}
        check:
      </p>
      <ul style={{ color: "#cbd5e1" }}>
        <li>
          <strong style={{ color: "#dc2626" }}>red</strong> — protocol category is{" "}
          <em>Liquid Staking</em>, <em>RWA Lending</em>, or one of the bridge categories
          (<em>Bridge</em>, <em>Canonical Bridge</em>, <em>Cross Chain Bridge</em>,{" "}
          <em>Bridge Aggregator</em>). These categories carry unavoidable external-protocol,
          validator, or counterparty risk by construction.
        </li>
        <li>
          <strong style={{ color: "#f59e0b" }}>orange</strong> — DeFiLlama records a non-empty{" "}
          <code style={{ color: "#cbd5e1" }}>forkedFrom</code> lineage, i.e. the contracts
          inherit their base logic from another protocol&rsquo;s codebase. DeFiLlama&rsquo;s
          fork-lineage data is largely paywalled, so this signal currently covers only a handful
          of protocols &mdash; real fork detection is Phase-2 work.
        </li>
        <li>
          <strong style={{ color: "#334155" }}>gray</strong> — neither signal fires. Most
          protocols sit here until deeper dependency analysis lands.
        </li>
      </ul>
      <p>
        <strong style={{ color: "#cbd5e1" }}>Control</strong>,{" "}
        <strong style={{ color: "#cbd5e1" }}>Ability to exit</strong>, and{" "}
        <strong style={{ color: "#cbd5e1" }}>Access</strong> all render gray — no automated
        heuristic grades them yet. In particular,{" "}
        <strong style={{ color: "#cbd5e1" }}>Access</strong> (whether the protocol is permissioned,
        uses whitelists, geo-restricts users, or depends on off-chain operators to function) is
        not a signal DeFiLlama carries in a usable form, so at Phase 0 we simply surface it as
        unknown and will populate it when crawler workers read the project&rsquo;s own docs and
        frontend (Phase 1) and when onchain discovery flags whitelist-gated entry points (Phase 2).
      </p>

      <h2 style={{ color: "#e2e8f0", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem", marginTop: "2rem" }}>
        Audits and source code feed Verifiability
      </h2>
      <p>
        Each protocol detail page shows the raw audit count, expandable list of audit links, and
        the project&rsquo;s GitHub repositories. These feed the Verifiability slice, not a slice
        of their own: an audit count is a famously weak signal in isolation — auditor quality,
        report scope, and whether post-audit changes were reviewed matter far more than the
        integer. GitHub is surfaced so you can check whether the deployed addresses match the
        published source. At Phase 0 the data is raw and the slice stays gray; a future phase
        will grade auditor reputation and source-to-bytecode correspondence as part of the
        Verifiability assessment.
      </p>

      <h2 style={{ color: "#e2e8f0", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem", marginTop: "2rem" }}>
        Stages
      </h2>
      <p>
        Stage badges arrive with Phase 3 of the project, at which point DefiBeat adopts{" "}
        <a
          href="https://docs.defiscan.info/"
          style={{ color: "#22d3ee" }}
          rel="noreferrer"
          target="_blank"
        >
          DeFiScan v2&rsquo;s stage framework
        </a>{" "}
        verbatim. Until then, every protocol shows an em-dash in the Stage column.
      </p>

      <h2 style={{ color: "#e2e8f0", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem", marginTop: "2rem" }}>
        Corrections
      </h2>
      <p>
        Spotted a wrong field? Open an issue or a PR on{" "}
        <a
          href="https://github.com/guil-lambert/defibeat"
          style={{ color: "#22d3ee" }}
          rel="noreferrer"
          target="_blank"
        >
          github.com/guil-lambert/defibeat
        </a>
        .
      </p>
    </main>
  );
}
