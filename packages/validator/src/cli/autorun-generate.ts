#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { buildPrompt, PROMPT_VERSION, SLICE_IDS, type SliceId } from "@defibeat/prompts";
import { SubmissionSchema } from "../schema";
import { cleanupSubmission } from "../cleanup";
import { findRepoRoot, loadSnapshot } from "../repo";

type QueueEntry = { slug: string; slice: SliceId };

type Args = { count: number; model: string };

function parseArgs(argv: string[]): Args {
  const out: Args = { count: 10, model: "claude-sonnet-4-6" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count") out.count = parseInt(argv[++i] ?? "10", 10);
    else if (argv[i] === "--model") out.model = argv[++i] ?? out.model;
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

  const queue = buildQueue(snapshot, submissionsDir).slice(0, args.count);
  if (queue.length === 0) {
    console.log("queue empty — nothing to do");
    return 0;
  }

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const analysisDate = new Date().toISOString().slice(0, 10);
  let written = 0;

  for (const { slug, slice } of queue) {
    const protocol = snapshot.protocols[slug];
    if (!protocol) continue;
    const prompt = buildPrompt(slice, {
      slug,
      name: protocol.name,
      chains: protocol.chains,
      category: protocol.category || null,
      website: protocol.website,
      github: protocol.github ?? [],
      auditLinks: protocol.audit_links ?? [],
      snapshotGeneratedAt: snapshot.generated_at,
      analysisDate,
      addressBook: null,
    });

    try {
      const resp = await client.messages.create({
        model: args.model,
        max_tokens: 4096,
        // Cast covers SDK versions where cache_control isn't in TextBlockParam yet.
        system: [
          {
            type: "text",
            text: prompt,
            cache_control: { type: "ephemeral" },
          },
        ] as unknown as string,
        messages: [
          { role: "user", content: "Produce the JSON assessment now." },
        ],
      });

      const text = resp.content
        .filter((c: { type: string }) => c.type === "text")
        .map((c) => (c as { type: "text"; text: string }).text)
        .join("");
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) {
        console.error(`[${slug}/${slice}] no JSON in response; skipping`);
        continue;
      }
      const raw = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      raw.model = `${args.model} (autorun)`;
      raw.chat_url = null;

      const { cleaned, errors } = cleanupSubmission(raw);
      if (errors.length > 0) {
        console.error(`[${slug}/${slice}] cleanup errors: ${errors.join("; ")}`);
        continue;
      }

      const parsed = SubmissionSchema.safeParse(cleaned);
      if (!parsed.success) {
        console.error(
          `[${slug}/${slice}] schema invalid: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" | ")}`,
        );
        continue;
      }

      const filename = buildFilename(args.model, analysisDate, parsed.data);
      const outDir = join(submissionsDir, slug, slice);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, filename), JSON.stringify(parsed.data, null, 2) + "\n");
      console.log(`[${slug}/${slice}] wrote ${filename} (grade=${parsed.data.grade})`);
      written++;
    } catch (err) {
      console.error(`[${slug}/${slice}] ${(err as Error).message}`);
    }
  }

  console.log(`\nautorun wrote ${written} / ${queue.length} submissions`);
  return 0;
}

function buildQueue(snapshot: ReturnType<typeof loadSnapshot>, submissionsDir: string): QueueEntry[] {
  const tasks: Array<QueueEntry & { priority: number; tvl: number | null }> = [];
  for (const [slug, p] of Object.entries(snapshot.protocols)) {
    if (p.delisted_at || p.is_dead) continue;
    for (const slice of SLICE_IDS) {
      const dir = join(submissionsDir, slug, slice);
      const count = existsSync(dir)
        ? readdirSync(dir).filter((f) => f.endsWith(".json")).length
        : 0;
      if (count >= 3) continue;
      tasks.push({ slug, slice, priority: count, tvl: p.tvl });
    }
  }
  tasks.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.tvl === null && b.tvl === null) return a.slug.localeCompare(b.slug);
    if (a.tvl === null) return 1;
    if (b.tvl === null) return -1;
    return b.tvl - a.tvl;
  });
  return tasks.map(({ slug, slice }) => ({ slug, slice }));
}

function buildFilename(model: string, date: string, submission: { slug: string; slice: string }): string {
  const modelSlug = model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = createHash("sha256")
    .update(`${submission.slug}|${submission.slice}|${model}|${date}|${process.pid}|${Date.now()}`)
    .digest("hex")
    .slice(0, 4);
  return `autorun-${modelSlug}-${date}-${hash}.json`;
}

main().then((code) => process.exit(code));
