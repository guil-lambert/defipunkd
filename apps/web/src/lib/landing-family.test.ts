import { describe, expect, it } from "vitest";
import { buildNodes, dominantCategory, filterAndSortNodes, sumTvl, type LandingRow } from "./landing";

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
    ...overrides,
  };
}

describe("sumTvl", () => {
  it("returns null when every child has null tvl", () => {
    expect(sumTvl([row({ tvl: null }), row({ tvl: null })])).toBeNull();
  });
  it("sums non-null TVL, ignoring nulls", () => {
    expect(sumTvl([row({ tvl: 100 }), row({ tvl: null }), row({ tvl: 50 })])).toBe(150);
  });
});

describe("dominantCategory", () => {
  it("returns the most common category among children", () => {
    const kids = [row({ category: "Dexes" }), row({ category: "Dexes" }), row({ category: "Lending" })];
    expect(dominantCategory(kids)).toBe("Dexes");
  });
});

describe("buildNodes family collapsing", () => {
  const rows: LandingRow[] = [
    row({ slug: "uniswap", name: "Uniswap", is_parent: true, tvl: null, category: "" }),
    row({ slug: "uniswap-v2", name: "Uniswap V2", parent_slug: "uniswap", category: "Dexes", tvl: 1_000_000_000 }),
    row({ slug: "uniswap-v3", name: "Uniswap V3", parent_slug: "uniswap", category: "Dexes", tvl: 2_000_000_000 }),
    row({ slug: "aave-v3", name: "Aave V3", category: "Lending", tvl: 500_000_000 }),
    row({
      slug: "lonely-parent",
      name: "Lonely",
      is_parent: true,
      category: "",
      tvl: null,
    }),
  ];

  it("parents with children become family nodes; parents without children are dropped", () => {
    const nodes = buildNodes(rows);
    const slugs = nodes.map((n) => n.slug);
    expect(slugs).toContain("uniswap");
    expect(slugs).toContain("aave-v3");
    expect(slugs).not.toContain("uniswap-v2");
    expect(slugs).not.toContain("uniswap-v3");
    expect(slugs).not.toContain("lonely-parent");
  });

  it("family TVL is sum of children", () => {
    const nodes = buildNodes(rows);
    const uniswap = nodes.find((n) => n.slug === "uniswap")!;
    expect(uniswap.tvl).toBe(3_000_000_000);
    expect(uniswap.children?.map((c) => c.slug)).toEqual(["uniswap-v3", "uniswap-v2"]);
  });

  it("family inherits dominant child category when parent's category is empty", () => {
    const nodes = buildNodes(rows);
    const uniswap = nodes.find((n) => n.slug === "uniswap")!;
    expect(uniswap.category).toBe("Dexes");
  });
});

describe("filterAndSortNodes search flattens families", () => {
  const rows: LandingRow[] = [
    row({ slug: "uniswap", name: "Uniswap", is_parent: true, category: "", tvl: null }),
    row({ slug: "uniswap-v2", name: "Uniswap V2", parent_slug: "uniswap", tvl: 100, category: "Dexes" }),
    row({ slug: "uniswap-v3", name: "Uniswap V3", parent_slug: "uniswap", tvl: 200, category: "Dexes" }),
  ];

  it("empty query: family node with children", () => {
    const nodes = buildNodes(rows);
    const out = filterAndSortNodes(nodes, { tab: "All", query: "", showInactive: false });
    expect(out.map((n) => n.slug)).toEqual(["uniswap"]);
    expect(out[0]?.children?.length).toBe(2);
  });

  it("search: parent match keeps the family row (children stay nested and clickable)", () => {
    const nodes = buildNodes(rows);
    const out = filterAndSortNodes(nodes, { tab: "All", query: "uniswa", showInactive: false });
    expect(out.map((n) => n.slug)).toContain("uniswap");
    const uni = out.find((n) => n.slug === "uniswap")!;
    expect(uni.children?.length).toBe(2);
  });

  it("search: child-only match surfaces children individually (no parent dup)", () => {
    const nodes = buildNodes(rows);
    const out = filterAndSortNodes(nodes, { tab: "All", query: "v3", showInactive: false });
    expect(out.map((n) => n.slug)).toContain("uniswap-v3");
    expect(out.map((n) => n.slug)).not.toContain("uniswap");
  });

  it("search: parent-name query does not emit duplicate child rows", () => {
    const nodes = buildNodes(rows);
    const out = filterAndSortNodes(nodes, { tab: "All", query: "uniswap", showInactive: false });
    const slugs = out.map((n) => n.slug);
    expect(slugs).toEqual(expect.arrayContaining(["uniswap"]));
    expect(slugs).not.toContain("uniswap-v2");
    expect(slugs).not.toContain("uniswap-v3");
  });
});
