#!/bin/bash
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
  set -a; source "$(dirname "$0")/.env"; set +a
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

echo "Backend dev deployment complete"
