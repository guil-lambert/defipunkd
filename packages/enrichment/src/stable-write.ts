import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Write a JSON file, but skip the write if the only difference from the
 * existing file is the value of `timestampField`. Refresh jobs that emit
 * an `extracted_at` (or similar) timestamp on every run otherwise produce
 * a noisy diff where every file changes by one line each week — defeats
 * meaningful change review and clutters PRs.
 */
export function writeStableTimestampedJson(
  path: string,
  payload: Record<string, unknown>,
  timestampField: string,
): { wrote: boolean } {
  if (existsSync(path)) {
    try {
      const prior = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      const a = { ...prior };
      const b = { ...payload };
      delete a[timestampField];
      delete b[timestampField];
      if (canonicalize(a) === canonicalize(b)) return { wrote: false };
    } catch {
      // Prior file unreadable / unparseable — fall through and write fresh.
    }
  }
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  return { wrote: true };
}

function canonicalize(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
  }
  return v;
}
