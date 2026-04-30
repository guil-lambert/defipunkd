#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { PROMPT_VERSION, SLICE_IDS } from "@defipunkd/prompts";
import { parseSubmissionsFromFileContent, type Submission } from "../schema";
import { computeQuorum, type Assessment, type Disagreement } from "../quorum";
import { findRepoRoot, loadSnapshot } from "../repo";
import { buildShortHeadlinePrompt } from "../short-headline-prompt";

type Change = {
  slug: string;
  slice: Submission["slice"];
  kind: "new" | "updated" | "unchanged" | "disagreement" | "insufficient";
  previousGrade?: string;
  currentGrade?: string;
  strength?: "strong" | "weak";
  submissionCount: number;
};

type Options = {
  useLlm: boolean;
  model: string;
};

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const opts: Options = { useLlm: true, model: "claude-sonnet-4-6" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--no-llm") opts.useLlm = false;
    else if (a === "--model") opts.model = args[++i]!;
  }

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

      const entries: Array<{ submission: Submission; sourcePath: string }> = [];
      for (const f of files) {
        const fullPath = join(sliceDir, f);
        let raw: unknown;
        try {
          raw = JSON.parse(readFileSync(fullPath, "utf8"));
        } catch (err) {
          console.error(`skipping unparseable submission ${slug}/${sliceId}/${f}: ${(err as Error).message}`);
          continue;
        }
        const result = parseSubmissionsFromFileContent(raw);
        if (!result.ok) {
          console.error(`skipping invalid submission ${slug}/${sliceId}/${f}: ${result.error}`);
          continue;
        }
        for (const { submission, index } of result.items) {
          const suffix = index === null ? "" : `#${index}`;
          entries.push({
            submission,
            sourcePath: `data/submissions/${slug}/${sliceId}/${f}${suffix}`,
          });
        }
      }

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
      const consensusChanged = !prev
        || prev.consensus_grade !== a.consensus_grade
        || prev.consensus_strength !== a.consensus_strength
        || prev.merged_from.length !== a.merged_from.length;

      const provenanceChanged = !!prev && (
        prev.primary_submission_path !== a.primary_submission_path
        || JSON.stringify(prev.merged_from) !== JSON.stringify(a.merged_from)
      );

      const needsSynthesis = consensusChanged || !prev?.short_headline;
      const agreeing = entries
        .filter((e) => e.submission.grade === a.consensus_grade)
        .map((e) => ({
          model: e.submission.model,
          headline: e.submission.headline,
          short_headline: e.submission.short_headline,
        }));

      if (opts.useLlm && needsSynthesis && agreeing.length > 0) {
        const synthesized = await synthesizeShortHeadline({
          slug,
          slice: sliceId,
          consensus_grade: a.consensus_grade,
          agreeing,
          model: opts.model,
        });
        if (synthesized) {
          a.short_headline = synthesized;
        } else if (prev?.short_headline && !consensusChanged) {
          a.short_headline = prev.short_headline;
        }
      } else if (!consensusChanged && prev?.short_headline) {
        a.short_headline = prev.short_headline;
      }

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
      } else if (consensusChanged || provenanceChanged || prev.short_headline !== a.short_headline) {
        writeAssessment(assessmentPath, a);
        changes.push({
          slug,
          slice: sliceId,
          kind: consensusChanged ? "updated" : "unchanged",
          previousGrade: consensusChanged ? `${prev.consensus_grade} (${prev.consensus_strength})` : undefined,
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

type SynthesizeInput = {
  slug: string;
  slice: Submission["slice"];
  consensus_grade: Submission["grade"];
  agreeing: Array<{ model: string; headline: string; short_headline?: string }>;
  model: string;
};

async function synthesizeShortHeadline(input: SynthesizeInput): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`[quorum] ${input.slug}/${input.slice}: ANTHROPIC_API_KEY not set, skipping short_headline synthesis`);
    return null;
  }
  const prompt = buildShortHeadlinePrompt({
    slug: input.slug,
    slice: input.slice,
    consensus_grade: input.consensus_grade,
    agreeing: input.agreeing,
  });
  const client = new Anthropic({ timeout: 60_000 });
  try {
    const resp = await client.messages.create({
      model: input.model,
      max_tokens: 60,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const cleaned = sanitizeHeadline(text);
    if (!cleaned) {
      console.warn(`[quorum] ${input.slug}/${input.slice}: LLM output rejected (empty after sanitize): ${JSON.stringify(text)}`);
      return null;
    }
    console.error(`[quorum] ${input.slug}/${input.slice}: synthesized short_headline = "${cleaned}"`);
    return cleaned;
  } catch (err) {
    const e = err as { message?: string; status?: number };
    console.warn(`[quorum] ${input.slug}/${input.slice}: LLM call failed (${e.status ?? "?"}): ${e.message ?? "unknown"}`);
    return null;
  }
}

function sanitizeHeadline(raw: string): string | null {
  let t = raw.trim();
  if (!t) return null;
  // Take first line only
  const firstLine = t.split(/\r?\n/)[0];
  t = (firstLine ?? "").trim();
  // Strip surrounding quotes
  t = t.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();
  // Strip trailing punctuation
  t = t.replace(/[.,;:!?]+$/g, "").trim();
  if (!t) return null;
  if (t.length > 80) return null;
  return t;
}

main().then((code) => process.exit(code));
