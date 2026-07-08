#!/bin/bash
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
  set -a; source "$(dirname "$0")/.env"; set +a
fi

source "$NVM_PATH"
nvm use 22

cd "$FRONTEND_DEV_PATH"

echo "Resetting to latest dev..."
git fetch origin dev
git checkout dev --force
git reset --hard origin/dev

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Copying files to webroot..."
sudo cp -rf dist/* "$FRONTEND_DEPLOYED_DEV_PATH"

echo "Frontend dev deployment complete"
