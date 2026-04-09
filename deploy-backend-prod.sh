#!/bin/bash
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/.env" | xargs)
fi

export NVM_DIR="/home/ops/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 22

cd "$BACKEND_PROD_PATH"

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Restarting server..."
pm2 restart "$BACKEND_PROD_PM2_NAME" --update-env

echo "Backend production deployment complete"
