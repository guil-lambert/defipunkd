#!/usr/bin/env bash
# Vercel's "Ignored Build Step":
#   exit 0 → skip the build (no new deployment)
#   exit 1 → proceed with the build
#
# Set this script as the command in:
#   Vercel Dashboard → Project Settings → Git → Ignored Build Step
#   Command:  bash scripts/vercel-ignore-build.sh
#
# Rationale: an 8107-page Astro build takes ~5 min. Most PRs in the DEFI@home
# flow touch data/submissions/**/*.json, which doesn't affect the rendered
# site — no reason to rebuild. When a rendering-affecting file changes
# (apps/web/**, packages/registry/**, packages/prompts/**, data/defillama-
# snapshot.json, data/overlays/**, pnpm-lock.yaml, etc.) we proceed.
#
# NOTE: data/assessments/** is in the exclude list today because the site
# does not yet read those files. Once the protocol pages render merged
# assessments, remove "data/assessments/" from EXCLUDE_RE so quorum-bot
# PRs trigger a rebuild.

set -u

EXCLUDE_RE='^(data/submissions/|data/assessments/|data/schema/|\.github/|packages/validator/|packages/sync/|\.claude/|\.agents/|skills-lock\.json$|.*\.md$)'

if ! git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  echo "proceed: cannot determine previous commit, cannot reason about diff"
  exit 1
fi

changed=$(git diff --name-only HEAD~1 HEAD)

if [ -z "$changed" ]; then
  echo "proceed: empty diff (safer default)"
  exit 1
fi

rendering_changes=$(echo "$changed" | grep -vE "$EXCLUDE_RE" || true)

if [ -z "$rendering_changes" ]; then
  echo "SKIP: no rendering-affecting files changed."
  echo "---- all changed files ----"
  echo "$changed" | sed 's/^/  /'
  exit 0
fi

echo "PROCEED: rendering-affecting files changed."
echo "---- will trigger build ----"
echo "$rendering_changes" | sed 's/^/  /'
exit 1
