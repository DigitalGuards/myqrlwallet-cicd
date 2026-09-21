#!/bin/bash
set -e

# Resolve the cicd directory once, before any cd: later sources must not
# depend on the working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

source "$SCRIPT_DIR/use-prod-toolchain.sh"
use_prod_toolchain
command -v pm2 >/dev/null || { echo "PM2 is missing from the production deploy PATH" >&2; exit 1; }

cd "$BACKEND_PROD_PATH"

echo "Resetting to latest main..."
git fetch origin main
git checkout main --force
git reset --hard origin/main

echo "Installing dependencies..."
npm ci

echo "Building (TypeScript -> dist/)..."
npm run build --if-present

echo "Restarting server..."
unset PORT
restart_args=(restart "$BACKEND_PROD_PM2_NAME" --update-env)
if [ -n "${PRODUCTION_NODE_BIN:-}" ]; then
  restart_args+=(--interpreter "$PRODUCTION_NODE_BIN/node")
fi
pm2 "${restart_args[@]}"

echo "Verifying the server booted..."
source "$SCRIPT_DIR/post-deploy-check.sh"
post_deploy_check "$BACKEND_PROD_PM2_NAME" "$BACKEND_PROD_PATH"

echo "Backend production deployment complete"
