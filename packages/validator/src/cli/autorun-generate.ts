#!/usr/bin/env tsx
import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { buildPromptParts, SLICE_IDS, type SliceId } from "@defipunkd/prompts";
import { getProtocolMetadata } from "@defipunkd/registry";
import { findRepoRoot, loadSnapshot } from "../repo";
import { postProcess } from "./autorun-postprocess";

type QueueEntry = { slug: string; slice: SliceId };

type Args = { count: number; model: string; slice: SliceId | null; slug: string | null; postprocess: boolean; maxCost: number | null };

function parseArgs(argv: string[]): Args {
  const out: Args = { count: 10, model: "claude-sonnet-4-6", slice: null, slug: null, postprocess: false, maxCost: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count") out.count = parseInt(argv[++i] ?? "10", 10);
    else if (argv[i] === "--model") out.model = argv[++i] ?? out.model;
    else if (argv[i] === "--slice") out.slice = (argv[++i] ?? null) as SliceId | null;
    else if (argv[i] === "--slug") out.slug = argv[++i] ?? null;
    else if (argv[i] === "--postprocess") out.postprocess = true;
    else if (argv[i] === "--max-cost") out.maxCost = parseFloat(argv[++i] ?? "");
  }
  return out;
}

async function main(): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required");
    return 2;
  }

  const args = parseArgs(process.argv.slice(2));
  const root = findRepoRoot();
  const snapshot = loadSnapshot(root);
  const submissionsDir = join(root, "data", "submissions");

  const queue = buildQueue(snapshot, submissionsDir, args.slice, args.slug).slice(0, args.count);
  if (queue.length === 0) {
    console.log("queue empty — nothing to do");
    return 0;
  }

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const analysisDate = new Date().toISOString().slice(0, 10);
  let written = 0;
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreateTokens: 0,
    cacheReadTokens: 0,
    webSearches: 0,
  };

  for (const { slug, slice } of queue) {
    if (args.maxCost !== null) {
      const spent = estimateCost(args.model, totals);
      if (spent >= args.maxCost) {
        console.log(`max-cost $${args.maxCost.toFixed(2)} reached (spent $${spent.toFixed(4)}); stopping`);
        break;
      }
    }
    const protocol = snapshot.protocols[slug];
    if (!protocol) continue;
    // Cross-run ratchet: pull previously-discovered admin addresses (from
    // master/assessments via the registry) and feed them as the addressBook so
    // the prompt's surfacer-URL block is non-empty. Discovery's own runs see
    // any prior catalogue and extend rather than re-discover from scratch.
    const meta = getProtocolMetadata(slug);
    const addressBook =
      meta?.admin_addresses && meta.admin_addresses.length > 0
        ? meta.admin_addresses.map((a) => ({
            chain: a.chain,
            address: a.address,
            role: a.role,
          }))
        : null;

    // Mainnet-first for fresh slugs: when there is no addressBook ratchet yet,
    // restrict the prompt's chain list to ethereum (if present) so the model
    // doesn't burn web_search calls cataloguing L2 deployments before the
    // canonical mainnet contracts are pinned. Once a ratchet exists, expose
    // the full chain list so subsequent runs can extend coverage.
    const mainnetFocus = addressBook === null && protocol.chains.includes("ethereum");
    const promptChains = mainnetFocus ? ["ethereum"] : protocol.chains;
    if (mainnetFocus) {
      console.log(`[${slug}/${slice}] fresh slug — restricting to ethereum mainnet (full chain list: ${protocol.chains.join(",")})`);
    }

    const { system, userContext } = buildPromptParts(slice, {
      slug,
      name: protocol.name,
      chains: promptChains,
      category: protocol.category || null,
      website: protocol.website,
      github: protocol.github ?? [],
      auditLinks: protocol.audit_links ?? [],
      snapshotGeneratedAt: snapshot.generated_at,
      analysisDate,
      addressBook,
    });

    try {
      const resp = await client.messages.create({
        model: args.model,
        max_tokens: 16384,
        system: [
          {
            type: "text",
            text: system,
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
        ] as unknown as string,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 4,
          },
          {
            type: "web_fetch_20250910",
            name: "web_fetch",
            max_uses: 12,
          },
        ] as unknown as never,
        messages: [
          {
            role: "user",
            content:
              `${userContext}\n\n---\n\nRun the slice's discovery / evaluation steps. You have two tools: \`web_fetch\` (preferred — pulls a specific URL's full contents) and \`web_search\` (for when you need to discover a URL you don't already have). The prompt names specific URLs (block-explorer pages, docs, GitHub, audits, the read-API surfacers) — use \`web_fetch\` on those directly rather than searching for them. After your investigation, produce the final JSON assessment object as the last message in your response.`,
          },
        ],
      });

      const text = resp.content
        .filter((c: { type: string }) => c.type === "text")
        .map((c) => (c as { type: "text"; text: string }).text)
        .join("");

      if (text.length === 0) {
        console.error(`[${slug}/${slice}] empty response; skipping`);
        continue;
      }

      const stopReason = (resp as { stop_reason?: string }).stop_reason;
      if (stopReason && stopReason !== "end_turn") {
        console.warn(`[${slug}/${slice}] stop_reason=${stopReason} — saving raw output anyway`);
      }

      const filename = buildFilename(args.model, analysisDate, slug, slice);
      const outDir = join(submissionsDir, slug, slice);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, filename), text);

      const usage = (resp as unknown as {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
          server_tool_use?: { web_search_requests?: number };
        };
      }).usage ?? {};
      const inTok = usage.input_tokens ?? 0;
      const outTok = usage.output_tokens ?? 0;
      const cacheCreate = usage.cache_creation_input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const searches = usage.server_tool_use?.web_search_requests ?? 0;
      totals.inputTokens += inTok;
      totals.outputTokens += outTok;
      totals.cacheCreateTokens += cacheCreate;
      totals.cacheReadTokens += cacheRead;
      totals.webSearches += searches;
      const callCost = estimateCost(args.model, {
        inputTokens: inTok,
        outputTokens: outTok,
        cacheCreateTokens: cacheCreate,
        cacheReadTokens: cacheRead,
        webSearches: searches,
      });
      console.log(
        `[${slug}/${slice}] wrote ${filename} (${text.length} bytes) — ` +
          `in=${inTok} out=${outTok} cache_w=${cacheCreate} cache_r=${cacheRead} ` +
          `searches=${searches} cost=$${callCost.toFixed(4)}`,
      );
      written++;
    } catch (err) {
      console.error(`[${slug}/${slice}] ${(err as Error).message}`);
    }
  }

  const totalCost = estimateCost(args.model, totals);
  console.log(`\nautorun wrote ${written} / ${queue.length} submissions`);
  console.log(
    `usage: input=${totals.inputTokens} output=${totals.outputTokens} ` +
      `cache_write=${totals.cacheCreateTokens} cache_read=${totals.cacheReadTokens} ` +
      `web_searches=${totals.webSearches}`,
  );
  console.log(`estimated cost: $${totalCost.toFixed(4)} (model=${args.model})`);

  if (args.postprocess && written > 0) {
    console.log(`\n--- post-processing ${written} new submission(s) ---`);
    postProcess();
  }
  return 0;
}

