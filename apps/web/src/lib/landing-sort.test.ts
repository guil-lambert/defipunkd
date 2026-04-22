import { describe, expect, it } from "vitest";
import { buildNodes, filterAndSortNodes, type LandingRow } from "./landing";

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

describe("sortable columns", () => {
  const rows: LandingRow[] = [
    row({ slug: "a", name: "Beta", category: "Lending", primary_chain: "Arbitrum", tvl: 100 }),
    row({ slug: "b", name: "alpha", category: "Dexs", primary_chain: "Base", tvl: 500 }),
    row({ slug: "c", name: "Gamma", category: "Yield", primary_chain: null, tvl: null }),
  ];

  it("sort by name asc/desc is case-insensitive via localeCompare", () => {
    const asc = filterAndSortNodes(buildNodes(rows), {
      tab: "All",
      query: "",
      showInactive: false,
      sort: { field: "name", dir: "asc" },
    });
    expect(asc.map((n) => n.slug)).toEqual(["b", "a", "c"]);
    const desc = filterAndSortNodes(buildNodes(rows), {
      tab: "All",
      query: "",
      showInactive: false,
      sort: { field: "name", dir: "desc" },
    });
    expect(desc.map((n) => n.slug)).toEqual(["c", "a", "b"]);
  });

  it("sort by chain pushes null primary_chain to the end in both directions", () => {
    const asc = filterAndSortNodes(buildNodes(rows), {
      tab: "All",
      query: "",
      showInactive: false,
      sort: { field: "chain", dir: "asc" },
    });
    expect(asc[asc.length - 1]?.slug).toBe("c");
    const desc = filterAndSortNodes(buildNodes(rows), {
      tab: "All",
      query: "",
      showInactive: false,
      sort: { field: "chain", dir: "desc" },
    });
    expect(desc[desc.length - 1]?.slug).toBe("c");
  });

  it("sort by type uses raw category string", () => {
    const asc = filterAndSortNodes(buildNodes(rows), {
      tab: "All",
      query: "",
      showInactive: false,
      sort: { field: "type", dir: "asc" },
    });
    expect(asc.map((n) => n.category)).toEqual(["Dexs", "Lending", "Yield"]);
  });

  it("sort by tvl asc puts smallest first, null last", () => {
    const asc = filterAndSortNodes(buildNodes(rows), {
      tab: "All",
      query: "",
      showInactive: false,
      sort: { field: "tvl", dir: "asc" },
    });
    expect(asc.map((n) => n.slug)).toEqual(["a", "b", "c"]);
  });

  it("default (no sort opt) stays tvl desc", () => {
    const out = filterAndSortNodes(buildNodes(rows), { tab: "All", query: "", showInactive: false });
    expect(out.map((n) => n.slug)).toEqual(["b", "a", "c"]);
  });
});
