import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RISK_SLICES, type Submission } from "./schema";
import { loadSubmissionEntriesBySlice } from "./submission-files";

let tempRoot: string | null = null;

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

function makeRoot(): string {
  tempRoot = mkdtempSync(join(tmpdir(), "defipunkd-submissions-"));
  return tempRoot;
}

function sub(slice: Submission["slice"], model = `model-${slice}`): Submission {
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

describe("loadSubmissionEntriesBySlice", () => {
  it("fans all-directory arrays into their actual slice buckets", () => {
    const submissionsDir = makeRoot();
    writeJson(
      join(submissionsDir, "lido", "all", "models-2026-05-10.json"),
      RISK_SLICES.map((slice) => sub(slice)),
    );

    const bySlice = loadSubmissionEntriesBySlice(submissionsDir, "lido");

    for (const [index, slice] of RISK_SLICES.entries()) {
      expect(bySlice.get(slice)).toHaveLength(1);
      expect(bySlice.get(slice)?.[0]?.submission.slice).toBe(slice);
      expect(bySlice.get(slice)?.[0]?.sourcePath).toBe(`data/submissions/lido/all/models-2026-05-10.json#${index}`);
    }
  });

  it("keeps normal slice files and skips mismatched normal directories", () => {
    const submissionsDir = makeRoot();
    writeJson(join(submissionsDir, "lido", "control", "control.json"), sub("control", "good"));
    writeJson(join(submissionsDir, "lido", "control", "wrong.json"), sub("autonomy", "wrong"));

    const bySlice = loadSubmissionEntriesBySlice(submissionsDir, "lido");

    expect(bySlice.get("control")?.map((e) => e.submission.model)).toEqual(["good"]);
    expect(bySlice.get("autonomy")).toBeUndefined();
  });

  it("skips discovery entries in the all directory", () => {
    const submissionsDir = makeRoot();
    writeJson(join(submissionsDir, "lido", "all", "bad.json"), [sub("discovery", "bad")]);

    const bySlice = loadSubmissionEntriesBySlice(submissionsDir, "lido");

    expect(bySlice.get("discovery")).toBeUndefined();
  });
});
