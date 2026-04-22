import { describe, expect, it } from "vitest";
import type { ProtocolSnapshot, Snapshot } from "@defibeat/registry";
import { carryForward } from "./carry-forward";

function fresh(slug: string, generatedAt: string): ProtocolSnapshot {
  return {
    slug,
    name: slug,
    category: "Lending",
    chains: ["Ethereum"],
    tvl: 100,
    tvl_by_chain: { Ethereum: 100 },
    website: null,
    twitter: null,
    github: null,
    audit_count: 0,
    audit_links: [],
    hallmarks: [],
    parent_slug: null,
    forked_from: null,
    is_dead: false,
    is_parent: false,
    first_seen_at: generatedAt,
    last_seen_at: generatedAt,
    delisted_at: null,
  };
}

function prev(slug: string, lastSeenAt: string, firstSeenAt = lastSeenAt): ProtocolSnapshot {
  return { ...fresh(slug, lastSeenAt), first_seen_at: firstSeenAt, last_seen_at: lastSeenAt };
}

describe("carryForward", () => {
  const GEN = "2026-04-22T00:00:00.000Z";

  it("keeps first_seen_at immutable and bumps last_seen_at", () => {
    const previous: Snapshot = {
      generated_at: "2026-04-01T00:00:00.000Z",
      protocols: { acme: prev("acme", "2026-04-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z") },
    };
    const out = carryForward({ acme: fresh("acme", GEN) }, previous, GEN);
    expect(out.acme?.first_seen_at).toBe("2026-01-01T00:00:00.000Z");
    expect(out.acme?.last_seen_at).toBe(GEN);
  });

  it("14-day boundary: 13 days absent stays live, 14 days absent gets delisted", () => {
    const thirteenDaysAgo = "2026-04-09T00:00:00.000Z";
    const fourteenDaysAgo = "2026-04-08T00:00:00.000Z";
    const previous: Snapshot = {
      generated_at: thirteenDaysAgo,
      protocols: {
        x: prev("x", thirteenDaysAgo),
        y: prev("y", fourteenDaysAgo),
      },
    };
    const out = carryForward({}, previous, GEN);
    expect(out.x?.delisted_at).toBeNull();
    expect(out.y?.delisted_at).toBe(GEN);
  });

  it("once delisted_at is set, it stays set", () => {
    const previous: Snapshot = {
      generated_at: GEN,
      protocols: { gone: { ...prev("gone", "2026-01-01T00:00:00.000Z"), delisted_at: "2026-02-01T00:00:00.000Z" } },
    };
    const out = carryForward({}, previous, GEN);
    expect(out.gone?.delisted_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("reappearing slug clears delisted_at and bumps last_seen_at", () => {
    const previous: Snapshot = {
      generated_at: GEN,
      protocols: { back: { ...prev("back", "2026-01-01T00:00:00.000Z"), delisted_at: "2026-02-01T00:00:00.000Z" } },
    };
    const out = carryForward({ back: fresh("back", GEN) }, previous, GEN);
    expect(out.back?.delisted_at).toBeNull();
    expect(out.back?.last_seen_at).toBe(GEN);
    expect(out.back?.first_seen_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("new slug without prior history is carried through as-is", () => {
    const out = carryForward({ newbie: fresh("newbie", GEN) }, null, GEN);
    expect(out.newbie?.first_seen_at).toBe(GEN);
    expect(out.newbie?.last_seen_at).toBe(GEN);
  });
});
