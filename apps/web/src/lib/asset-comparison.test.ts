import { expect, it } from "vitest";
import type { LoadedAssessment, LoadedSubmission } from "@defipunkd/registry";
import { ASSET_CRITERIA, assetCriterion, safeEvidenceUrl } from "./asset-comparison";
it("always includes all five criteria without generating heuristic grades", () => {
  expect(ASSET_CRITERIA).toHaveLength(5);
  expect(assetCriterion().status).toBe("Not assessed");
  expect(assetCriterion().grade).toBe("gray");
});
it("keeps a submitted grade pending until consensus exists", () => {
  const c = assetCriterion(undefined, [{ grade: "green" } as LoadedSubmission]);
  expect(c.status).toBe("Review pending");
  expect(c.grade).toBe("gray");
});
it("preserves tentative consensus and unknown grades", () => {
  const a = { grade: "orange", strength: "weak", consensus_sources: [] } as unknown as LoadedAssessment;
  expect(assetCriterion(a).tentative).toBe(true);
  expect(assetCriterion({ ...a, grade: "unknown" }).grade).toBe("gray");
});
it("only links to web evidence", () => {
  expect(safeEvidenceUrl("javascript:alert(1)")).toBeUndefined();
  expect(safeEvidenceUrl("https://example.com/report")).toBe("https://example.com/report");
});
