import { preamble } from "./preamble";
import { controlBody } from "./slices/control";
import { abilityToExitBody } from "./slices/ability-to-exit";
import { autonomyBody } from "./slices/autonomy";
import { accessBody } from "./slices/access";
import { verifiabilityBody } from "./slices/verifiability";
import { discoveryBody } from "./slices/discovery";

export const PROMPT_VERSION = 27;
export const SCHEMA_VERSION = 4;

// Chain-name → numeric chainId for the read API. Mirrors
// apps/web/src/lib/onchain/chains.ts. Kept inline (not imported from
// @defipunkd/enrichment) so the prompts package stays dependency-free.
const CHAIN_NAME_TO_ID: Record<string, number> = {
  ethereum: 1,
  optimism: 10,
  bsc: 56,
  unichain: 130,
  polygon: 137,
  zksync: 324,
  era: 324,
  base: 8453,
  arbitrum: 42161,
  avalanche: 43114,
  avax: 43114,
  linea: 59144,
  blast: 81457,
  scroll: 534352,
  sepolia: 11155111,
};

function surfacerUrlFor(chain: string, address: string): string | null {
  const id = CHAIN_NAME_TO_ID[chain.toLowerCase()];
  if (!id) return null;
  return `https://defipunkd.com/address/${id}/${address}`;
}

/**
 * Emit one concrete surfacer URL per address_book entry, formatted as a
 * bullet list. The URLs appear verbatim in the prompt context so browser-
 * tool URL allowlists (Claude.ai web_fetch, ChatGPT browser) accept them
 * for direct fetch. Without this, the LLM constructs the URLs from the
 * template and the allowlists reject them as "not in previous context."
 */
function buildSurfacerUrlBlock(
  addressBook: Array<{ chain: string; address: string; role?: string }> | null,
): string {
  if (!addressBook || addressBook.length === 0) return "(no addresses pinned in this run — discover candidates from fetched website / GitHub / audit / explorer pages, record discovered addresses in evidence[] and protocol_metadata.admin_addresses, and put any reads you couldn't perform in unknowns[]. The next assessment will inherit your discoveries.)";
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const entry of addressBook) {
    const url = surfacerUrlFor(entry.chain, entry.address);
    if (!url) {
      lines.push(`- ${entry.chain}: ${entry.address} (chain not supported by the read API)`);
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const role = entry.role ? ` (${entry.role})` : "";
    lines.push(`- ${url}${role}`);
  }
  return lines.join("\n");
}

export const SLICE_IDS = [
  "discovery",
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
  discovery: discoveryBody,
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
    .replace("{{address_book_surfacer_urls}}", buildSurfacerUrlBlock(inputs.addressBook))
    .replace("{{prompt_version}}", String(PROMPT_VERSION));

  return `${preambleFilled}\n\n---\n\n${BODIES[slice]}\n\n---\n\n### JSON output contract\n\nReturn exactly one JSON object inside a single \`\`\`json fenced block. Shape:\n\n{\n  "schema_version": ${SCHEMA_VERSION},\n  "slug": "${inputs.slug}",\n  "slice": "${slice}",\n  "snapshot_generated_at": "${inputs.snapshotGeneratedAt}",\n  "prompt_version": ${PROMPT_VERSION},\n  "analysis_date": "${inputs.analysisDate}",\n  "model": "<exact model name, e.g. claude-opus-4-7 / gpt-5-thinking / gemini-3-pro>",\n  "chat_url": null,\n  "grading_basis": "on-chain | off-chain-only | mixed (optional; omit for on-chain)",\n  "grade": "green | orange | red | unknown",\n  "headline": "<one-line summary>",\n  "short_headline": "<≤6 words, ≤80 chars; omit if you can't fit>",\n  "rationale": {\n    "findings": [{ "code": "E1", "text": "<concrete, source-cited finding>" }],\n    "steelman": { "red": "<one sentence>", "orange": "<one sentence>", "green": "<one sentence>" },\n    "verdict": "Choosing <grade> because <reason ranking one steel-man above the others, citing specific evidence>."\n  },\n  "evidence": [{ "url": "https://...", "shows": "<what this URL demonstrates>", "chain": "...", "address": "0x...", "commit": "<hex SHA>", "fetched_at": "2026-04-23T11:20:00Z" }],\n  "unknowns": ["E3: <thing you looked for but couldn't determine>"],\n  "protocol_metadata": {\n    "github": ["https://github.com/org/repo"],\n    "docs_url": "https://docs.protocol.xyz",\n    "audits": [{ "firm": "Trail of Bits", "url": "https://...report.pdf", "date": "2025-09" }],\n    "governance_forum": "https://forum.protocol.xyz",\n    "voting_token": { "chain": "Ethereum", "address": "0x...", "symbol": "XYZ" },\n    "bug_bounty_url": "https://immunefi.com/bounty/protocol",\n    "security_contact": "security@protocol.xyz",\n    "deployed_contracts_doc": "https://docs.protocol.xyz/deployments",\n    "admin_addresses": [{ "chain": "Ethereum", "address": "0x...", "role": "DAO treasury multisig", "actor_class": "multisig" }],\n    "upgradeability": "immutable | upgradeable | mixed | unknown",\n    "about": "<2–4 sentences>"\n  }\n}\n\nRules recap:\n- grade="unknown" ⇒ steelman=null; unknowns[] ≥1; evidence[] may be empty.\n- grade!="unknown" ⇒ steelman={red,orange,green}; evidence[] ≥1; verdict starts with "Choosing ".\n- findings[].code matches the slice's checklist prefix verbatim (E1, C2-emergency, V4a, …); unknowns[] entries are checklist-coded ("E3: …").\n- Wrap in a single \`\`\`json fence; nothing before or after. URLs are bare strings, never markdown links.\n`;
}

export { preamble } from "./preamble";
