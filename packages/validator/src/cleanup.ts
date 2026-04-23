const MARKDOWN_URL = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/;

export type CleanupResult = {
  cleaned: unknown;
  changes: string[];
  errors: string[];
};

export function cleanupSubmission(raw: unknown): CleanupResult {
  const changes: string[] = [];
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { cleaned: raw, changes, errors: ["input is not an object"] };
  }

  const cloned = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  // strip trailing whitespace in all string values
  walkStrings(cloned, (value, path) => {
    const trimmed = value.replace(/\s+$/gm, "").replace(/\r\n/g, "\n");
    if (trimmed !== value) {
      changes.push(`normalized whitespace at ${path}`);
      return trimmed;
    }
    return value;
  });

  const evidence = cloned.evidence;
  if (Array.isArray(evidence)) {
    evidence.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") return;
      const row = entry as Record<string, unknown>;
      const url = row.url;
      if (typeof url !== "string") return;
      const match = url.match(MARKDOWN_URL);
      if (match) {
        const inner = match[1]!.trim();
        const outer = match[2]!.trim();
        if (inner === outer) {
          row.url = outer;
          changes.push(`stripped markdown wrapper from evidence[${i}].url`);
        } else {
          errors.push(
            `evidence[${i}].url: labeled markdown link detected ("${inner}" ≠ "${outer}"). URLs must be bare strings.`,
          );
        }
      }
    });
  }

  return { cleaned: cloned, changes, errors };
}

function walkStrings(
  obj: unknown,
  visit: (value: string, path: string) => string,
  path = "",
): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "string") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      const childPath = `${path}[${i}]`;
      if (typeof item === "string") {
        obj[i] = visit(item, childPath);
      } else if (typeof item === "object" && item !== null) {
        walkStrings(item, visit, childPath);
      }
    });
    return;
  }
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const childPath = path ? `${path}.${key}` : key;
      const val = rec[key];
      if (typeof val === "string") {
        rec[key] = visit(val, childPath);
      } else if (val !== null && typeof val === "object") {
        walkStrings(val, visit, childPath);
      }
    }
  }
}
