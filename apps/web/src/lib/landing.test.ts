import { describe, expect, it } from "vitest";
import { filterAndSort, tabCounts, tvlSortDesc, type LandingRow } from "./landing";

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
    logo: null,
    verifiability_grade: "gray",
    autonomy_grade: "gray",
    ...overrides,
  };
}

describe("tvlSortDesc", () => {
  it("orders non-null TVL descending", () => {
    const a = row({ slug: "a", tvl: 50 });
    const b = row({ slug: "b", tvl: 200 });
    expect([a, b].sort(tvlSortDesc).map((r) => r.slug)).toEqual(["b", "a"]);
  });

  it("null-TVL rows sort after ranked entries", () => {
    const a = row({ slug: "a", tvl: 50 });
    const b = row({ slug: "b", tvl: null });
    const c = row({ slug: "c", tvl: 200 });
    expect([b, a, c].sort(tvlSortDesc).map((r) => r.slug)).toEqual(["c", "a", "b"]);
  });

  it("null-TVL rows tiebreak alphabetically by slug", () => {
    const a = row({ slug: "zeta", tvl: null });
    const b = row({ slug: "alpha", tvl: null });
    expect([a, b].sort(tvlSortDesc).map((r) => r.slug)).toEqual(["alpha", "zeta"]);
  });
});

describe("filterAndSort", () => {
  const fixtures: LandingRow[] = [
    row({ slug: "lend-a", category: "Lending", tvl: 300 }),
    row({ slug: "lend-b", category: "Lending", tvl: 100 }),
    row({ slug: "dex-a", category: "Dexes", tvl: 500 }),
    row({ slug: "dead-one", category: "Lending", tvl: 50, is_dead: true }),
    row({ slug: "gone", category: "Lending", tvl: 999, delisted_at: "2026-01-01T00:00:00Z" }),
  ];

  it("excludes delisted and dead by default", () => {
    const out = filterAndSort(fixtures, { tab: "All", query: "", showInactive: false });
    expect(out.map((r) => r.slug)).toEqual(["dex-a", "lend-a", "lend-b"]);
  });

  it("show inactive includes dead but never delisted", () => {
    const out = filterAndSort(fixtures, { tab: "All", query: "", showInactive: true });
    expect(out.map((r) => r.slug)).toContain("dead-one");
    expect(out.map((r) => r.slug)).not.toContain("gone");
  });

  it("tab narrows to the selected bucket only", () => {
    const out = filterAndSort(fixtures, { tab: "Lending", query: "", showInactive: false });
    expect(out.map((r) => r.slug)).toEqual(["lend-a", "lend-b"]);
  });

  it("search intersects with tab", () => {
    const out = filterAndSort(fixtures, { tab: "Lending", query: "lend-a", showInactive: false });
    expect(out.map((r) => r.slug)).toEqual(["lend-a"]);
  });

  it("no matches for search in a tab returns []", () => {
    const out = filterAndSort(fixtures, { tab: "Lending", query: "nope", showInactive: false });
    expect(out).toEqual([]);
  });
});

describe("tabCounts", () => {
  it("excludes delisted + dead, includes every surviving bucket", () => {
    const rows = [
      row({ slug: "a", category: "Lending" }),
      row({ slug: "b", category: "Lending" }),
      row({ slug: "c", category: "Dexes" }),
      row({ slug: "dead", category: "Lending", is_dead: true }),
      row({ slug: "gone", category: "Lending", delisted_at: "2026-01-01T00:00:00Z" }),
      row({ slug: "mystery", category: "" }),
    ];
    const counts = tabCounts(rows);
    expect(counts.All).toBe(4);
    expect(counts.Lending).toBe(2);
    expect(counts.DEX).toBe(1);
    expect(counts.Others).toBe(1);
  });
});
