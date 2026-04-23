import { preamble } from "./preamble";
import { controlBody } from "./slices/control";
import { abilityToExitBody } from "./slices/ability-to-exit";
import { dependenciesBody } from "./slices/dependencies";
import { accessBody } from "./slices/access";
import { verifiabilityBody } from "./slices/verifiability";

export const PROMPT_VERSION = 3;

export const SLICE_IDS = [
  "control",
  "ability-to-exit",
  "dependencies",
  "access",
  "verifiability",
] as const;

export type SliceId = (typeof SLICE_IDS)[number];

export type PromptInputs = {
  slug: string;
  name: string;
  chains: string[];
  category: string | null;
  website: string | null;
  github: string[];
  auditLinks: string[];
  snapshotGeneratedAt: string;
  analysisDate: string;
  addressBook: Array<{ chain: string; address: string; role?: string }> | null;
};

const BODIES: Record<SliceId, string> = {
  control: controlBody,
  "ability-to-exit": abilityToExitBody,
  dependencies: dependenciesBody,
  access: accessBody,
  verifiability: verifiabilityBody,
};

export function buildPrompt(slice: SliceId, inputs: PromptInputs): string {
  const preambleFilled = preamble
    .replace("{{slug}}", inputs.slug)
    .replace("{{name}}", inputs.name)
    .replace("{{chains}}", inputs.chains.length > 0 ? inputs.chains.join(", ") : "(none recorded)")
    .replace("{{category}}", inputs.category ?? "(unknown)")
    .replace("{{website}}", inputs.website ?? "(none recorded)")
    .replace("{{github_urls}}", inputs.github.length > 0 ? inputs.github.join(", ") : "(none recorded)")
    .replace(
      "{{audit_urls}}",
      inputs.auditLinks.length > 0 ? inputs.auditLinks.join(", ") : "(none recorded)",
    )
    .replace("{{snapshot_generated_at}}", inputs.snapshotGeneratedAt)
    .replace("{{analysis_date}}", inputs.analysisDate)
    .replace(
      "{{addresses_or_null}}",
      inputs.addressBook && inputs.addressBook.length > 0
        ? JSON.stringify(inputs.addressBook, null, 2)
        : "null",
    )
    .replace("{{prompt_version}}", String(PROMPT_VERSION));

  return `${preambleFilled}\n\n---\n\n${BODIES[slice]}\n\n---\n\n### JSON output contract\n\nReturn exactly one JSON object. Required fields:\n\n{\n  "schema_version": 1,\n  "slug": "${inputs.slug}",\n  "slice": "${slice}",\n  "snapshot_generated_at": "${inputs.snapshotGeneratedAt}",\n  "prompt_version": ${PROMPT_VERSION},\n  "analysis_date": "${inputs.analysisDate}",\n  "model": "(the exact model name you are, e.g. claude-opus-4-7, gpt-5-thinking, gemini-3-pro)",\n  "chat_url": "(OPTIONAL but strongly recommended) shareable URL of this chat session, e.g. https://claude.ai/share/...",\n  "grade": "green | orange | red | unknown",\n  "headline": "one-line summary, ≤80 chars",\n  "rationale": "prose, ≤600 chars; must contain the steel-man section per Hard Rule 13; every claim must map to an evidence[] entry",\n  "evidence": [{ "url": "https://...", "shows": "what this URL demonstrates", "chain": "...", "address": "0x...", "commit": "<hex SHA>", "fetched_at": "2026-04-23T11:20:00Z" }],\n  "unknowns": ["E3: thing you looked for but couldn't determine, prefixed with checklist code"]\n}\n\nRules recap:\n- grade="unknown"  ⇒  unknowns[] must have ≥1 entry; evidence[] may be empty.\n- grade!="unknown" ⇒  evidence[] must have ≥1 entry.\n- For slices that touch on-chain state (control, ability-to-exit, dependencies, verifiability): evidence[] must include ≥1 block-explorer URL.\n- unknowns[] entries should be prefixed with the checklist code they correspond to.\n- chat_url is optional; including a public share link gives your submission extra weight in the quorum bot.\n- No markdown fences, no prose outside JSON, no markdown link wrappers around URLs.\n`;
}

export { preamble } from "./preamble";
