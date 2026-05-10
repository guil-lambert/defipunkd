import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ALL_SUBMISSIONS_DIR, RISK_SLICES, SLICES, parseSubmissionsFromFileContent, type Submission } from "./schema";

export type SubmissionEntry = {
  submission: Submission;
  sourcePath: string;
};

const KNOWN_SUBMISSION_DIRS = new Set<string>([...SLICES, ALL_SUBMISSIONS_DIR]);
const RISK_SLICE_SET = new Set<Submission["slice"]>(RISK_SLICES);

function isKnownSubmissionDir(name: string): boolean {
  return KNOWN_SUBMISSION_DIRS.has(name);
}

export function loadSubmissionEntriesBySlice(
  submissionsDir: string,
  slug: string,
): Map<Submission["slice"], SubmissionEntry[]> {
  const out = new Map<Submission["slice"], SubmissionEntry[]>();
  const slugDir = join(submissionsDir, slug);
  if (!existsSync(slugDir)) return out;

  for (const dirEntry of readdirSync(slugDir, { withFileTypes: true })) {
    if (!dirEntry.isDirectory()) continue;
    const dirName = dirEntry.name;
    if (!isKnownSubmissionDir(dirName)) continue;
    const dir = join(slugDir, dirName);
    if (!existsSync(dir)) continue;

    for (const fileEntry of readdirSync(dir, { withFileTypes: true })) {
      if (!fileEntry.isFile()) continue;
      const f = fileEntry.name;
      if (!f.endsWith(".json")) continue;
      const raw = readJson(join(dir, f));
      if (raw.kind === "error") {
        console.error(`skipping unparseable submission ${slug}/${dirName}/${f}: ${raw.message}`);
        continue;
      }
      const result = parseSubmissionsFromFileContent(raw.value);
      if (!result.ok) {
        console.error(`skipping invalid submission ${slug}/${dirName}/${f}: ${result.error}`);
        continue;
      }

      for (const { submission, index } of result.items) {
        if (dirName === ALL_SUBMISSIONS_DIR && !RISK_SLICE_SET.has(submission.slice)) {
          console.error(`skipping invalid all-slices submission ${slug}/${dirName}/${f}: slice field "${submission.slice}" is not a risk slice`);
          continue;
        }
        if (dirName !== ALL_SUBMISSIONS_DIR && submission.slice !== dirName) {
          console.error(`skipping mismatched submission ${slug}/${dirName}/${f}: slice field "${submission.slice}" does not match directory "${dirName}"`);
          continue;
        }
        const suffix = index === null ? "" : `#${index}`;
        const arr = out.get(submission.slice) ?? [];
        arr.push({
          submission,
          sourcePath: `data/submissions/${slug}/${dirName}/${f}${suffix}`,
        });
        out.set(submission.slice, arr);
      }
    }
  }

  return out;
}

function readJson(path: string): { kind: "ok"; value: unknown } | { kind: "error"; message: string } {
  try {
    return { kind: "ok", value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
}
