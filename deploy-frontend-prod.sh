#!/bin/bash
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
  set -a; source "$(dirname "$0")/.env"; set +a
fi

source "$NVM_PATH"
nvm use 22

cd "$FRONTEND_PROD_PATH"

echo "Resetting to latest main..."
git fetch origin main
git checkout main --force
git reset --hard origin/main

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Copying files to webroot..."
sudo cp -rf dist/* "$FRONTEND_DEPLOYED_PROD_PATH"

echo "Frontend production deployment complete"
