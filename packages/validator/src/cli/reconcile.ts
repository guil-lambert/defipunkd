#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { SLICE_IDS } from "@defipunkd/prompts";
import { parseSubmissionsFromFileContent, type Submission } from "../schema";
import type { Assessment } from "../quorum";
import { buildDraftMaster, MasterSchema, type Master, type SubmissionBySlice } from "../master";
import { buildReconcilerPrompt } from "../reconciler-prompt";
import { findRepoRoot } from "../repo";

type ReconcileOptions = {
  slug: string;
  useLlm: boolean;
  model: string;
};

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const slugs: string[] = [];
  let useLlm = true;
  let model = "claude-sonnet-4-6";

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--no-llm") useLlm = false;
    else if (a === "--model") model = args[++i]!;
    else if (a === "--all") {
      // handled below
    } else if (!a.startsWith("--")) slugs.push(a);
  }

  const root = findRepoRoot();
  const submissionsDir = join(root, "data", "submissions");

  if (args.includes("--all")) {
    if (existsSync(submissionsDir)) {
      for (const d of readdirSync(submissionsDir, { withFileTypes: true })) {
        if (d.isDirectory()) slugs.push(d.name);
      }
    }
  }

  if (slugs.length === 0) {
    console.error("usage: defipunkd-reconcile <slug> [<slug>...] [--all] [--no-llm] [--model NAME] [--claude-bin PATH]");
    return 2;
  }

  let exitCode = 0;
  for (const slug of slugs) {
    try {
      await reconcileSlug(root, { slug, useLlm, model });
    } catch (err) {
      console.error(`[reconcile] ${slug}: ${(err as Error).message}`);
      exitCode = 1;
    }
  }
  return exitCode;
}

async function reconcileSlug(root: string, opts: ReconcileOptions): Promise<void> {
  const { slug, useLlm, model } = opts;
  const submissionsBySlice = loadSubmissions(root, slug);
  const totalSubmissions = Array.from(submissionsBySlice.values()).reduce((a, b) => a + b.length, 0);
  if (totalSubmissions === 0) {
    console.log(`[reconcile] ${slug}: no submissions, skipping`);
    return;
  }

  const assessmentsBySlice = loadAssessments(root, slug);
  const draft = buildDraftMaster({
    slug,
    now: new Date().toISOString(),
    submissionsBySlice,
    assessmentsBySlice,
  });

  let master: Master = draft;

  if (useLlm) {
    const promptInput = {
      slug,
      draft,
      submissionsBySlice: Object.fromEntries(
        SLICE_IDS.map((s) => [
          s,
          (submissionsBySlice.get(s) ?? []).map((e) => ({
            path: e.sourcePath,
            submission: e.submission,
          })),
        ]),
      ) as Parameters<typeof buildReconcilerPrompt>[0]["submissionsBySlice"],
    };
    const prompt = buildReconcilerPrompt(promptInput);

    const { inputTokens, worstCaseUsd } = estimateCost(prompt.length, MAX_OUTPUT_TOKENS);
    console.log(
      `[reconcile] ${slug}: calling Anthropic API — ${model} (prompt ${prompt.length} chars ≈ ${inputTokens} tokens, max_out=${MAX_OUTPUT_TOKENS}, worst-case ~$${worstCaseUsd.toFixed(3)}, timeout ${LLM_TIMEOUT_MS}ms)…`,
    );
    const t0 = Date.now();
    const llmResult = await invokeClaude(model, prompt);
    console.log(`[reconcile] ${slug}: API returned in ${Date.now() - t0}ms (ok=${llmResult.ok})`);
    if (llmResult.ok) {
      // Always save the raw output next to the master file for inspection,
      // regardless of whether it validated. Critical for diagnosing schema
      // drift between the prompt contract and what Sonnet actually emits.
      const rawPath = join(root, "data", "master", `${slug}.raw.txt`);
      mkdirSync(resolve(rawPath, ".."), { recursive: true });
      writeFileSync(rawPath, llmResult.output);
      console.log(`[reconcile] ${slug}: raw LLM output saved to ${rawPath}`);

      const extracted = extractFencedJson(llmResult.output);
      const { cleaned, salvageFlags } = salvageCommonShapeMistakes(extracted);
      const parsed = MasterSchema.safeParse(cleaned);
      if (parsed.success) {
        master = parsed.data;
        master.flags.push(...salvageFlags);
        console.log(
          `[reconcile] ${slug}: LLM synthesis OK (${model})${salvageFlags.length > 0 ? ` (${salvageFlags.length} fields salvaged)` : ""}`,
        );
      } else {
        const issues = parsed.error.issues.slice(0, 5).map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
        console.warn(
          `[reconcile] ${slug}: LLM output failed master schema (${parsed.error.issues.length} issues), falling back to draft:\n${issues}`,
        );
        const firstPath = parsed.error.issues[0]?.path.join(".") || "(root)";
        const firstMsg = parsed.error.issues[0]?.message ?? "unknown";
        master.flags.push(`reconciler: LLM output rejected by schema at ${firstPath} — ${firstMsg}`);
      }
    } else {
      console.warn(`[reconcile] ${slug}: LLM call failed (${llmResult.reason}), using deterministic draft`);
      master.flags.push(`reconciler: LLM call failed — ${llmResult.reason}`);
    }
  }

  const outPath = join(root, "data", "master", `${slug}.json`);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(master, null, 2) + "\n");
  console.log(`[reconcile] ${slug}: wrote ${outPath} (${master.reconciler_kind})`);
}

