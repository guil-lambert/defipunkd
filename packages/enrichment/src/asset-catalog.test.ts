import { describe, expect, it } from "vitest";
import { parseAssetComparison, parseAssetDirectory } from "./asset-catalog";
const directory = `<main><p>1 assets in this covered-market subset.</p><ul><li><a href="/assets/apple">AAPL — Apple</a><span>stock</span></li></ul></main>`;
const page = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage","url":"https://tokenizedstonks.io/assets/apple","dateModified":"2026-11-03T20:00:00Z"}]}</script><main>
<table><tr><th>Security</th><td>Apple</td></tr><tr><th>Tokens</th><td>1 tokens from 1 issuers</td></tr></table>
<table><thead><tr><th>Issuer</th><th>Token</th><th>Network</th><th>Contract</th><th>Form</th><th>Status</th></tr></thead><tbody><tr><td>Example</td><th>AAPLx</th><td>Ethereum</td><td><a href="https://etherscan.io/token/0x123"><code>0x123</code></a></td><td>issuer token</td><td>unknown</td></tr></tbody></table></main>`;
describe("crawlable asset catalog", () => {
  it("extracts catalog data without market metrics", () => {
    expect(parseAssetDirectory(directory)).toEqual([{ id: "apple", symbol: "AAPL", name: "Apple", kind: "stock" }]);
    expect(parseAssetComparison(page, "apple").representations[0]).toEqual({ issuer: "Example", symbol: "AAPLx", network: "Ethereum", contract: "0x123", explorer_url: "https://etherscan.io/token/0x123", form: "issuer token" });
  });
  it("rejects partial directories and token tables", () => {
    expect(() => parseAssetDirectory(directory.replace("1 assets", "2 assets"))).toThrow();
    expect(() => parseAssetComparison(page.replace("1 tokens", "2 tokens"), "apple")).toThrow();
  });
  it("rejects the wrong asset, changed headers, unsafe links, and invalid timestamps", () => {
    expect(() => parseAssetComparison(page, "other")).toThrow();
    expect(() => parseAssetComparison(page.replace("<th>Form</th>", "<th>Type</th>"), "apple")).toThrow();
    expect(() => parseAssetComparison(page.replace("https://etherscan.io/token/0x123", "javascript:alert(1)"), "apple")).toThrow();
    expect(() => parseAssetComparison(page.replace("2026-11-03T20:00:00Z", "invalid"), "apple")).toThrow();
  });
  it("retains off-chain products without inventing a contract", () => {
    const offchain = page.replace('<a href="https://etherscan.io/token/0x123"><code>0x123</code></a>', "custodial/off-chain");
    expect(parseAssetComparison(offchain, "apple").representations[0]?.contract).toBeNull();
  });
});
