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
