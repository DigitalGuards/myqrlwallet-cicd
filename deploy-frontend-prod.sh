#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

source "$SCRIPT_DIR/use-prod-toolchain.sh"
use_prod_toolchain

cd "$FRONTEND_PROD_PATH"

echo "Resetting to latest main..."
git fetch origin main
git checkout main --force
git reset --hard origin/main

echo "Installing dependencies..."
npm ci

echo "Building..."
npm run build

echo "Copying files to webroot..."
sudo cp -rf dist/. "$FRONTEND_DEPLOYED_PROD_PATH"

echo "Removing build files of deploys older than 30 days..."
"$SCRIPT_DIR/prune-webroot-assets.sh" dist "$FRONTEND_DEPLOYED_PROD_PATH" ||
  echo "Warning: old build files were not removed; the deploy itself is complete"

echo "Frontend production deployment complete"