// Per-million-token rates (USD). Pricing is best-effort and may drift; treat
// the printed cost as an estimate, not a bill. Web search is $10 per 1k calls.
const PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-opus-4-7": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-opus-4-6": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-opus-4-5": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

function estimateCost(
  model: string,
  u: { inputTokens: number; outputTokens: number; cacheCreateTokens: number; cacheReadTokens: number; webSearches: number },
): number {
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  if (!key) return 0;
  const p = PRICING[key]!;
  return (
    (u.inputTokens * p.input) / 1_000_000 +
    (u.outputTokens * p.output) / 1_000_000 +
    (u.cacheCreateTokens * p.cacheWrite) / 1_000_000 +
    (u.cacheReadTokens * p.cacheRead) / 1_000_000 +
    (u.webSearches * 10) / 1000
  );
}

function buildQueue(snapshot: ReturnType<typeof loadSnapshot>, submissionsDir: string, sliceFilter: SliceId | null, slugFilter: string | null): QueueEntry[] {
  const tasks: Array<QueueEntry & { priority: number; tvl: number | null; isDiscovery: boolean }> = [];
  for (const [slug, p] of Object.entries(snapshot.protocols)) {
    if (slugFilter !== null && slug !== slugFilter) continue;
    if (p.delisted_at || p.is_dead) continue;

    const discoveryDir = join(submissionsDir, slug, "discovery");
    const discoveryCount = existsSync(discoveryDir)
      ? readdirSync(discoveryDir).filter((f) => f.endsWith(".json")).length
      : 0;
    const meta = getProtocolMetadata(slug);
    const hasRatchet = (meta?.admin_addresses?.length ?? 0) > 0;
    // Evaluation slices need a non-empty addressBook to be useful. Until
    // discovery has produced one OR the registry already has admin addresses
    // from earlier runs, gate the 5 risk slices and let discovery go first.
    const evaluationGated = !hasRatchet && discoveryCount === 0;

    if (p.category === "CEX") continue;

    for (const slice of SLICE_IDS) {
      if (sliceFilter !== null && slice !== sliceFilter) continue;
      const isDiscovery = slice === "discovery";
      if (!isDiscovery && evaluationGated) continue;
      const dir = join(submissionsDir, slug, slice);
      const count = existsSync(dir)
        ? readdirSync(dir).filter((f) => f.endsWith(".json")).length
        : 0;
      if (count >= (isDiscovery ? 1 : 3)) continue;
      tasks.push({ slug, slice, priority: count, tvl: p.tvl, isDiscovery });
    }
  }
  tasks.sort((a, b) => {
    // Discovery first per (slug, priority) so a fresh protocol catalogues
    // before its evaluation slices run in the same autorun pass.
    if (a.isDiscovery !== b.isDiscovery) return a.isDiscovery ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.tvl === null && b.tvl === null) return a.slug.localeCompare(b.slug);
    if (a.tvl === null) return 1;
    if (b.tvl === null) return -1;
    return b.tvl - a.tvl;
  });
  return tasks.map(({ slug, slice }) => ({ slug, slice }));
}

function buildFilename(model: string, date: string, slug: string, slice: string): string {
  const modelSlug = model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = createHash("sha256")
    .update(`${slug}|${slice}|${model}|${date}|${process.pid}|${Date.now()}`)
    .digest("hex")
    .slice(0, 4);
  return `autorun-${modelSlug}-${date}-${hash}.json`;
}

main().then((code) => process.exit(code));
