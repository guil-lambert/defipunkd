#!/usr/bin/env node
// Counts JSON records (sum of array lengths; objects/scalars count as 1) across
// every *.json file in data/{enrichment,submissions,assessments} at every
// commit. Captures that some files (e.g. models-*.json) hold multiple model
// outputs in one file.
//
// Writes data/metrics/json-record-counts.{csv,json}.
//
// Usage:
//   node scripts/json-record-counts-over-time.mjs [--since 2024-01-01] [--branch main]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO_ROOT,
  TRACKED_PATHS,
  allCommits,
  countJsonRecords,
  parseArgs,
  toCsv,
} from './lib/data-history.mjs';

const args = parseArgs(process.argv);
if (args.help) {
  console.log('usage: json-record-counts-over-time.mjs [--since YYYY-MM-DD] [--branch <ref>]');
  process.exit(0);
}

const commits = allCommits({ branch: args.branch, sinceISO: args.since });
process.stderr.write(`scanning ${commits.length} commit(s) (parses every JSON blob)…\n`);

const rows = [];
for (let i = 0; i < commits.length; i++) {
  const { sha, timestamp, subject } = commits[i];
  process.stderr.write(`  [${i + 1}/${commits.length}] ${timestamp} ${sha.slice(0, 7)}\n`);
  const row = { timestamp, sha, subject };
  for (const p of TRACKED_PATHS) {
    row[p.split('/').pop()] = await countJsonRecords(sha, p);
  }
  rows.push(row);
}

const columns = ['timestamp', 'sha', 'enrichment', 'submissions', 'assessments', 'subject'];

const outDir = args.out ?? join(REPO_ROOT, 'data', 'metrics');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'json-record-counts.csv'), toCsv(rows, columns));
writeFileSync(join(outDir, 'json-record-counts.json'), JSON.stringify(rows, null, 2) + '\n');

console.log(`wrote ${rows.length} rows → ${outDir}/json-record-counts.{csv,json}`);
console.log('latest:', rows.at(-1));
