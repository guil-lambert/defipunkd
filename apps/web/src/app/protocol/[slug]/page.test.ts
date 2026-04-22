import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { resolve } from "node:path";

beforeAll(() => {
  process.env.DEFIBEAT_DATA_DIR = resolve(__dirname, "..", "..", "..", "..", "..", "..", "fixtures", "small");
});

describe("/protocol/[slug] page", () => {
  it("renders the live protocol with curated-provenance on the overridden field", async () => {
    const { default: Page } = await import("./page");
    const el = await Page({
      params: Promise.resolve({ slug: "alpha" }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(createElement(() => el));
    expect(html).toContain("Alpha");
    expect(html).toContain("curated-alpha.example");
    expect(html).toContain("[curated]");
    expect(html).toContain("[defillama]");
  });

  it("renders the delisted UI for a delisted slug with DeFiLlama link", async () => {
    const { default: Page } = await import("./page");
    const el = await Page({
      params: Promise.resolve({ slug: "beta" }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(createElement(() => el));
    expect(html).toContain("Beta");
    expect(html).toContain("defillama.com/protocol/beta");
    expect(html).toContain("2026-03-15");
  });

  it("throws (notFound) for an unknown slug", async () => {
    const { default: Page } = await import("./page");
    await expect(
      Page({ params: Promise.resolve({ slug: "nonexistent" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow();
  });

  it("children table appears on the parent page", async () => {
    const { default: Page } = await import("./page");
    const el = await Page({
      params: Promise.resolve({ slug: "gamma-parent" }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(createElement(() => el));
    expect(html).toContain("Family members");
    expect(html).toContain("gamma-v2");
  });
});
