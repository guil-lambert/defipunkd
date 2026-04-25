import { preamble } from "./preamble";
import { controlBody } from "./slices/control";
import { abilityToExitBody } from "./slices/ability-to-exit";
import { autonomyBody } from "./slices/autonomy";
import { accessBody } from "./slices/access";
import { verifiabilityBody } from "./slices/verifiability";

export const PROMPT_VERSION = 12;

export const SLICE_IDS = [
  "control",
  "ability-to-exit",
  "autonomy",
  "open-access",
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
  autonomy: autonomyBody,
  "open-access": accessBody,
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

  return `${preambleFilled}\n\n---\n\n${BODIES[slice]}\n\n---\n\n### JSON output contract\n\nReturn exactly one JSON object. Required fields:\n\n{\n  "schema_version": 3,\n  "slug": "${inputs.slug}",\n  "slice": "${slice}",\n  "snapshot_generated_at": "${inputs.snapshotGeneratedAt}",\n  "prompt_version": ${PROMPT_VERSION},\n  "analysis_date": "${inputs.analysisDate}",\n  "model": "(the exact model name you are, e.g. claude-opus-4-7, gpt-5-thinking, gemini-3-pro)",\n  "chat_url": null,\n  "grade": "green | orange | red | unknown",\n  "headline": "one-line summary, concise enough to fit on a protocol card",\n  "short_headline": "ultra-terse verdict, ≤6 words, fits a narrow row beside the risk pizza (e.g. \\"New requests pausable up to 11 days\\", \\"No user allowlists or geofences\\")",\n  "rationale": {\n    "findings": [\n      { "code": "E1", "text": "concrete, source-cited finding for checklist item E1" },\n      { "code": "E2", "text": "..." }\n    ],\n    "steelman": {\n      "red":    "one-sentence strongest argument the protocol deserves red",\n      "orange": "one-sentence strongest argument the protocol deserves orange",\n      "green":  "one-sentence strongest argument the protocol deserves green"\n    },\n    "verdict": "Choosing <grade> because <reason that ranks one steel-man above the others, citing specific evidence>."\n  },\n  "evidence": [{ "url": "https://...", "shows": "what this URL demonstrates", "chain": "...", "address": "0x...", "commit": "<hex SHA>", "fetched_at": "2026-04-23T11:20:00Z" }],\n  "unknowns": ["E3: thing you looked for but couldn't determine, prefixed with checklist code"],\n  "protocol_metadata": {\n    "github": ["https://github.com/org/repo"],\n    "docs_url": "https://docs.protocol.xyz",\n    "audits": [{ "firm": "Trail of Bits", "url": "https://...report.pdf", "date": "2025-09" }],\n    "governance_forum": "https://forum.protocol.xyz",\n    "voting_token": { "chain": "Ethereum", "address": "0x...", "symbol": "XYZ" },\n    "bug_bounty_url": "https://immunefi.com/bounty/protocol",\n    "security_contact": "security@protocol.xyz",\n    "deployed_contracts_doc": "https://docs.protocol.xyz/deployments",\n    "admin_addresses": [{ "chain": "Ethereum", "address": "0x...", "role": "DAO treasury multisig", "actor_class": "multisig" }],\n    "upgradeability": "immutable | upgradeable | mixed | unknown",\n    "about": "2-4 sentence plain-English description of what the protocol does (user action + asset/market + distinctive mechanism). See preamble for tone."\n  }\n}\n\nRules recap:\n- grade="unknown"  ⇒  unknowns[] must have ≥1 entry; evidence[] may be empty; rationale.steelman MUST be null; rationale.verdict should summarize what blocked the assessment.\n- grade!="unknown" ⇒  evidence[] must have ≥1 entry; rationale.steelman MUST be a {red,orange,green} object (all three one-sentence arguments present); rationale.verdict MUST begin with "Choosing ".\n- short_headline: ≤6 words, ≤80 chars; the verdict distilled so a reader can grasp the risk at a glance. Must be consistent with grade and headline. Omit the field if you cannot write one that short; do NOT truncate headline.\n- rationale.findings entries: one per checklist item inspected. "code" matches the checklist prefix exactly (E1, C2-emergency, V4a, …). "text" is the concrete factual finding, not a question.\n- For slices that touch on-chain state (control, ability-to-exit, autonomy, verifiability): evidence[] must include ≥1 block-explorer URL.\n- unknowns[] entries should be prefixed with the checklist code they correspond to.\n- chat_url MUST be null in your output. The user will enable public sharing on this chat session and paste the resulting URL into chat_url before submitting. Do not attempt to generate this URL yourself.\n- Wrap the JSON in a single \`\`\`json fenced code block (per Hard Rule 5) so the chat UI's copy button gives a clean single-click copy. Nothing before or after the fence.\n- No markdown link wrappers around URLs inside the JSON.
- protocol_metadata: populate every field you verified in this run; leave others null or as empty arrays. Do NOT echo the pinned-input values through — null means "not re-verified", not "same as input". Every non-null metadata field must be citable from evidence[].\n`;
}

export { preamble } from "./preamble";
