#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

cd "$FRONTEND_DEV_PATH"

source "$NVM_PATH"
nvm use --lts

echo "Pulling latest changes..."
git pull origin dev

echo "Installing dependencies..."
npm install

echo "Restarting server..."
pm2 restart "$FRONTEND_DEV_PM2_NAME"

echo "Done"