function loadSubmissions(root: string, slug: string): SubmissionBySlice {
  const out: SubmissionBySlice = new Map();
  const base = join(root, "data", "submissions", slug);
  if (!existsSync(base)) return out;
  for (const sliceId of SLICE_IDS) {
    const dir = join(base, sliceId);
    if (!existsSync(dir)) continue;
    const entries: Array<{ submission: Submission; sourcePath: string }> = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const full = join(dir, f);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(full, "utf8"));
      } catch {
        continue;
      }
      const result = parseSubmissionsFromFileContent(raw);
      if (!result.ok) continue;
      for (const { submission, index } of result.items) {
        const suffix = index === null ? "" : `#${index}`;
        entries.push({ submission, sourcePath: `data/submissions/${slug}/${sliceId}/${f}${suffix}` });
      }
    }
    if (entries.length > 0) out.set(sliceId, entries);
  }
  return out;
}

function loadAssessments(root: string, slug: string): Map<Submission["slice"], Assessment> {
  const out = new Map<Submission["slice"], Assessment>();
  const base = join(root, "data", "assessments", slug);
  if (!existsSync(base)) return out;
  for (const sliceId of SLICE_IDS) {
    const path = join(base, `${sliceId}.json`);
    if (!existsSync(path)) continue;
    try {
      out.set(sliceId, JSON.parse(readFileSync(path, "utf8")) as Assessment);
    } catch {
      // ignore
    }
  }
  return out;
}

type LlmResult = { ok: true; output: string } | { ok: false; reason: string };

const LLM_TIMEOUT_MS = Number(process.env.RECONCILE_LLM_TIMEOUT_MS ?? 10 * 60 * 1000);
// 8K output tokens is enough for a master file (~10KB text ≈ 3K tokens) with
// comfortable margin. Lower = tighter cost cap in runaway scenarios.
const MAX_OUTPUT_TOKENS = 8_000;

// Sonnet 4.6 pricing (as of 2026-04): $3 / Mtok input, $15 / Mtok output.
// Used only for cost-estimate logging so we see the bill before it lands.
const SONNET_INPUT_USD_PER_MTOK = 3;
const SONNET_OUTPUT_USD_PER_MTOK = 15;
const CHARS_PER_TOKEN_ESTIMATE = 4;

function estimateCost(promptChars: number, maxOutputTokens: number): {
  inputTokens: number;
  worstCaseUsd: number;
} {
  const inputTokens = Math.ceil(promptChars / CHARS_PER_TOKEN_ESTIMATE);
  const worstCaseUsd =
    (inputTokens * SONNET_INPUT_USD_PER_MTOK) / 1_000_000 +
    (maxOutputTokens * SONNET_OUTPUT_USD_PER_MTOK) / 1_000_000;
  return { inputTokens, worstCaseUsd };
}

