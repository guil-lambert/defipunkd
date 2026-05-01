// Tunable thresholds for the "tentative" / dashed treatment on merged
// assessments. A consensus that crosses any one of these into the
// confidence-low region renders dashed with a tooltip listing the reasons.
export const CONFIDENCE_THRESHOLDS = {
  /** Fraction of submissions (counted by submission, not unique model) that
   *  must include a public chat share URL. Below this → dashed. */
  URL_COVERAGE_MIN: 0.5,
  /** Fraction of total effective weight allowed to come from
   *  hallucination-prone models. At or above this → dashed. */
  HALLUCINATION_WEIGHT_MAX: 0.5,
  /** Sum of effective submission weights below this floor → dashed.
   *  A single careful, full-weight Opus submission with explorer evidence
   *  sits around 1.5; below that the support is effectively one source or
   *  several heavily-penalized ones. */
  TOTAL_WEIGHT_MIN: 1.5,
} as const;

// Mirror of packages/validator/src/cross-check.ts. Duplicated here instead
// of cross-importing the validator package into the browser bundle.
export function isHallucinationProneModel(model: string): boolean {
  const m = model.toLowerCase();
  if (/claude-haiku-4-5/.test(m)) return true;
  if (/gemini-3-flash-preview/.test(m)) return true;
  const gpt = m.match(/gpt-(\d+(?:\.\d+)?)/);
  if (gpt && parseFloat(gpt[1]!) <= 5.3) return true;
  return false;
}

export function isThinkingModel(model: string): boolean {
  const m = model.toLowerCase();
  if (/thinking|reason/.test(m)) return true;
  if (/claude-opus/.test(m)) return true;
  if (/^o\d/.test(m)) return true;
  if (/gemini-(?:3|[4-9])(?:\.\d+)?-pro/.test(m)) return true;
  return false;
}

export function isNonThinkingModel(model: string): boolean {
  return !isHallucinationProneModel(model) && !isThinkingModel(model);
}

export type ConsensusSource = {
  model: string;
  chat_url: string | null;
  weight: number;
};

export type ConfidenceVerdict = {
  tentative: boolean;
  reasons: string[];
};

export function assessConfidence(
  sources: ConsensusSource[] | undefined,
  strength: "strong" | "weak" | undefined,
): ConfidenceVerdict {
  const reasons: string[] = [];

  if (strength === "weak") {
    reasons.push("weak consensus margin");
  }

  if (!sources || sources.length === 0) {
    return { tentative: reasons.length > 0, reasons };
  }

  const total = sources.length;
  const withUrl = sources.filter((s) => !!s.chat_url).length;
  const urlCoverage = total > 0 ? withUrl / total : 0;
  if (urlCoverage < CONFIDENCE_THRESHOLDS.URL_COVERAGE_MIN) {
    reasons.push(`only ${withUrl}/${total} sources have a public chat share link`);
  }

  const totalWeight = sources.reduce((acc, s) => acc + s.weight, 0);
  const hallucinationWeight = sources
    .filter((s) => isHallucinationProneModel(s.model))
    .reduce((acc, s) => acc + s.weight, 0);
  const hallucinationShare = totalWeight > 0 ? hallucinationWeight / totalWeight : 0;
  if (hallucinationShare >= CONFIDENCE_THRESHOLDS.HALLUCINATION_WEIGHT_MAX) {
    reasons.push(
      `${Math.round(hallucinationShare * 100)}% of weight from hallucination-prone models`,
    );
  }

  if (totalWeight < CONFIDENCE_THRESHOLDS.TOTAL_WEIGHT_MIN) {
    reasons.push(
      `total support weight ${totalWeight.toFixed(2)} below confidence floor (${CONFIDENCE_THRESHOLDS.TOTAL_WEIGHT_MIN})`,
    );
  }

  return { tentative: reasons.length > 0, reasons };
}
