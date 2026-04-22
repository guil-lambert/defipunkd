import { listProtocols } from "@defibeat/registry";
import { formatTvl } from "../lib/format";

export default function HomePage() {
  const protocols = listProtocols();
  const live = protocols.filter((p) => !p.delisted_at && !p.is_dead);
  const top = [...live]
    .sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1))
    .slice(0, 25);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <h1 style={{ color: "#22d3ee", margin: 0 }}>DefiBeat</h1>
      <p style={{ color: "#94a3b8", marginTop: "0.25rem" }}>
        {live.length.toLocaleString()} live protocols · {protocols.length.toLocaleString()} total · landing
        table arrives in Phase 4
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "2rem" }}>
        <thead>
          <tr style={{ color: "#64748b", fontSize: "0.85rem", textAlign: "left" }}>
            <th style={{ padding: "0.5rem 0.75rem" }}>#</th>
            <th style={{ padding: "0.5rem 0.75rem" }}>Name</th>
            <th style={{ padding: "0.5rem 0.75rem" }}>Category</th>
            <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>TVL</th>
          </tr>
        </thead>
        <tbody>
          {top.map((p, i) => (
            <tr key={p.slug} style={{ borderTop: "1px solid #1e293b", color: "#cbd5e1" }}>
              <td style={{ padding: "0.5rem 0.75rem", color: "#64748b" }}>{i + 1}</td>
              <td style={{ padding: "0.5rem 0.75rem" }}>
                <a href={`/protocol/${p.slug}`} style={{ color: "#22d3ee" }}>
                  {p.name}
                </a>
              </td>
              <td style={{ padding: "0.5rem 0.75rem" }}>{p.category || "\u2014"}</td>
              <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>{formatTvl(p.tvl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
