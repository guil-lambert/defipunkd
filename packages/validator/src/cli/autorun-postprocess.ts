#!/usr/bin/env tsx
// Post-processes raw autorun output files: extracts the JSON object the model
// emitted (skipping any leading prose / fenced code block), applies the
// autorun-only fixups (model suffix, chat_url null), runs cleanupSubmission,
// and validates against SubmissionSchema. Files that pass are rewritten in
// place as canonical JSON. Files that fail are deleted (or moved aside if
// --keep-failures is passed) so the resulting PR only contains valid
// submissions and the validate-submission workflow stays green.
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, renameSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { SubmissionSchema } from "../schema";
import { cleanupSubmission } from "../cleanup";
import { findRepoRoot } from "../repo";

type Args = { keepFailures: boolean; paths: string[] };

function parseArgs(argv: string[]): Args {
  const out: Args = { keepFailures: false, paths: [] };
  for (const a of argv) {
    if (a === "--keep-failures") out.keepFailures = true;
    else if (!a.startsWith("--")) out.paths.push(a);
  }
  return out;
}

function extractFencedJson(text: string): string | null {
  // ```json\n...\n``` or ```\n{...}\n```. Greedy on the body, non-greedy on
  // the closing fence to avoid matching past the end.
  const fence = /```(?:json)?\s*\n([\s\S]*?)\n```/;
  const m = fence.exec(text);
  return m ? m[1]! : null;
}

function extractBraceWalked(text: string): Record<string, unknown> | null {
  // Walk every '{' and prefer an object containing the wrapper keys.
  let firstParseable: Record<string, unknown> | null = null;
  let pos = 0;
  while (pos < text.length) {
    const next = text.indexOf("{", pos);
    if (next === -1) break;
    const obj = parseFromBrace(text, next);
    if (obj !== null) {
      if ("schema_version" in obj || ("slug" in obj && "slice" in obj)) return obj;
      if (firstParseable === null) firstParseable = obj;
    }
    pos = next + 1;
  }
  return firstParseable;
}

function parseFromBrace(text: string, start: number): Record<string, unknown> | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = extractFencedJson(raw);
  if (fenced !== null) {
    try { return JSON.parse(fenced); } catch { /* fall through */ }
  }
  return extractBraceWalked(raw);
}

function isAlreadyClean(raw: string): boolean {
  // Already-canonical JSON (e.g. processed by a prior run, or hand-written).
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("{")) return false;
  try {
    const obj = JSON.parse(trimmed);
    return typeof obj === "object" && obj !== null && "schema_version" in obj;
  } catch {
    return false;
  }
}

type Result = { file: string; ok: boolean; reason?: string };

function processFile(file: string, args: Args): Result {
  const raw = readFileSync(file, "utf8");

  if (isAlreadyClean(raw)) {
    return { file, ok: true, reason: "already-clean" };
  }

  const parsed = extractJson(raw);
  if (parsed === null) {
    fail(file, args, "no JSON object could be extracted from raw output");
    return { file, ok: false, reason: "no-json-extracted" };
  }
  if (!("schema_version" in parsed) || !("slug" in parsed) || !("slice" in parsed)) {
    fail(file, args, "extracted JSON missing wrapper fields (schema_version/slug/slice)");
    return { file, ok: false, reason: "missing-wrapper" };
  }

  // Autorun-only fixups: tag model so quorum bot can weight, null any chat_url
  // the model invented (it has no real chat URL — it ran via API).
  const model = typeof parsed.model === "string" ? parsed.model : "unknown";
  if (!/\(autorun\)/.test(model)) parsed.model = `${model} (autorun)`;
  parsed.chat_url = null;

  const { cleaned, errors: cleanupErrors } = cleanupSubmission(parsed);
  if (cleanupErrors.length > 0) {
    fail(file, args, `cleanup errors: ${cleanupErrors.join("; ")}`);
    return { file, ok: false, reason: "cleanup-failed" };
  }

  const validated = SubmissionSchema.safeParse(cleaned);
  if (!validated.success) {
    const detail = validated.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(" | ");
    fail(file, args, `schema invalid: ${detail}`);
    return { file, ok: false, reason: "schema-invalid" };
  }

  writeFileSync(file, JSON.stringify(validated.data, null, 2) + "\n");
  return { file, ok: true };
}

function fail(file: string, args: Args, reason: string): void {
  console.error(`[FAIL] ${file}: ${reason}`);
  if (args.keepFailures) {
    const quarantine = join(dirname(file), "..", "..", "..", "tmp", "autorun-failures");
    mkdirSync(quarantine, { recursive: true });
    renameSync(file, join(quarantine, basename(file)));
    console.error(`        moved to ${quarantine}/${basename(file)}`);
  } else {
    unlinkSync(file);
    console.error(`        deleted ${file}`);
  }
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const root = findRepoRoot();
  const submissionsDir = join(root, "data", "submissions");

  const files: string[] = [];
  if (args.paths.length > 0) {
    // Explicit paths: accept files or directories. Resolve relative to cwd.
    for (const p of args.paths) {
      // Resolve relative paths against the repo root so the script works the
      // same whether invoked via `pnpm --filter` (cwd = package dir) or from
      // the repo root.
      const abs = p.startsWith("/") ? p : join(root, p);
      const s = statSync(abs);
      if (s.isFile()) files.push(abs);
      else if (s.isDirectory()) {
        for (const f of readdirSync(abs)) {
          if (f.endsWith(".json")) files.push(join(abs, f));
        }
      }
    }
  } else {
    for (const slug of readdirSync(submissionsDir)) {
      const slugDir = join(submissionsDir, slug);
      if (!statSync(slugDir).isDirectory()) continue;
      for (const slice of readdirSync(slugDir)) {
        const sliceDir = join(slugDir, slice);
        if (!statSync(sliceDir).isDirectory()) continue;
        for (const f of readdirSync(sliceDir)) {
          if (f.startsWith("autorun-") && f.endsWith(".json")) {
            files.push(join(sliceDir, f));
          }
        }
      }
    }
  }

  if (files.length === 0) {
    console.log("no autorun-*.json files to post-process");
    return 0;
  }

  const results = files.map((f) => processFile(f, args));
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  console.log(`\npost-process: ${ok} ok, ${failed} failed (out of ${results.length})`);
  // Don't fail the overall job for individual extraction failures — the
  // autorun PR should still go up with whatever passed. Operator inspects the
  // log if the failure rate looks wrong.
  return 0;
}

process.exit(main());