async function invokeClaude(model: string, prompt: string): Promise<LlmResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "ANTHROPIC_API_KEY not set" };
  }
  const client = new Anthropic({ timeout: LLM_TIMEOUT_MS });

  const heartbeat = setInterval(() => {
    console.log(`[reconcile] …still waiting on Anthropic API`);
  }, 30_000);

  try {
    // Streaming so we get live "assistant is writing" progress without
    // holding the whole response in memory, and so long generations don't
    // hit the non-streaming 10-minute server-side limit.
    let output = "";
    const stream = client.messages.stream({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        output += event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    const u = final.usage;
    const actualUsd =
      (u.input_tokens * SONNET_INPUT_USD_PER_MTOK) / 1_000_000 +
      (u.output_tokens * SONNET_OUTPUT_USD_PER_MTOK) / 1_000_000;
    console.log(
      `[reconcile] usage: input=${u.input_tokens} output=${u.output_tokens} (actual ~$${actualUsd.toFixed(4)})`,
    );
    if (final.stop_reason === "max_tokens") {
      return { ok: false, reason: `hit max_tokens=${MAX_OUTPUT_TOKENS}, response truncated` };
    }
    return { ok: true, output };
  } catch (err) {
    const e = err as { message?: string; status?: number; error?: { message?: string } };
    const reason = `Anthropic API error${e.status ? ` (${e.status})` : ""}: ${e.error?.message ?? e.message ?? "unknown"}`;
    return { ok: false, reason };
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Rescue common shape mistakes Sonnet makes so one typo doesn't trash the
 * whole master file. Strictly defensive — if we can't safely coerce, we
 * drop the offending entry and record a flag so a human can re-check.
 */
function salvageCommonShapeMistakes(raw: unknown): { cleaned: unknown; salvageFlags: string[] } {
  const flags: string[] = [];
  if (!raw || typeof raw !== "object") return { cleaned: raw, salvageFlags: flags };
  const out = structuredClone(raw) as Record<string, unknown>;

  const pm = (out.protocol_metadata ?? {}) as Record<string, unknown>;

  // admin_addresses: strings → drop, flag. Keep only objects.
  if (Array.isArray(pm.admin_addresses)) {
    const before = pm.admin_addresses.length;
    const kept = pm.admin_addresses.filter((x) => x && typeof x === "object");
    if (kept.length !== before) {
      flags.push(`salvage: dropped ${before - kept.length} admin_addresses entries that were strings (should be objects)`);
      pm.admin_addresses = kept;
    }
  }

  // voting_token: string address → null + flag
  if (typeof pm.voting_token === "string") {
    flags.push(`salvage: voting_token was a bare string, dropped to null`);
    pm.voting_token = null;
  }

  // audits: string URLs → drop, flag
  if (Array.isArray(pm.audits)) {
    const before = pm.audits.length;
    const kept = pm.audits.filter((x) => x && typeof x === "object");
    if (kept.length !== before) {
      flags.push(`salvage: dropped ${before - kept.length} audits entries that were strings (should be {firm, url, date} objects)`);
      pm.audits = kept;
    }
  }

  // Drop empty-string scalars that should be omitted or URL-valid
  for (const key of ["docs_url", "governance_forum", "bug_bounty_url", "security_contact", "deployed_contracts_doc"]) {
    if (pm[key] === "" || pm[key] === "unknown") {
      flags.push(`salvage: ${key} was empty/unknown string, removed`);
      delete pm[key];
    }
  }

  out.protocol_metadata = pm;
  return { cleaned: out, salvageFlags: flags };
}

function extractFencedJson(output: string): unknown {
  const fenceMatch = output.match(/```json\s*\n([\s\S]*?)```/);
  const body = fenceMatch ? fenceMatch[1]! : output;
  try {
    return JSON.parse(body);
  } catch {
    const firstBrace = body.indexOf("{");
    const lastBrace = body.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(body.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

main().then((code) => process.exit(code));
