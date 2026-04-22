export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--surface-raised)",
        marginTop: "4rem",
        padding: "2rem 1.5rem",
        color: "var(--text-muted)",
        fontSize: "0.85rem",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
        <a href="/methodology" style={{ textDecoration: "none" }}>
          Methodology
        </a>
        <a
          href="https://github.com/guil-lambert/defibeat/issues"
          style={{ textDecoration: "none" }}
          rel="noreferrer"
          target="_blank"
        >
          Corrections / takedowns (GitHub issues)
        </a>
        <span>
          Curators: edit{" "}
          <code style={{ color: "var(--text)" }}>data/overlays/</code> and open a PR.
        </span>
        <span style={{ marginLeft: "auto" }}>
          Rubric adapted from{" "}
          <a
            href="https://www.defiscan.info/framework"
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
