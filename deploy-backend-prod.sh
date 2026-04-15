#!/bin/bash
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
  set -a; source "$(dirname "$0")/.env"; set +a
fi

source "$NVM_PATH"
nvm use 22

cd "$BACKEND_PROD_PATH"

echo "Resetting to latest main..."
git fetch origin main
git checkout main --force
git reset --hard origin/main

echo "Installing dependencies..."
npm install

echo "Restarting server..."
unset PORT
pm2 restart "$BACKEND_PROD_PM2_NAME" --update-env

echo "Backend production deployment complete"
