#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { SLICE_IDS } from "@defipunkd/prompts";
import { SubmissionSchema, type Submission } from "../schema";
import type { Assessment } from "../quorum";
import { buildDraftMaster, MasterSchema, type Master, type SubmissionBySlice } from "../master";
import { buildReconcilerPrompt } from "../reconciler-prompt";
import { findRepoRoot } from "../repo";

type ReconcileOptions = {
  slug: string;
  useLlm: boolean;
  model: string;
  claudeBin: string;
};

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const slugs: string[] = [];
  let useLlm = true;
  let model = "claude-sonnet-4-6";
  let claudeBin = "claude";

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--no-llm") useLlm = false;
    else if (a === "--model") model = args[++i]!;
    else if (a === "--claude-bin") claudeBin = args[++i]!;
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
      await reconcileSlug(root, { slug, useLlm, model, claudeBin });
    } catch (err) {
      console.error(`[reconcile] ${slug}: ${(err as Error).message}`);
      exitCode = 1;
    }
  }
  return exitCode;
}

async function reconcileSlug(root: string, opts: ReconcileOptions): Promise<void> {
  const { slug, useLlm, model, claudeBin } = opts;
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

    console.log(`[reconcile] ${slug}: calling ${claudeBin} --model ${model} (prompt ${prompt.length} chars, timeout ${LLM_TIMEOUT_MS}ms)…`);
    const t0 = Date.now();
    const llmResult = await invokeClaude(claudeBin, model, prompt);
    console.log(`[reconcile] ${slug}: ${claudeBin} returned in ${Date.now() - t0}ms (ok=${llmResult.ok})`);
    if (llmResult.ok) {
      const extracted = extractFencedJson(llmResult.output);
      const parsed = MasterSchema.safeParse(extracted);
      if (parsed.success) {
        master = parsed.data;
        console.log(`[reconcile] ${slug}: LLM synthesis OK (${model})`);
      } else {
        console.warn(
          `[reconcile] ${slug}: LLM output failed master schema, falling back to draft. First issue: ${parsed.error.issues[0]?.message}`,
        );
        master.flags.push(`reconciler: LLM output rejected by schema — ${parsed.error.issues[0]?.message ?? "unknown"}`);
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
      const parsed = SubmissionSchema.safeParse(raw);
      if (!parsed.success) continue;
      entries.push({ submission: parsed.data, sourcePath: `data/submissions/${slug}/${sliceId}/${f}` });
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

async function invokeClaude(claudeBin: string, model: string, prompt: string): Promise<LlmResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "ANTHROPIC_API_KEY not set" };
  }
  // stdin-pipe the prompt, --bare for reproducibility, inherit stderr so
  // any progress / error output is visible live in CI.
  return new Promise<LlmResult>((resolve) => {
    const child = spawn(
      claudeBin,
      [
        "--bare",
        "--model",
        model,
        "--output-format",
        "text",
        "--permission-mode",
        "bypassPermissions",
        "--verbose",
        "-p",
      ],
      { stdio: ["pipe", "pipe", "inherit"], env: process.env },
    );

    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    const heartbeat = setInterval(() => {
      console.log(`[reconcile] …still waiting on claude (stdout=${stdout.length} chars so far)`);
    }, 30_000);

    const timer = setTimeout(() => {
      console.error(`[reconcile] claude CLI timed out after ${LLM_TIMEOUT_MS}ms, killing child`);
      child.kill("SIGKILL");
    }, LLM_TIMEOUT_MS);

    child.on("error", (err) => {
      clearInterval(heartbeat);
      clearTimeout(timer);
      resolve({ ok: false, reason: err.message });
    });
    child.on("close", (code, signal) => {
      clearInterval(heartbeat);
      clearTimeout(timer);
      if (signal === "SIGKILL") {
        resolve({ ok: false, reason: `claude CLI timed out after ${LLM_TIMEOUT_MS}ms` });
      } else if (code !== 0) {
        resolve({ ok: false, reason: `claude CLI exit ${code}` });
      } else {
        resolve({ ok: true, output: stdout });
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
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
