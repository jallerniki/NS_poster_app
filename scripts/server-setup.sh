#!/usr/bin/env bash
#
# Server setup for NS Poster (Next.js standalone + SQLite + worker).
# Run ONCE on the Linux server, from the project root.
#
# Usage:
#   APP_DIR=/home/z/my-project bash scripts/server-setup.sh
#
# What it does:
#   1. Checks Node 20+
#   2. npm ci (or npm install) — installs deps
#   3. prisma generate          — builds the Prisma client (LINUX engine)
#   4. prisma db push           — creates the SQLite DB + schema
#   5. npm run build            — standalone build + postbuild (copies Prisma into standalone)
#
# After this, start the app (see deploy/poster.service or run `npm start`).
#
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
cd "$APP_DIR"

echo "==> APP_DIR = $APP_DIR"

# 1. Node version check
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install Node 20+ first." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node 20+ required, found $(node -v)." >&2
  exit 1
fi
echo "==> Node $(node -v) OK"

# 2. Dependencies
if [ -f package-lock.json ]; then
  echo "==> npm ci"
  npm ci --no-audit --no-fund
else
  echo "==> npm install (no lockfile)"
  npm install --no-audit --no-fund
fi

# 3. Prisma client (must run on the server so the LINUX query engine is generated)
echo "==> prisma generate"
npx prisma generate

# 4. Database (SQLite file from DATABASE_URL in .env). Idempotent.
echo "==> prisma db push (creates/syncs SQLite)"
npx prisma db push

# 5. Build (next build + scripts/postbuild.mjs)
echo "==> npm run build"
npm run build

# 6. Ensure writable runtime dirs
mkdir -p public/uploads public/download db

echo ""
echo "==> DONE."
echo "    DB file:   $(grep -E '^DATABASE_URL' .env || echo '(check .env)')"
echo "    Start now:  npm start"
echo "    Or as a service (recommended): see deploy/poster.service"
