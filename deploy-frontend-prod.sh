#!/bin/bash
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/.env" | xargs)
fi

export NVM_DIR="/home/ops/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 22

cd "$FRONTEND_PROD_PATH"

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Copying files to webroot..."
sudo cp -rf dist/* "$FRONTEND_DEPLOYED_PROD_PATH"

echo "Frontend production deployment complete"
