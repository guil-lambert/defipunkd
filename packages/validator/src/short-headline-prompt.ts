import type { Submission } from "./schema";

export type ShortHeadlineInput = {
  slug: string;
  slice: Submission["slice"];
  consensus_grade: Submission["grade"];
  agreeing: Array<{
    model: string;
    headline: string;
    short_headline?: string;
  }>;
};

export function buildShortHeadlinePrompt(input: ShortHeadlineInput): string {
  const { slug, slice, consensus_grade, agreeing } = input;
  const sources = agreeing
    .map((a, i) => {
      const sh = a.short_headline ? `\n  short: ${a.short_headline}` : "";
      return `Source ${i + 1} (${a.model}):\n  headline: ${a.headline}${sh}`;
    })
    .join("\n\n");

  return `You are distilling a consensus risk verdict into an ultra-terse headline.

Protocol: ${slug}
Slice: ${slice}
Consensus grade: ${consensus_grade}

Below are the long-form headlines from the agreeing assessments. Combine them into ONE short verdict that captures the shared risk signal across all sources.

${sources}

Requirements:
- ≤6 words, ≤80 characters total
- Terse verdict — fits a narrow row beside a risk pizza
- Consistent with the consensus grade (${consensus_grade})
- No trailing punctuation, no quotes, no markdown
- Plain text only — output exactly ONE line, nothing else

Examples of the target style:
- "New requests pausable up to 11 days"
- "No user allowlists or geofences"
- "Oracle committee governs rebase reports"
- "Verified source + multiple recent audits"

Output the single line now, with no preamble or explanation.`;
}
