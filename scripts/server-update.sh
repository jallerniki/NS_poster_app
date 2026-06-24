#!/usr/bin/env bash
#
# Redeploy/update NS Poster after uploading new source (deps already installed).
# Run on the server from the project root:
#   APP_DIR=/home/z/my-project bash scripts/server-update.sh
#
set -euo pipefail
APP_DIR="${APP_DIR:-$(pwd)}"
cd "$APP_DIR"

echo "==> prisma generate (regenerate client if schema changed)"
npx prisma generate

echo "==> prisma db push (sync schema, keeps data)"
npx prisma db push

echo "==> npm run build"
npm run build

mkdir -p public/uploads public/download db

if systemctl is-active --quiet poster 2>/dev/null; then
  echo "==> systemctl restart poster"
  sudo systemctl restart poster || echo "    (need sudo; run: sudo systemctl restart poster)"
else
  echo "==> service not running. Start it: sudo systemctl enable --now poster  (or: npm start)"
fi

echo "==> DONE."
