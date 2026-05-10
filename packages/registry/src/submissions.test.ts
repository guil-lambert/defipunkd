import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadSubmissions } from "./submissions";
import type { SliceId } from "./assessments";

const RISK_SLICES: SliceId[] = ["control", "ability-to-exit", "autonomy", "open-access", "verifiability"];

let tempRoot: string | null = null;

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

function makeRoot(): string {
  tempRoot = mkdtempSync(join(tmpdir(), "defipunkd-registry-"));
  return tempRoot;
}

function sub(slice: SliceId, model = `model-${slice}`) {
  return {
    schema_version: 4,
    slug: "lido",
    slice,
    snapshot_generated_at: "2026-04-22T22:09:47.359Z",
    prompt_version: 29,
    analysis_date: "2026-05-10",
    model,
    chat_url: null,
    grade: "unknown",
    headline: `${slice} unknown`,
    rationale: { findings: [], steelman: null, verdict: "not enough evidence" },
    evidence: [],
    unknowns: [`${slice}: not enough evidence`],
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

describe("loadSubmissions", () => {
  it("fans all-directory submission arrays into their actual slices", () => {
    const dataDir = makeRoot();
    writeJson(
      join(dataDir, "submissions", "lido", "all", "models-2026-05-10.json"),
      RISK_SLICES.map((slice) => sub(slice)),
    );

    const bySlug = loadSubmissions(dataDir);
    const bySlice = bySlug.get("lido");

    expect(bySlice?.get("control")).toHaveLength(1);
    expect(bySlice?.get("control")?.[0]?.source_path.endsWith("submissions/lido/all/models-2026-05-10.json#0")).toBe(true);
    expect(bySlice?.get("verifiability")).toHaveLength(1);
    expect(bySlice?.get("discovery")).toBeUndefined();
  });
});
