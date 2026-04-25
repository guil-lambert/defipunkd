#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { PROMPT_VERSION } from "@defipunkd/prompts";
import { SubmissionSchema } from "../schema";
import { cleanupSubmission } from "../cleanup";
import { crossCheck } from "../cross-check";
import { findRepoRoot, loadSnapshot } from "../repo";

type Report = {
  file: string;
  errors: string[];
  warnings: string[];
  autoFixed: string[];
};

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const files = args.filter((a) => !a.startsWith("--"));

  if (files.length === 0) {
    console.error("usage: defipunkd-validate <file.json> [<file.json> ...] [--write]");
    return 2;
  }

  const root = findRepoRoot();
  const snapshot = loadSnapshot(root);
  const knownSlugs = new Set(Object.keys(snapshot.protocols));

  let hadError = false;
  const reports: Report[] = [];

  for (const argFile of files) {
    const file = isAbsolute(argFile) ? argFile : resolve(root, argFile);
    const relative = file.startsWith(root) ? file.slice(root.length + 1) : file;
    const report: Report = { file: relative, errors: [], warnings: [], autoFixed: [] };

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      report.errors.push(`invalid JSON: ${(err as Error).message}`);
      reports.push(report);
      hadError = true;
      continue;
    }

    const isArray = Array.isArray(raw);
    const rawItems = isArray ? (raw as unknown[]) : [raw];
    const cleanedItems: unknown[] = [];
    let anyChanges = false;

    for (let i = 0; i < rawItems.length; i++) {
      const prefix = isArray ? `[#${i}] ` : "";
      const cleanupResult = cleanupSubmission(rawItems[i]);
      for (const c of cleanupResult.changes) report.autoFixed.push(`${prefix}${c}`);
      for (const e of cleanupResult.errors) report.errors.push(`${prefix}${e}`);
      if (cleanupResult.changes.length > 0) anyChanges = true;
      cleanedItems.push(cleanupResult.cleaned);

      const parsed = SubmissionSchema.safeParse(cleanupResult.cleaned);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          report.errors.push(`${prefix}${issue.path.join(".") || "(root)"}: ${issue.message}`);
        }
        continue;
      }

      const crossIssues = crossCheck(parsed.data, {
        currentPromptVersion: PROMPT_VERSION,
        currentSnapshotGeneratedAt: snapshot.generated_at,
        knownSlugs,
        filePath: relative,
      });
      for (const ci of crossIssues) {
        const msg = `${prefix}${ci.field}: ${ci.message}`;
        if (ci.severity === "error") report.errors.push(msg);
        else report.warnings.push(msg);
      }
    }

    if (shouldWrite && anyChanges) {
      const out = isArray ? cleanedItems : cleanedItems[0];
      writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    }

    if (report.errors.length > 0) hadError = true;
    reports.push(report);
  }

  const asJson = args.includes("--json");
  if (asJson) {
    console.log(JSON.stringify({ ok: !hadError, reports }, null, 2));
  } else {
    for (const r of reports) {
      console.log(`\n${r.file}`);
      for (const e of r.errors) console.log(`  ERROR   ${e}`);
      for (const w of r.warnings) console.log(`  warn    ${w}`);
      for (const a of r.autoFixed) console.log(`  fixed   ${a}`);
      if (r.errors.length === 0 && r.warnings.length === 0 && r.autoFixed.length === 0) {
        console.log("  OK");
      }
    }
    if (hadError) console.log("\none or more files failed validation");
    else console.log("\nall files valid");
  }

  return hadError ? 1 : 0;
}

main().then((code) => process.exit(code));
