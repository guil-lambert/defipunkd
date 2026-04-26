import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIndex } from "./index";
import type { ProtocolSnapshot } from "./types";

function baseProtocol(overrides: Partial<ProtocolSnapshot>): ProtocolSnapshot {
  return {
    slug: "x",
    name: "X",
    category: "Lending",
    chains: ["Ethereum"],
    tvl: null,
    tvl_by_chain: {},
    website: null,
    twitter: null,
    github: null,
    audit_count: 0,
    audit_links: [],
    hallmarks: [],
    parent_slug: null,
    forked_from: null,
    logo: null,
    is_dead: false,
    is_parent: false,
    first_seen_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: "2026-04-22T00:00:00.000Z",
    delisted_at: null,
    module: null,
    ...overrides,
  };
}

function withFixture(
  protocols: Record<string, ProtocolSnapshot>,
  run: (dir: string) => void,
  overlays: Record<string, unknown> = {},
): void {
  const dir = join(tmpdir(), `defipunkd-inherit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, "overlays"), { recursive: true });
  writeFileSync(
    join(dir, "defillama-snapshot.json"),
    JSON.stringify({ generated_at: "2026-04-22T00:00:00.000Z", protocols }),
  );
  for (const [slug, body] of Object.entries(overlays)) {
    writeFileSync(join(dir, "overlays", `${slug}.json`), JSON.stringify(body));
  }
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("parent inheritance", () => {
  it("child inherits github from parent when its own is null (provenance: defillama-parent)", () => {
    withFixture(
      {
        morpho: baseProtocol({
          slug: "morpho",
          name: "Morpho",
          is_parent: true,
          github: ["morpho-org"],
          website: "https://morpho.org",
        }),
        "morpho-blue": baseProtocol({
          slug: "morpho-blue",
          name: "Morpho Blue",
          parent_slug: "morpho",
          github: null,
          website: null,
        }),
      },
      (dir) => {
        const { bySlug } = buildIndex(dir);
        const child = bySlug.get("morpho-blue")!;
        expect(child.github).toEqual(["morpho-org"]);
        expect(child._provenance.github).toBe("defillama-parent");
        expect(child.website).toBe("https://morpho.org");
        expect(child._provenance.website).toBe("defillama-parent");
      },
    );
  });

  it("does not overwrite a child's own github", () => {
    withFixture(
      {
        morpho: baseProtocol({
          slug: "morpho",
          name: "Morpho",
          is_parent: true,
          github: ["morpho-org"],
        }),
        "morpho-blue": baseProtocol({
          slug: "morpho-blue",
          name: "Morpho Blue",
          parent_slug: "morpho",
          github: ["morpho-blue-repo"],
        }),
      },
      (dir) => {
        const { bySlug } = buildIndex(dir);
        const child = bySlug.get("morpho-blue")!;
        expect(child.github).toEqual(["morpho-blue-repo"]);
        expect(child._provenance.github).toBe("defillama");
      },
    );
  });

  it("does not inherit when overlay explicitly sets the field to null (curated no-value)", () => {
    withFixture(
      {
        morpho: baseProtocol({ slug: "morpho", name: "Morpho", is_parent: true, github: ["morpho-org"] }),
        "morpho-blue": baseProtocol({
          slug: "morpho-blue",
          name: "Morpho Blue",
          parent_slug: "morpho",
          github: null,
        }),
      },
      (dir) => {
        const { bySlug } = buildIndex(dir);
        const child = bySlug.get("morpho-blue")!;
        expect(child.github).toBeNull();
        expect(child._provenance.github).toBe("curated");
      },
      { "morpho-blue": { github: null } },
    );
  });

  it("parents themselves do not inherit", () => {
    withFixture(
      {
        morpho: baseProtocol({
          slug: "morpho",
          name: "Morpho",
          is_parent: true,
          github: null,
          parent_slug: null,
        }),
      },
      (dir) => {
        const { bySlug } = buildIndex(dir);
        const parent = bySlug.get("morpho")!;
        expect(parent.github).toBeNull();
      },
    );
  });
});
