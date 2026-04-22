export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid #1e293b",
        marginTop: "4rem",
        padding: "2rem 1.5rem",
        color: "#64748b",
        fontSize: "0.85rem",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
        <a href="/methodology" style={{ color: "#22d3ee", textDecoration: "none" }}>
          Methodology
        </a>
        <a
          href="https://github.com/guil-lambert/defibeat/issues"
          style={{ color: "#22d3ee", textDecoration: "none" }}
          rel="noreferrer"
          target="_blank"
        >
          Corrections / takedowns (GitHub issues)
        </a>
        <span>
          Curators: edit{" "}
          <code style={{ color: "#cbd5e1" }}>data/overlays/</code> and open a PR.
        </span>
        <span style={{ marginLeft: "auto" }}>
          Rubric adapted from{" "}
          <a
            href="https://www.defiscan.info/framework"
            style={{ color: "#22d3ee" }}
            rel="noreferrer"
            target="_blank"
          >
            Defiscan
          </a>
          .
        </span>
      </div>
    </footer>
  );
}
