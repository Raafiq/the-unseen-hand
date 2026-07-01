#!/usr/bin/env bash
set -euo pipefail

# SessionStart hook — bootstraps the ephemeral Claude Code on the web / mobile
# container so a session can build and test immediately.
#
# Each web/mobile session clones the repo into a fresh container with no
# node_modules, so we install dependencies and pre-build the core package here.
# This runs on the Linux web container; local desktop sessions can also run it.

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# Ensure the pinned pnpm version is available (packageManager: pnpm@10.12.1).
corepack enable
corepack prepare pnpm@10.12.1 --activate

# Install workspace dependencies against the committed lockfile.
pnpm install --frozen-lockfile

# Build @ugs/core first so @ugs/game-client typechecks resolve its dist/ output
# (mirrors turbo's `^build` dependency).
pnpm --filter @ugs/core build

echo "Bootstrap complete: pnpm deps installed, @ugs/core built."
