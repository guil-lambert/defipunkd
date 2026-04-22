import { NextResponse, type NextRequest } from "next/server";
import manifest from "./generated/delisted-manifest.json";

const delisted: Record<string, { name: string; delisted_at: string }> = manifest as Record<
  string,
  { name: string; delisted_at: string }
>;

export const config = {
  matcher: "/protocol/:slug",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderGone(slug: string, name: string, delistedAt: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(name)} (delisted) · DefiBeat</title>
</head>
<body style="background:#0f172a;color:#e2e8f0;margin:0;font-family:system-ui,sans-serif;">
  <main style="max-width:720px;margin:0 auto;padding:4rem 1.5rem;">
    <h1 style="color:#e2e8f0;">${escapeHtml(name)}</h1>
    <p style="color:#f87171;">This protocol has been delisted from DeFiLlama as of ${escapeHtml(delistedAt)}.</p>
    <p style="color:#94a3b8;">DefiBeat mirrors DeFiLlama. See the <a style="color:#22d3ee;" rel="noreferrer" target="_blank" href="https://defillama.com/protocol/${encodeURIComponent(slug)}">DeFiLlama page</a> for the last known data.</p>
    <p><a style="color:#22d3ee;" href="/">\u2190 back to index</a></p>
  </main>
</body>
</html>`;
}

export function middleware(req: NextRequest) {
  const match = req.nextUrl.pathname.match(/^\/protocol\/([^/]+)$/);
  if (!match) return NextResponse.next();
  const slug = decodeURIComponent(match[1]!);
  const entry = delisted[slug];
  if (!entry) return NextResponse.next();
  return new NextResponse(renderGone(slug, entry.name, entry.delisted_at), {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
