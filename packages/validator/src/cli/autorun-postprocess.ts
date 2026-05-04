#!/usr/bin/env tsx
// Post-processes raw autorun output files: extracts the JSON object the model
// emitted (skipping any leading prose / fenced code block), applies the
// autorun-only fixups (model suffix, chat_url null), runs cleanupSubmission,
// and validates against SubmissionSchema. Files that pass are rewritten in
// place as canonical JSON. Files that fail are deleted (or moved aside if
// --keep-failures is passed) so the resulting PR only contains valid
// submissions and the validate-submission workflow stays green.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { SubmissionSchema } from "../schema";
import { cleanupSubmission } from "../cleanup";
import { findRepoRoot } from "../repo";

type Args = { paths: string[] };

function parseArgs(argv: string[]): Args {
  const out: Args = { paths: [] };
  for (const a of argv) {
    if (!a.startsWith("--")) out.paths.push(a);
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

  // Autorun-only fixups. The model field the LLM wrote into the JSON is
  // unreliable — models routinely misidentify themselves — so we ignore it
  // and pull the real model from the filename, which the generator embeds
  // verbatim. Filename shape: autorun-<model-slug>-<date>-<hash>.json.
  const fname = basename(file);
  const m = /^autorun-(.+)-\d{4}-\d{2}-\d{2}-[a-f0-9]+\.json$/.exec(fname);
  const realModel = m ? m[1]! : "unknown";
  parsed.model = `${realModel} (autorun)`;
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

function fail(file: string, _args: Args, reason: string): void {
  console.error(`[FAIL] ${file}: ${reason} — left in place for manual curation`);
}

export function postProcess(opts: { paths?: string[] } = {}): { ok: number; failed: number } {
  const args: Args = { paths: opts.paths ?? [] };
  const root = findRepoRoot();
  const submissionsDir = join(root, "data", "submissions");

  const files: string[] = [];
  if (args.paths.length > 0) {
    for (const p of args.paths) {
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
    return { ok: 0, failed: 0 };
  }

  const results = files.map((f) => processFile(f, args));
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  console.log(`\npost-process: ${ok} ok, ${failed} failed (out of ${results.length})`);
  return { ok, failed };
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  postProcess({ paths: args.paths });
  return 0;
}

// Run as CLI when invoked directly.
const isMain = process.argv[1]?.endsWith("autorun-postprocess.ts") || process.argv[1]?.endsWith("autorun-postprocess.js");
if (isMain) process.exit(main());
