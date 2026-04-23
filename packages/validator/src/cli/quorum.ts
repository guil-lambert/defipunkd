#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROMPT_VERSION, SLICE_IDS } from "@defipunkd/prompts";
import { SubmissionSchema, type Submission } from "../schema";
import { computeQuorum, type Assessment, type Disagreement } from "../quorum";
import { findRepoRoot, loadSnapshot } from "../repo";

type Change = {
  slug: string;
  slice: Submission["slice"];
  kind: "new" | "updated" | "unchanged" | "disagreement" | "insufficient";
  previousGrade?: string;
  currentGrade?: string;
  strength?: "strong" | "weak";
  submissionCount: number;
};

async function main(): Promise<number> {
  const root = findRepoRoot();
  const snapshot = loadSnapshot(root);
  const submissionsDir = join(root, "data", "submissions");
  const assessmentsDir = join(root, "data", "assessments");

  if (!existsSync(submissionsDir)) {
    console.log("no data/submissions/ directory; nothing to quorum");
    return 0;
  }

  const changes: Change[] = [];
  const disagreements: Disagreement[] = [];

  const slugDirs = readdirSync(submissionsDir, { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  );

  for (const slugDir of slugDirs) {
    const slug = slugDir.name;
    for (const sliceId of SLICE_IDS) {
      const sliceDir = join(submissionsDir, slug, sliceId);
      if (!existsSync(sliceDir)) continue;

      const files = readdirSync(sliceDir).filter((f) => f.endsWith(".json"));
      if (files.length === 0) continue;

      const entries = files
        .map((f) => {
          const fullPath = join(sliceDir, f);
          let raw: unknown;
          try {
            raw = JSON.parse(readFileSync(fullPath, "utf8"));
          } catch (err) {
            console.error(`skipping unparseable submission ${slug}/${sliceId}/${f}: ${(err as Error).message}`);
            return null;
          }
          const parsed = SubmissionSchema.safeParse(raw);
          if (!parsed.success) {
            console.error(`skipping invalid submission ${slug}/${sliceId}/${f}`);
            return null;
          }
          return {
            submission: parsed.data,
            sourcePath: `data/submissions/${slug}/${sliceId}/${f}`,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const result = computeQuorum(entries, {
        currentPromptVersion: PROMPT_VERSION,
        currentSnapshotGeneratedAt: snapshot.generated_at,
        now: new Date().toISOString(),
      });

      const assessmentPath = join(assessmentsDir, slug, `${sliceId}.json`);
      const prev = readAssessment(assessmentPath);

      if (result.kind === "insufficient") {
        changes.push({
          slug,
          slice: sliceId,
          kind: "insufficient",
          submissionCount: entries.length,
        });
        continue;
      }

      if (result.kind === "disagreement") {
        changes.push({
          slug,
          slice: sliceId,
          kind: "disagreement",
          submissionCount: entries.length,
        });
        disagreements.push(result.disagreement);
        continue;
      }

      const a = result.assessment;
      if (!prev) {
        writeAssessment(assessmentPath, a);
        changes.push({
          slug,
          slice: sliceId,
          kind: "new",
          currentGrade: a.consensus_grade,
          strength: a.consensus_strength,
          submissionCount: entries.length,
        });
      } else if (
        prev.consensus_grade !== a.consensus_grade ||
        prev.consensus_strength !== a.consensus_strength ||
        prev.merged_from.length !== a.merged_from.length
      ) {
        writeAssessment(assessmentPath, a);
        changes.push({
          slug,
          slice: sliceId,
          kind: "updated",
          previousGrade: `${prev.consensus_grade} (${prev.consensus_strength})`,
          currentGrade: `${a.consensus_grade} (${a.consensus_strength})`,
          strength: a.consensus_strength,
          submissionCount: entries.length,
        });
      } else {
        changes.push({
          slug,
          slice: sliceId,
          kind: "unchanged",
          currentGrade: a.consensus_grade,
          strength: a.consensus_strength,
          submissionCount: entries.length,
        });
      }
    }
  }

  const asJson = process.argv.includes("--json");
  if (asJson) {
    console.log(JSON.stringify({ changes, disagreements }, null, 2));
  } else {
    for (const c of changes) {
      const marker = {
        new: "NEW      ",
        updated: "UPDATED  ",
        unchanged: "unchanged",
        disagreement: "DISAGREE ",
        insufficient: "pending  ",
      }[c.kind];
      const detail =
        c.kind === "updated"
          ? `${c.previousGrade} → ${c.currentGrade}`
          : c.kind === "new" || c.kind === "unchanged"
            ? `${c.currentGrade} (${c.strength})`
            : `${c.submissionCount} submission(s)`;
      console.log(`${marker} ${c.slug}/${c.slice}  ${detail}`);
    }
    if (disagreements.length > 0) {
      console.log(`\n${disagreements.length} disagreement(s) — open an issue per pair.`);
    }
  }

  return 0;
}

function readAssessment(path: string): Assessment | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Assessment;
  } catch {
    return null;
  }
}

function writeAssessment(path: string, a: Assessment): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(a, null, 2) + "\n");
}

main().then((code) => process.exit(code));
