import { listProtocols } from "@defibeat/registry";
import { LandingTable } from "../components/LandingTable";
import { bucketCategory } from "../lib/category-map";
import { primaryChain } from "../lib/format";
import { tabCounts, type LandingRow } from "../lib/landing";

export const dynamic = "force-static";

export default function HomePage() {
  const protocols = listProtocols();
  const unmapped = new Set<string>();

  const rows: LandingRow[] = protocols.map((p) => {
    bucketCategory(p.category, (raw) => unmapped.add(raw));
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      primary_chain: primaryChain(p.tvl_by_chain) ?? p.chains[0] ?? null,
      tvl: p.tvl,
      is_dead: p.is_dead,
      is_parent: p.is_parent,
      delisted_at: p.delisted_at,
    };
  });

  if (unmapped.size > 0) {
    console.warn(
      `[landing] ${unmapped.size} unmapped categorie(s) bucketed into Others: ${[...unmapped].sort().join(", ")}`,
    );
  }

  const counts = tabCounts(rows);
  const live = counts.All ?? 0;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem", color: "#e2e8f0" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ color: "#22d3ee", margin: 0 }}>DefiBeat</h1>
        <p style={{ color: "#94a3b8", marginTop: "0.25rem" }}>
          {live.toLocaleString()} live protocols · {protocols.length.toLocaleString()} total ·{" "}
          <a href="/methodology" style={{ color: "#22d3ee" }}>
            methodology
          </a>
        </p>
      </header>
      <LandingTable rows={rows} tabCounts={counts} />
    </main>
  );
}
