import { describe, expect, it } from "vitest";
import { isDead, normalizeProtocol, parseAuditCount, resolveParentSlug } from "./normalize";
import type { LlamaProtocol } from "./types";

const base: LlamaProtocol = {
  id: "123",
  name: "Acme",
  slug: "acme",
  category: "Lending",
  chains: ["Ethereum"],
  url: "https://acme.xyz",
  twitter: "acme",
  audits: "2",
  audit_links: ["https://audit.example/acme"],
  hallmarks: [[1700000000, "Launch"]],
  tvl: 100,
  chainTvls: { Ethereum: 100 },
};

describe("normalizeProtocol", () => {
  it("maps key fields", () => {
    const p = normalizeProtocol(base, "2026-04-22T00:00:00.000Z", new Set());
    expect(p.slug).toBe("acme");
    expect(p.category).toBe("Lending");
    expect(p.chains).toEqual(["Ethereum"]);
    expect(p.tvl).toBe(100);
    expect(p.tvl_by_chain).toEqual({ Ethereum: 100 });
    expect(p.website).toBe("https://acme.xyz");
    expect(p.audit_count).toBe(2);
    expect(p.hallmarks).toEqual([[1700000000, "Launch"]]);
    expect(p.first_seen_at).toBe("2026-04-22T00:00:00.000Z");
    expect(p.last_seen_at).toBe("2026-04-22T00:00:00.000Z");
    expect(p.delisted_at).toBeNull();
  });

  it("keeps null tvl and empty arrays", () => {
    const p = normalizeProtocol(
      { ...base, tvl: null, chainTvls: null, audit_links: [], hallmarks: [] },
      "2026-04-22T00:00:00.000Z",
      new Set(),
    );
    expect(p.tvl).toBeNull();
    expect(p.tvl_by_chain).toEqual({});
    expect(p.audit_links).toEqual([]);
    expect(p.hallmarks).toEqual([]);
  });

  it("filters non-number chainTvls", () => {
    const p = normalizeProtocol(
      { ...base, chainTvls: { Ethereum: 100, Borked: null as unknown as number } },
      "2026-04-22T00:00:00.000Z",
      new Set(),
    );
    expect(p.tvl_by_chain).toEqual({ Ethereum: 100 });
  });
});

describe("resolveParentSlug", () => {
  it("returns null when parentProtocol missing", () => {
    expect(resolveParentSlug({ ...base, parentProtocol: null }, new Set(["other"]))).toBeNull();
  });
  it("returns null when parentProtocol is a string label not in snapshot", () => {
    expect(resolveParentSlug({ ...base, parentProtocol: "Uniswap" }, new Set(["sushi"]))).toBeNull();
  });
  it("returns the slug when parentProtocol matches a known slug", () => {
    expect(resolveParentSlug({ ...base, parentProtocol: "uniswap" }, new Set(["uniswap"]))).toBe("uniswap");
  });
});

describe("isDead", () => {
  it("true when deadUrl present", () => {
    expect(isDead({ ...base, deadUrl: "https://gone.example" })).toBe(true);
  });
  it("true when deadFrom present", () => {
    expect(isDead({ ...base, deadFrom: 1700000000 })).toBe(true);
  });
  it("false when none of the signals are set", () => {
    expect(isDead(base)).toBe(false);
  });
  it("true when category hints dead", () => {
    expect(isDead({ ...base, category: "Dead DEX" })).toBe(true);
  });
  it("empty deadFrom string treated as alive", () => {
    expect(isDead({ ...base, deadFrom: "" })).toBe(false);
  });
});

describe("parseAuditCount", () => {
  it("parses string counts", () => {
    expect(parseAuditCount("3")).toBe(3);
  });
  it("handles null / garbage", () => {
    expect(parseAuditCount(null)).toBe(0);
    expect(parseAuditCount("not a number")).toBe(0);
  });
});
