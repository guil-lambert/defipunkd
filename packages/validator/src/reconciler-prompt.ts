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

Produce an improved master file. You are SYNTHESIZING, not just picking — the master file should read like one careful assessment, not a copy-paste from any single submission. But every factual claim must trace back to content in the submissions below; you are combining their language, not inventing content.

1. **Per-slice grade**: the draft already reflects the deterministic majority-weighted grade. You MAY override only if:
   - The highest-weighted submission's evidence clearly contradicts its own grade, OR
   - A later submission cites strictly stronger evidence (a block-explorer link pinning the real deployed state) that the majority missed.
   When you override, add an entry to \`flags[]\` explaining it: e.g. \`"control: overrode orange→red because submission #2 cited a UUPS proxy owner that is an EOA"\`.

2. **Per-slice headline** — SYNTHESIZE: write a single sentence that captures the sharpest version of the winning-grade consensus. Draw language from across the submissions; prefer the most concrete quantitative claims (e.g. "14-day pause cap via 3/6 multisig" beats "can be paused by admins"). Don't echo any one submission verbatim — aim for the best sentence you could write given what the three submissions together observed. No hedging words ("some", "may be able to") unless the underlying fact is itself uncertain.

3. **Per-slice rationale** — SYNTHESIZE the rationale object:
   - \`findings[]\`: union the key observations across all winning-grade submissions. If three submissions each produced an \`E1\` about the same topic, merge them into one \`E1\` combining their strongest phrasings — not three redundant entries. Use your own \`code\` values (E1, E2, E3, …) numbered in order; ignore the submissions' original numbering. Each entry's \`text\` should be a coherent synthesis that includes the strongest specific details (addresses, role names, time bounds, function names) from whichever submission had them.
   - \`steelman\` — SYNTHESIZE three fresh paragraphs. For each of red/orange/green, write the strongest one-sentence case that grade could be made from the submissions' collective evidence. Don't copy any submission's steelman verbatim; combine the sharpest arguments.
   - \`verdict\`: write a fresh one-to-three-sentence verdict explaining why the winning grade ranks above the two adjacent grades, referencing the specific evidence that tips it. Must begin with "Choosing <grade> because".

4. **Evidence dedupe**: union evidence[] from all winning-grade submissions, deduped by URL. Prefer block-explorer URLs first, then GitHub commit-pinned URLs, then everything else. Keep the \`shows\` field short and specific. If two submissions cited the same URL with different \`shows\`, combine the sharpest details from each into one entry.

5. **Dissent** — SUMMARIZE: for each submission whose grade disagreed with the final grade, write a one-sentence \`reason\` that captures the substantive argument they made, not just "argued for red". Draw from their headline + verdict.

6. **protocol_metadata**: merge across ALL submissions (all slices). Union arrays (github, audits, admin_addresses) deduped by identity. For scalar fields (docs_url, governance_forum, voting_token, bug_bounty_url, security_contact, deployed_contracts_doc, upgradeability) pick the value supported by the most submissions; break ties by preferring values from the most recent prompt_version. Leave null/empty fields you cannot verify from the inputs.

7. **Flags**: raise \`flags[]\` entries for anything a human reviewer should notice:
   - strong dissent (≥1/3 submissions disagreed)
   - grade override you made
   - protocol_metadata fields with contradictory values across submissions
   - missing slices (no submissions)
   - synthesis choices worth calling out (e.g. "control: adopted gpt's Reseal Manager address but claude's role-list framing because claude's was more precise")

## Synthesis discipline (read before writing)

- **Every factual claim must be present in at least one submission.** You combine their words and emphasis; you do not introduce new facts. If no submission mentioned it, you cannot include it.
- **Prefer specific over general.** When a submission says "11 days via 3/6 GateSeal multisig 0x8772…" and another says "pausable by committee", keep the specific version.
- **Don't average disagreements.** If two submissions give different answers about a fact (e.g. different admin addresses), either pick the better-supported one and flag it, or include both and flag the contradiction. Don't smooth it over.
- **Length discipline.** findings[] entries should be 1–3 sentences each, not paragraphs. The full rationale fits the reader of a protocol summary card, not a security report.

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
