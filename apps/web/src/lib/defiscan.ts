import type { EnrichmentDefiScan, DefiScanStage } from "@defipunkd/registry";

/** URL the badge should link to: prefer the ethereum deployment when its
 * stage equals the headline; else any deployment whose stage equals the
 * headline; else the protocol's root page. Keeps the link's stage matching
 * the badge label so a "Stage 2" pill never opens a Stage 0 sub-page. */
export function defiscanBadgeUrl(d: EnrichmentDefiScan): string {
  if (d.headline_stage && d.deployments.length > 0) {
    const eth = d.deployments.find((x) => x.chain === "ethereum");
    if (eth && eth.stage === d.headline_stage) return eth.url;
    const match = d.deployments.find((x) => x.stage === d.headline_stage);
    if (match) return match.url;
  }
  return d.url;
}

export function defiscanStageLabel(stage: DefiScanStage | null): string | null {
  if (!stage) return null;
  if (stage === "R") return "Review";
  return `Stage ${stage}`;
}
