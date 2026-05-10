#!/usr/bin/env tsx
import { join } from "node:path";
import { SLICE_IDS, type SliceId } from "@defipunkd/prompts";
import { findRepoRoot, loadSnapshot } from "../repo";
import { loadSubmissionEntriesBySlice } from "../submission-files";

type Task = {
  slug: string;
  slice: SliceId;
  currentSubmissions: number;
  tvl: number | null;
};

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const cap = parseInt(getArg(args, "--count", "50"), 10);

  const root = findRepoRoot();
  const snapshot = loadSnapshot(root);
  const submissionsDir = join(root, "data", "submissions");

  const tasks: Task[] = [];

  for (const [slug, p] of Object.entries(snapshot.protocols)) {
    if (p.delisted_at) continue;
    if (p.is_dead) continue;
    const entriesBySlice = loadSubmissionEntriesBySlice(submissionsDir, slug);
    for (const sliceId of SLICE_IDS) {
      const count = entriesBySlice.get(sliceId)?.length ?? 0;
      if (count >= 3) continue; // already has consensus-capable set
      tasks.push({ slug, slice: sliceId, currentSubmissions: count, tvl: p.tvl });
    }
  }

  tasks.sort((a, b) => {
    // prefer pairs closer to quorum: 2 > 1 > 0
    if (a.currentSubmissions !== b.currentSubmissions)
      return b.currentSubmissions - a.currentSubmissions;
    // then by TVL desc (null last)
    if (a.tvl === null && b.tvl === null) return a.slug.localeCompare(b.slug);
    if (a.tvl === null) return 1;
    if (b.tvl === null) return -1;
    return b.tvl - a.tvl;
  });

  const capped = tasks.slice(0, cap);
  console.log(JSON.stringify(capped, null, 2));
  return 0;
}

function getArg(args: string[], flag: string, def: string): string {
  const idx = args.indexOf(flag);
  if (idx === -1) return def;
  return args[idx + 1] ?? def;
}

main().then((code) => process.exit(code));
