import { describe, expect, it, vi } from "vitest";

vi.mock("./generated/delisted-manifest.json", () => ({
  default: {
    "ghost-protocol": { name: "GhostProtocol", delisted_at: "2026-03-15T00:00:00.000Z" },
  },
}));

class FakeUrl {
  constructor(public pathname: string) {}
}
class FakeRequest {
  nextUrl: FakeUrl;
  constructor(pathname: string) {
    this.nextUrl = new FakeUrl(pathname);
  }
}

describe("middleware", () => {
  it("returns 410 HTML for a delisted slug with name and delisted_at in the body", async () => {
    const { middleware } = await import("./middleware");
    const res = middleware(new FakeRequest("/protocol/ghost-protocol") as never);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(410);
    const body = await res.text();
    expect(body).toContain("GhostProtocol");
    expect(body).toContain("2026-03-15T00:00:00.000Z");
    expect(body).toContain("defillama.com/protocol/ghost-protocol");
  });

  it("passes through for live slugs (status not 410)", async () => {
    const { middleware } = await import("./middleware");
    const res = middleware(new FakeRequest("/protocol/uniswap-v2") as never);
    expect(res.status).not.toBe(410);
  });

  it("passes through for non-protocol paths", async () => {
    const { middleware } = await import("./middleware");
    const res = middleware(new FakeRequest("/methodology") as never);
    expect(res.status).not.toBe(410);
  });
});
