#!/bin/bash
set -e

# Resolve the cicd directory once, before any cd: later sources must not
# depend on the working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

source "$NVM_PATH"
nvm use 22

cd "$BACKEND_DEV_PATH"

echo "Resetting to latest dev..."
git fetch origin dev
git checkout dev --force
git reset --hard origin/dev

echo "Installing dependencies..."
npm install

echo "Building (TypeScript -> dist/)..."
npm run build --if-present

echo "Restarting server..."
unset PORT
pm2 restart "$BACKEND_DEV_PM2_NAME" --update-env

echo "Verifying the server booted..."
source "$SCRIPT_DIR/post-deploy-check.sh"
post_deploy_check "$BACKEND_DEV_PM2_NAME" "$BACKEND_DEV_PATH"

echo "Backend dev deployment complete"
