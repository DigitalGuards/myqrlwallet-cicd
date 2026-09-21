#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

source "$SCRIPT_DIR/use-dev-toolchain.sh"
use_dev_toolchain

cd "$FRONTEND_DEV_PATH"

echo "Resetting to latest dev..."
git fetch origin dev
git checkout dev --force
git reset --hard origin/dev

echo "Installing dependencies..."
npm ci

echo "Building..."
npm run build

echo "Copying files to webroot..."
sudo cp -rf dist/. "$FRONTEND_DEPLOYED_DEV_PATH"

echo "Frontend dev deployment complete"
