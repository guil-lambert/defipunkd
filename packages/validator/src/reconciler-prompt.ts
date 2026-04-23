import type { Master } from "./master";
import type { Submission } from "./schema";

export type PromptInputs = {
  slug: string;
  draft: Master;
  submissionsBySlice: Record<
    Submission["slice"],
    Array<{ path: string; submission: Submission }>
  >;
};

/**
 * Builds the prompt passed to `claude -p "..."` in the reconcile GitHub Action.
 * The draft master is the deterministic-fallback output; Sonnet's job is to
 * improve it where warranted (better headline selection, cleaner evidence
 * ordering, protocol_metadata normalization) WITHOUT inventing facts.
 */
export function buildReconcilerPrompt(inputs: PromptInputs): string {
  const { slug, draft, submissionsBySlice } = inputs;

  // Trim each submission for the prompt: the draft master already carries
  // the winning submission's full rationale + evidence. For the prompt we
  // only need enough to let Sonnet decide whether to override the grade,
  // which headline reads clearest, and what protocol_metadata to union.
  // We keep: grade, headline, rationale, unknowns, protocol_metadata.
  // We drop: evidence[] (verbose, already in draft for winner), findings[]
  // text duplication, schema_version, snapshot_generated_at, analysis_date,
  // prompt_version, chat_url.
  const trimSubmission = (s: Submission) => ({
    model: s.model,
    grade: s.grade,
    headline: s.headline,
    rationale: s.rationale,
    unknowns: s.unknowns,
    protocol_metadata: s.protocol_metadata,
  });

  const submissionsBlock = Object.entries(submissionsBySlice)
    .map(([slice, entries]) => {
      if (entries.length === 0) return `### ${slice}\n(no submissions)`;
      const items = entries
        .map(
          (e, i) =>
            `#### ${slice} #${i + 1} — ${e.submission.model} — grade=${e.submission.grade}\npath: ${e.path}\n\n\`\`\`json\n${JSON.stringify(trimSubmission(e.submission), null, 2)}\n\`\`\``,
        )
        .join("\n\n");
      return `### ${slice}\n${items}`;
    })
    .join("\n\n");

  return `You are the defipunkd reconciler. You synthesize multiple independent LLM audit submissions for a single DeFi protocol into ONE canonical "master" JSON file, which is what the protocol page displays publicly.

## Your inputs

- slug: ${slug}
- draft master (deterministic output of the quorum step — your starting point):

\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

- per-slice submissions from independent LLM runs (Claude, GPT, Gemini, …):

${submissionsBlock}

## Your task

Produce an improved master file. Be conservative. Your judgment calls:

1. **Per-slice grade**: the draft already reflects the deterministic majority-weighted grade. You MAY override only if:
   - The highest-weighted submission's evidence clearly contradicts its own grade, OR
   - A later submission cites strictly stronger evidence (a block-explorer link pinning the real deployed state) that the majority missed.
   When you override, add an entry to \`flags[]\` explaining it: e.g. \`"control: overrode orange→red because submission #2 cited a UUPS proxy owner that is an EOA"\`.

2. **Per-slice headline**: pick the clearest one-liner across submissions of the winning grade. Must be one sentence, concrete, no hedging.

3. **Per-slice rationale**: pick the best \`rationale\` object from submissions of the winning grade. Don't merge rationales — pick one coherent voice.

4. **Evidence dedupe**: union evidence[] from all winning-grade submissions, deduped by URL. Prefer block-explorer URLs first, then GitHub commit-pinned URLs, then everything else.

5. **Dissent**: list each submission whose grade disagreed with the final grade, with a one-sentence \`reason\` field summarizing what they argued.

6. **protocol_metadata**: merge across ALL submissions (all slices). Union arrays (github, audits, admin_addresses) deduped by identity. For scalar fields (docs_url, governance_forum, voting_token, bug_bounty_url, security_contact, deployed_contracts_doc, upgradeability) pick the value supported by the most submissions; break ties by preferring values from the most recent prompt_version. Leave null/empty fields you cannot verify from the inputs.

7. **Flags**: raise \`flags[]\` entries for anything a human reviewer should notice:
   - strong dissent (≥1/3 submissions disagreed)
   - grade override you made
   - protocol_metadata fields with contradictory values across submissions
   - missing slices (no submissions)

## Hard rules

- Output EXACTLY one JSON object, wrapped in a single fenced \`\`\`json block. Nothing before or after.
- Set \`reconciler_model\` to the model name you are (e.g. "claude-sonnet-4-6").
- Set \`reconciler_kind\` to "llm".
- Set \`generated_at\` to the current ISO-8601 UTC datetime.
- \`source_submissions\` must include every submission you read (copy from the draft).
- Do NOT invent evidence URLs, admin addresses, or audit reports. Everything must trace back to the inputs above.
- The output MUST match the master schema exactly — all five slices present, all required fields filled.

## Shape reminders (these are the fields Sonnet is most likely to get wrong)

- \`protocol_metadata.admin_addresses\` is an array of OBJECTS, NOT strings. Each element MUST be \`{"chain": "<string>", "address": "0x…", "role": "<string>", "actor_class": "eoa" | "multisig" | "timelock" | "governance" | "unknown"}\`. NEVER emit \`["0x…", "0x…"]\` — always wrap each one.
- \`protocol_metadata.voting_token\` is either \`null\` or \`{"chain": "<string>", "address": "0x…", "symbol": "<string optional>"}\`. Not a bare address string.
- \`protocol_metadata.audits\` is an array of \`{"firm": "<string>", "url": "https://…", "date": "YYYY-MM"}\` objects, not a list of URLs.
- \`slices.<id>.rationale.steelman\` is either \`null\` (only when grade="unknown") or \`{"red": "...", "orange": "...", "green": "..."}\`. Not a single string.
- \`slices.<id>.dissent\` is an array; each element MUST be \`{"path": "<string>", "model": "<string>", "grade": "<grade>", "reason": "<string>"}\`. If no dissent, use \`[]\`.
- If a scalar field (\`docs_url\`, \`governance_forum\`, \`bug_bounty_url\`, etc.) has no verified value, OMIT it from \`protocol_metadata\` entirely — do NOT set it to \`"unknown"\` or \`""\`.

Output the JSON now.`;
}
