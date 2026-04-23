#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
    const file = resolve(argFile);
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

    const cleanupResult = cleanupSubmission(raw);
    report.autoFixed.push(...cleanupResult.changes);
    report.errors.push(...cleanupResult.errors);

    if (shouldWrite && cleanupResult.changes.length > 0) {
      writeFileSync(file, JSON.stringify(cleanupResult.cleaned, null, 2) + "\n");
    }

    const parsed = SubmissionSchema.safeParse(cleanupResult.cleaned);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        report.errors.push(`${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      reports.push(report);
      hadError = true;
      continue;
    }

    const crossIssues = crossCheck(parsed.data, {
      currentPromptVersion: PROMPT_VERSION,
      currentSnapshotGeneratedAt: snapshot.generated_at,
      knownSlugs,
      filePath: relative,
    });
    for (const ci of crossIssues) {
      if (ci.severity === "error") {
        report.errors.push(`${ci.field}: ${ci.message}`);
      } else {
        report.warnings.push(`${ci.field}: ${ci.message}`);
      }
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
