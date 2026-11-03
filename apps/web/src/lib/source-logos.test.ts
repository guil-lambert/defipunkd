import { expect, it } from "vitest";
import { sourceBrandForUrl } from "./source-logos";
it("recognizes supported source domains and subdomains", () => {
  expect(sourceBrandForUrl("https://docs.defiscan.info/framework")).toBe("defiscan");
  expect(sourceBrandForUrl("https://immunefi.com/bug-bounty/aave")).toBe("immunefi");
  expect(sourceBrandForUrl("https://cantina.xyz/competitions/123")).toBe("cantina");
  expect(sourceBrandForUrl("https://github.com/org/repo")).toBe("github");
});
it("does not misbrand unrelated or deceptive URLs", () => {
  for (const url of [null, "", "invalid", "https://notdefillama.com", "https://defillama.com.evil.test", "https://example.org/?source=github.com", "javascript://github.com"]) {
    expect(sourceBrandForUrl(url)).toBeUndefined();
  }
});
