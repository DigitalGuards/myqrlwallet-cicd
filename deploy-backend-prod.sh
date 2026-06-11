#!/bin/bash
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
  set -a; source "$(dirname "$0")/.env"; set +a
fi

source "$NVM_PATH"
nvm use 22

cd "$BACKEND_PROD_PATH"

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building (TypeScript -> dist/)..."
npm run build --if-present

echo "Restarting server..."
pm2 restart "$BACKEND_PROD_PM2_NAME" --update-env

echo "Backend production deployment complete"
