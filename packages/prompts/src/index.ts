import { preamble } from "./preamble";
import { controlBody } from "./slices/control";
import { abilityToExitBody } from "./slices/ability-to-exit";
import { dependenciesBody } from "./slices/dependencies";
import { accessBody } from "./slices/access";
import { verifiabilityBody } from "./slices/verifiability";

export const PROMPT_VERSION = 2;

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

  return `${preambleFilled}\n\n---\n\n${BODIES[slice]}\n\n---\n\n### JSON output contract\n\nReturn exactly one JSON object. Required fields:\n\n{\n  "schema_version": 1,\n  "slug": "${inputs.slug}",\n  "slice": "${slice}",\n  "snapshot_generated_at": "${inputs.snapshotGeneratedAt}",\n  "prompt_version": ${PROMPT_VERSION},\n  "analysis_date": "${inputs.analysisDate}",\n  "model": "(the exact model name you are)",\n  "grade": "green | orange | red | unknown",\n  "headline": "one-line summary, ≤80 chars",\n  "rationale": "prose, ≤600 chars; every claim must map to an evidence[] entry",\n  "evidence": [{ "url": "...", "shows": "what this URL demonstrates", "chain": "...", "address": "0x...", "commit": "...", "fetched_at": "ISO-8601" }],\n  "unknowns": ["things you looked for but couldn't determine"]\n}\n\nRules:\n- grade="unknown"  ⇒  unknowns[] must have ≥1 entry; evidence[] may be empty.\n- grade!="unknown" ⇒  evidence[] must have ≥1 entry.\n- No markdown fences, no prose outside JSON.\n`;
}

export { preamble } from "./preamble";
