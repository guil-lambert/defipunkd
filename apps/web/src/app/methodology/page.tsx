import { PIZZA_SLICES, PizzaChart } from "../../components/PizzaChart";

export const dynamic = "force-static";

export const metadata = {
  title: "Methodology · DefiBeat",
};

const SLICE_DESCRIPTIONS: Record<string, string> = {
  "chain-ownership":
    "Who owns the contracts that custody user funds, and how that ownership is structured across chains.",
  upgradeability:
    "Whether contracts can be upgraded, how quickly, and by whom.",
  "exit-window":
    "Whether users can exit on their own terms if the protocol team disappears or acts adversarially.",
  autonomy:
    "Whether the protocol depends on privileged operators, off-chain infrastructure, or whitelists to function.",
  oracle: "How the protocol sources price / state data and the blast radius of oracle failure.",
  "external-deps":
    "Third-party protocols (bridges, yield wrappers, stable issuers) that the protocol inherits risk from.",
  collateral:
    "Quality and concentration of collateral backing user balances — applies to every category, not just lending.",
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
        file into <code style={{ color: "#cbd5e1" }}>data/overlays/</code> and opening a PR. Every
        field displays a <code style={{ color: "#cbd5e1" }}>[defillama]</code> or{" "}
        <code style={{ color: "#cbd5e1" }}>[curated]</code> tag so you always know where a value
        came from.
      </p>
      <p>
        DefiBeat mirrors DeFiLlama: if DeFiLlama delists a protocol, DefiBeat delists it after a
        14-day grace window.
      </p>

      <h2 style={{ color: "#e2e8f0", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem", marginTop: "2rem" }}>
        The 7-slice risk pizza
      </h2>
      <p>
        Every protocol carries a pizza chart with seven slices. At Phase 0 every slice is gray —
        nothing has been reviewed. The slices exist now so the shape of future assessments is
        already visible.
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
        Stages
      </h2>
      <p>
        Stage badges arrive with Phase 3 of the project, at which point DefiBeat adopts{" "}
        <a
          href="https://www.defiscan.info/framework"
          style={{ color: "#22d3ee" }}
          rel="noreferrer"
          target="_blank"
        >
          Defiscan&rsquo;s stage framework
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
