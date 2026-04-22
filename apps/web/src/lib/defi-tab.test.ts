import { describe, expect, it } from "vitest";
import { buildNodes, filterAndSortNodes, tabCountsFromNodes, type LandingRow } from "./landing";
import { DEFAULT_TAB, isCexCategory, TABS } from "./category-map";

function row(overrides: Partial<LandingRow>): LandingRow {
  return {
    slug: "x",
    name: "X",
    category: "Lending",
    chains: ["Ethereum"],
    primary_chain: "Ethereum",
    tvl: 100,
    is_dead: false,
    is_parent: false,
    parent_slug: null,
    delisted_at: null,
    verifiability_grade: "gray",
    ...overrides,
  };
}

describe("DeFi tab", () => {
  it("DEFAULT_TAB is DeFi and it sits right after All in the tab list", () => {
    expect(DEFAULT_TAB).toBe("DeFi");
    expect(TABS[0]).toBe("All");
    expect(TABS[1]).toBe("DeFi");
  });

  it("isCexCategory is case-insensitive and matches exact CEX only", () => {
    expect(isCexCategory("CEX")).toBe(true);
    expect(isCexCategory("cex")).toBe(true);
    expect(isCexCategory("  CEX  ")).toBe(true);
    expect(isCexCategory("CEX Aggregator")).toBe(false);
    expect(isCexCategory("Lending")).toBe(false);
    expect(isCexCategory(null)).toBe(false);
    expect(isCexCategory("")).toBe(false);
  });

  it("DeFi tab filter excludes CEX rows, keeps everything else", () => {
    const rows = [
      row({ slug: "a", category: "Lending" }),
      row({ slug: "cex-1", category: "CEX" }),
      row({ slug: "cex-2", category: "cex" }),
      row({ slug: "b", category: "Dexes" }),
    ];
    const nodes = buildNodes(rows);
    const out = filterAndSortNodes(nodes, { tab: "DeFi", query: "", showInactive: false });
    expect(out.map((n) => n.slug).sort()).toEqual(["a", "b"]);
  });

  it("DeFi tab count is All minus CEX", () => {
    const rows = [
      row({ slug: "a", category: "Lending" }),
      row({ slug: "cex-1", category: "CEX" }),
      row({ slug: "b", category: "Dexes" }),
    ];
    const counts = tabCountsFromNodes(buildNodes(rows));
    expect(counts.All).toBe(3);
    expect(counts.DeFi).toBe(2);
  });
});
