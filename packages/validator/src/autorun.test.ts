import { describe, expect, it, vi } from "vitest";
import { estimateCost, excludePendingPairs, loadPendingAutorunPairs } from "./autorun";

const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreateTokens: 1_000_000, cacheReadTokens: 1_000_000, webSearches: 3 };
const pull = (number: number, ref = `autorun/run-${number}`, repo = "owner/repo") => ({ number, html_url: `https://github.com/owner/repo/pull/${number}`, head: { ref, repo: { full_name: repo } } });
const file = (filename: string, status = "added") => ({ filename, status });
const respond = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

describe("autorun pricing", () => {
  it("charges one-hour cache writes and searches", () => {
    expect(estimateCost("claude-sonnet-5-5", usage)).toBeCloseTo(16.13);
    expect(estimateCost("claude-sonnet-4-6", usage)).toBeCloseTo(24.33);
    expect(estimateCost("claude-sonnet-5-5-20260928", usage)).toBeCloseTo(16.13);
  });
  it("rejects unknown models instead of silently disabling the budget", () => {
    expect(() => estimateCost("unknown", usage)).toThrow("No pricing");
    expect(() => estimateCost("claude-sonnet-5-50", usage)).toThrow("No pricing");
  });
});

describe("pending autorun work", () => {
  it("reserves exact pairs from open same-repository autorun PRs only", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(respond([pull(1), pull(2, "feature"), pull(3, "autorun/run-3", "fork/repo")]))
      .mockResolvedValueOnce(respond([
        file("data/submissions/a/discovery/autorun.json"),
        file("data/submissions/b/control/autorun.json", "removed"),
        file("data/submissions/c/all/autorun.json"),
        file("data/assessments/d/control.json"),
      ]));
    const pending = await loadPendingAutorunPairs("owner/repo", "token", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]![0])).toContain("state=open");
    expect(pending.get("a/discovery")).toEqual([pull(1).html_url]);
    expect(pending.has("b/control")).toBe(false);
    expect(pending.has("c/discovery")).toBe(false);
    expect(pending.size).toBe(6);
    const log = vi.fn();
    const queue = [{ slug: "a", slice: "discovery" }, { slug: "a", slice: "control" }, { slug: "b", slice: "discovery" }];
    expect(excludePendingPairs(queue, pending, log).slice(0, 1)).toEqual([queue[1]]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(pull(1).html_url));
    // Closing an unmerged PR releases its reservation on the next lookup.
    const closed = await loadPendingAutorunPairs("owner/repo", "token", vi.fn<typeof fetch>().mockResolvedValue(respond([])));
    expect(excludePendingPairs(queue, closed)).toEqual(queue);
  });
  it("paginates both PRs and changed files", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(respond(Array.from({ length: 100 }, (_, i) => pull(i, "unrelated"))))
      .mockResolvedValueOnce(respond([pull(101)]))
      .mockResolvedValueOnce(respond(Array.from({ length: 100 }, (_, i) => file(`other/${i}`))))
      .mockResolvedValueOnce(respond([file("data/submissions/last/discovery/new.json")]));
    const pending = await loadPendingAutorunPairs("owner/repo", "token", fetcher);
    expect(pending.has("last/discovery")).toBe(true);
    expect(String(fetcher.mock.calls[1]![0])).toContain("page=2");
    expect(String(fetcher.mock.calls[3]![0])).toContain("page=2");
  });
  it("fails closed on lookup errors and missing credentials", async () => {
    await expect(loadPendingAutorunPairs("owner/repo", "", vi.fn())).rejects.toThrow("requires");
    await expect(loadPendingAutorunPairs("owner/repo", "token", vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 403 })))).rejects.toThrow("403");
    await expect(loadPendingAutorunPairs("owner/repo", "token", vi.fn<typeof fetch>().mockResolvedValue(respond({})))).rejects.toThrow("Invalid GitHub");
  });
});
