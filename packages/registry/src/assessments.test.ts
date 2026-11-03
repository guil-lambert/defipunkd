import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAssessments } from "./assessments";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

it.each(["2026-05-01", undefined, "invalid"])("keeps analysis date separate from merge time (%s)", (analysisDate) => {
  const root = mkdtempSync(join(tmpdir(), "assessment-dates-"));
  roots.push(root);
  const data = join(root, "data");
  mkdirSync(join(data, "assessments", "example"), { recursive: true });
  writeFileSync(join(data, "runs.json"), JSON.stringify([
    { analysis_date: "2026-01-01" },
    { analysis_date: analysisDate, headline: "Example", rationale: { findings: [], steelman: null, verdict: "Example" } },
  ]));
  writeFileSync(join(data, "assessments", "example", "control.json"), JSON.stringify({
    schema_version: 3, slug: "example", slice: "control",
    consensus_grade: "orange", consensus_strength: "strong",
    primary_submission_path: "data/runs.json#1",
    merged_at: "2026-11-03T00:00:00Z", merged_from: [],
  }));
  const assessment = loadAssessments(data).get("example")?.get("control");
  expect(assessment?.primary_analysis_date).toBe(analysisDate === "2026-05-01" ? analysisDate : undefined);
  expect(assessment?.merged_at).toBe("2026-11-03T00:00:00Z");
});
