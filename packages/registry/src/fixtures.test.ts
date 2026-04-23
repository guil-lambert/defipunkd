import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildIndex } from "./index";

const FIXTURE_DIR = resolve(__dirname, "..", "..", "..", "fixtures", "small");

describe("buildIndex against fixtures/small", () => {
  it("loads live + delisted + parent + child", () => {
    const { bySlug, childrenByParent } = buildIndex(FIXTURE_DIR);
    expect(bySlug.size).toBe(4);
    expect(bySlug.get("alpha")?.name).toBe("Alpha");
    expect(bySlug.get("beta")?.delisted_at).toBe("2026-03-15T00:00:00.000Z");
    expect(childrenByParent.get("gamma-parent")?.map((c) => c.slug)).toEqual(["gamma-v2"]);
    expect(childrenByParent.get("alpha")).toBeUndefined();
  });

  it("applies overlay with [curated] provenance on overridden field, [defillama] elsewhere", () => {
    const { bySlug } = buildIndex(FIXTURE_DIR);
    const alpha = bySlug.get("alpha");
    expect(alpha?.website).toBe("https://curated-alpha.example");
    expect(alpha?._provenance.website).toBe("curated");
    expect(alpha?._provenance.name).toBe("defillama");
  });
});

describe("buildIndex overlay failure modes", () => {
  it("orphan overlay warns and is skipped (no resurrection)", () => {
    const dir = join(tmpdir(), `defipunkd-orphan-${Date.now()}`);
    mkdirSync(join(dir, "overlays"), { recursive: true });
    writeFileSync(
      join(dir, "defillama-snapshot.json"),
      JSON.stringify({ generated_at: "2026-04-22T00:00:00.000Z", protocols: {} }),
    );
    writeFileSync(join(dir, "overlays", "ghost.json"), JSON.stringify({ website: "x" }));
    try {
      const { bySlug, warnings } = buildIndex(dir);
      expect(bySlug.size).toBe(0);
      expect(warnings.some((w) => w.kind === "orphan_overlay" && w.slug === "ghost")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("malformed overlay (unknown key) throws — fail the build", () => {
    const dir = join(tmpdir(), `defipunkd-malformed-${Date.now()}`);
    mkdirSync(join(dir, "overlays"), { recursive: true });
    writeFileSync(
      join(dir, "defillama-snapshot.json"),
      JSON.stringify({ generated_at: "2026-04-22T00:00:00.000Z", protocols: {} }),
    );
    writeFileSync(join(dir, "overlays", "bad.json"), JSON.stringify({ nope: "nope" }));
    try {
      expect(() => buildIndex(dir)).toThrow(/bad\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
