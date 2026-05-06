#!/usr/bin/env node
// Counts immediate subfolders in data/{enrichment,submissions,assessments}
// at every commit on the branch. Writes data/metrics/folder-counts.{csv,json}.
//
// Usage:
//   node scripts/folder-counts-over-time.mjs [--since 2024-01-01] [--branch main]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO_ROOT,
  TRACKED_PATHS,
  allCommits,
  countSubdirs,
  parseArgs,
  toCsv,
} from './lib/data-history.mjs';

const args = parseArgs(process.argv);
if (args.help) {
  console.log('usage: folder-counts-over-time.mjs [--since YYYY-MM-DD] [--branch <ref>]');
  process.exit(0);
}

const commits = allCommits({ branch: args.branch, sinceISO: args.since });
process.stderr.write(`scanning ${commits.length} commit(s)…\n`);

const rows = commits.map(({ sha, timestamp, subject }) => {
  const row = { timestamp, sha, subject };
  for (const p of TRACKED_PATHS) {
    row[p.split('/').pop()] = countSubdirs(sha, p);
  }
  return row;
});

const columns = ['timestamp', 'sha', 'enrichment', 'submissions', 'assessments', 'subject'];

const outDir = args.out ?? join(REPO_ROOT, 'data', 'metrics');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'folder-counts.csv'), toCsv(rows, columns));
writeFileSync(join(outDir, 'folder-counts.json'), JSON.stringify(rows, null, 2) + '\n');

console.log(`wrote ${rows.length} rows → ${outDir}/folder-counts.{csv,json}`);
console.log('latest:', rows.at(-1));
