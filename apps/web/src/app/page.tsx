import { listProtocols } from "@defibeat/registry";
import { LandingTable } from "../components/LandingTable";
import { bucketCategory } from "../lib/category-map";
import { primaryChain } from "../lib/format";
import { buildNodes, tabCountsFromNodes, type LandingRow } from "../lib/landing";
import { verifiabilityGrade } from "../lib/verifiability";
import { dependenciesGrade } from "../lib/dependencies";

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
      parent_slug: p.parent_slug,
      delisted_at: p.delisted_at,
      verifiability_grade: verifiabilityGrade(
        !!(p.github && p.github.length > 0),
        p.audit_count ?? 0,
      ),
      dependencies_grade: dependenciesGrade(p.category, p.forked_from),
    };
  });

  if (unmapped.size > 0) {
    console.warn(
      `[landing] ${unmapped.size} unmapped categorie(s) bucketed into Others: ${[...unmapped].sort().join(", ")}`,
    );
  }

  const nodes = buildNodes(rows);
  const counts = tabCountsFromNodes(nodes);
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
      <LandingTable nodes={nodes} tabCounts={counts} />
    </main>
  );
}
