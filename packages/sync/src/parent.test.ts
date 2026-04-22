import { describe, expect, it } from "vitest";
import { normalizeParent, resolveParentSlug } from "./normalize";
import { parentSlugFromId, type LlamaParentProtocol, type LlamaProtocol } from "./types";

describe("parentSlugFromId", () => {
  it("strips the parent# prefix", () => {
    expect(parentSlugFromId("parent#morpho")).toBe("morpho");
  });
  it("passes through untouched when no prefix", () => {
    expect(parentSlugFromId("morpho")).toBe("morpho");
  });
});

describe("normalizeParent", () => {
  const parent: LlamaParentProtocol = {
    id: "parent#morpho",
    name: "Morpho",
    url: "https://morpho.org",
    twitter: "MorphoLabs",
    github: ["morpho-org"],
    chains: ["Ethereum", "Base"],
  };

  it("uses the stripped id as the slug and flags is_parent", () => {
    const out = normalizeParent(parent, "2026-04-22T00:00:00.000Z");
    expect(out.slug).toBe("morpho");
    expect(out.is_parent).toBe(true);
    expect(out.name).toBe("Morpho");
    expect(out.website).toBe("https://morpho.org");
    expect(out.twitter).toBe("MorphoLabs");
    expect(out.github).toEqual(["morpho-org"]);
    expect(out.chains).toEqual(["Ethereum", "Base"]);
    expect(out.tvl).toBeNull();
  });

  it("fills optional fields with their empty defaults", () => {
    const out = normalizeParent({ id: "parent#ghost", name: "Ghost" }, "2026-04-22T00:00:00.000Z");
    expect(out.chains).toEqual([]);
    expect(out.website).toBeNull();
    expect(out.twitter).toBeNull();
    expect(out.github).toBeNull();
  });
});

describe("resolveParentSlug with parent# identifiers", () => {
  const base: LlamaProtocol = { name: "x", slug: "x" };

  it("strips parent# to match an ingested parent slug", () => {
    expect(resolveParentSlug({ ...base, parentProtocol: "parent#morpho" }, new Set(["morpho"]))).toBe(
      "morpho",
    );
  });

  it("returns null when neither raw nor stripped form matches", () => {
    expect(
      resolveParentSlug({ ...base, parentProtocol: "parent#ghost" }, new Set(["morpho"])),
    ).toBeNull();
  });
});
