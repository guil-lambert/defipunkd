import { describe, expect, it } from "vitest";

import {
  extractGithubRepos,
  extractRootHost,
  findDocsLink,
} from "./scrape-github-from-html.js";

describe("extractGithubRepos", () => {
  it("pulls org/repo from an href", () => {
    const html = `<a href="https://github.com/aave-dao/aave-v3-origin">repo</a>`;
    expect(extractGithubRepos(html)).toEqual([
      { org: "aave-dao", repo: "aave-v3-origin" },
    ]);
  });
  it("dedupes multiple references to the same repo", () => {
    const html = `
      <a href="https://github.com/morpho-org/morpho-blue">a</a>
      <a href="https://github.com/morpho-org/morpho-blue/blob/main/README.md">b</a>
    `;
    const out = extractGithubRepos(html);
    expect(out).toContainEqual({ org: "morpho-org", repo: "morpho-blue" });
  });
  it("filters out auditor org links", () => {
    const html = `
      <a href="https://github.com/trailofbits/publications">audit</a>
      <a href="https://github.com/falconfin/contracts">repo</a>
    `;
    expect(extractGithubRepos(html)).toEqual([
      { org: "falconfin", repo: "contracts" },
    ]);
  });
  it("filters out boilerplate / reserved paths", () => {
    const html = `
      <a href="https://github.com/login">login</a>
      <a href="https://github.com/features">features</a>
      <a href="https://github.com/realorg/realrepo">repo</a>
    `;
    expect(extractGithubRepos(html)).toEqual([
      { org: "realorg", repo: "realrepo" },
    ]);
  });
  it("captures org-only links when no repo path is present", () => {
    const html = `<a href="https://github.com/aave">aave</a>`;
    expect(extractGithubRepos(html)).toEqual([{ org: "aave", repo: null }]);
  });
  it("strips .git and trailing punctuation from repo names", () => {
    const html = `git clone https://github.com/foo/bar.git, see also`;
    expect(extractGithubRepos(html)).toContainEqual({ org: "foo", repo: "bar" });
  });
});

describe("findDocsLink", () => {
  it("finds docs.<host>", () => {
    const html = `<a href="https://docs.aave.com/developers">docs</a>`;
    expect(findDocsLink(html, "aave.com")).toBe("https://docs.aave.com/developers");
  });
  it("finds gitbook subdomain when no docs.* link exists", () => {
    const html = `<a href="https://example.gitbook.io/whitepaper">docs</a>`;
    expect(findDocsLink(html, "example.com")).toBe("https://example.gitbook.io/whitepaper");
  });
  it("returns null when nothing matches", () => {
    expect(findDocsLink("<p>nothing</p>", "example.com")).toBe(null);
  });
});

describe("extractRootHost", () => {
  it("returns the root domain", () => {
    expect(extractRootHost("https://app.aave.com/markets")).toBe("aave.com");
  });
  it("returns null on malformed input", () => {
    expect(extractRootHost("not a url")).toBe(null);
  });
});
