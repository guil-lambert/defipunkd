import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');

export const TRACKED_PATHS = ['data/enrichment', 'data/submissions', 'data/assessments'];

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

// Returns [{ sha, timestamp, subject }] in chronological order (oldest first),
// one row per commit on `branch`. Optional sinceISO filters by date.
export function allCommits({ branch = 'main', sinceISO } = {}) {
  // %x09 is a literal tab — robust separator since subjects can contain spaces.
  const args = ['log', '--first-parent', '--date=iso-strict', '--format=%H%x09%cI%x09%s', branch];
  if (sinceISO) args.push(`--since=${sinceISO}`);
  const out = git(args).trim();
  if (!out) return [];
  const rows = out.split('\n').map((line) => {
    const [sha, timestamp, ...rest] = line.split('\t');
    return { sha, timestamp, subject: rest.join('\t') };
  });
  return rows.reverse(); // oldest → newest
}

// Recursively list blob entries under `path` at `sha`. Returns [{ mode, path }].
export function lsTreeRecursive(sha, path) {
  let raw;
  try {
    raw = git(['ls-tree', '-r', '--full-tree', sha, '--', path]);
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    // Format: "<mode> <type> <sha>\t<path>"
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const meta = line.slice(0, tab).split(' ');
    out.push({ mode: meta[0], type: meta[1], path: line.slice(tab + 1) });
  }
  return out;
}

// Count immediate child directories of `path` at `sha`. Skips entries starting with `_` or `.`.
export function countSubdirs(sha, path) {
  let raw;
  try {
    raw = git(['ls-tree', '--full-tree', sha, '--', `${path}/`]);
  } catch {
    return 0;
  }
  let n = 0;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const [mode] = line.slice(0, tab).split(' ');
    if (mode !== '040000') continue;
    const name = line.slice(tab + 1).split('/').pop();
    if (name.startsWith('_') || name.startsWith('.')) continue;
    n++;
  }
  return n;
}

// Count *.json files under `path` (recursive) at `sha`.
export function countJsonFiles(sha, path) {
  const entries = lsTreeRecursive(sha, path);
  return entries.filter((e) => e.type === 'blob' && e.path.endsWith('.json')).length;
}

// Sum of "records" across every *.json file under `path` at `sha`.
// A record = one element if file is a JSON array; otherwise 1 (object/scalar).
// Streams all blobs through one `git cat-file --batch` process for speed.
export async function countJsonRecords(sha, path) {
  const entries = lsTreeRecursive(sha, path).filter((e) => e.type === 'blob' && e.path.endsWith('.json'));
  if (entries.length === 0) return 0;

  const proc = spawn('git', ['cat-file', '--batch'], { cwd: REPO_ROOT });
  const shas = entries.map((e) => `${sha}:${e.path}\n`).join('');
  proc.stdin.end(shas);

  return await new Promise((resolvePromise, reject) => {
    let buf = Buffer.alloc(0);
    let total = 0;
    let processed = 0;
    let mode = 'header'; // 'header' or 'body'
    let bodyRemaining = 0;
    let bodyChunks = [];
    let currentRef = '';

    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('error', reject);
    proc.stdout.on('data', (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      while (true) {
        if (mode === 'header') {
          const nl = buf.indexOf(0x0a);
          if (nl < 0) return;
          const header = buf.slice(0, nl).toString('utf8');
          buf = buf.slice(nl + 1);
          // header: "<sha> <type> <size>" OR "<ref> missing"
          const parts = header.split(' ');
          if (parts[1] === 'missing') {
            processed++;
            continue;
          }
          currentRef = parts[0];
          bodyRemaining = parseInt(parts[2], 10);
          bodyChunks = [];
          mode = 'body';
        }
        if (mode === 'body') {
          // body is `size` bytes followed by a trailing LF
          const need = bodyRemaining + 1;
          if (buf.length < need) return;
          const body = buf.slice(0, bodyRemaining);
          buf = buf.slice(need);
          mode = 'header';
          processed++;
          let parsed;
          try {
            parsed = JSON.parse(body.toString('utf8'));
          } catch {
            process.stderr.write(`warn: skip malformed JSON at ${currentRef}\n`);
            continue;
          }
          total += Array.isArray(parsed) ? parsed.length : 1;
        }
      }
    });
    proc.on('close', () => {
      if (processed < entries.length) {
        reject(new Error(`cat-file processed ${processed}/${entries.length}`));
      } else {
        resolvePromise(total);
      }
    });
  });
}

export function parseArgs(argv) {
  const args = { branch: 'main' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since') args.since = argv[++i];
    else if (a === '--branch') args.branch = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function escapeCsv(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows, columns) {
  const header = columns.join(',');
  const body = rows.map((r) => columns.map((c) => escapeCsv(r[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}
