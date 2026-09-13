#!/bin/bash
set -e

# Resolve the cicd directory once, before any cd: later sources must not
# depend on the working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

source "$SCRIPT_DIR/use-dev-toolchain.sh"
use_dev_toolchain
command -v pm2 >/dev/null || { echo "PM2 is missing from the dev deploy PATH" >&2; exit 1; }

cd "$BACKEND_DEV_PATH"

echo "Resetting to latest dev..."
git fetch origin dev
git checkout dev --force
git reset --hard origin/dev

echo "Installing dependencies..."
npm ci

echo "Building (TypeScript -> dist/)..."
npm run build --if-present

echo "Restarting server..."
unset PORT
restart_args=(restart "$BACKEND_DEV_PM2_NAME" --update-env)
if [ -n "${DEV_NODE_BIN:-}" ]; then
  restart_args+=(--interpreter "$DEV_NODE_BIN/node")
fi
pm2 "${restart_args[@]}"

echo "Verifying the server booted..."
source "$SCRIPT_DIR/post-deploy-check.sh"
post_deploy_check "$BACKEND_DEV_PM2_NAME" "$BACKEND_DEV_PATH"

echo "Backend dev deployment complete"
