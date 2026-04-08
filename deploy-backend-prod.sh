#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

cd "$BACKEND_PROD_PATH"

source "$NVM_PATH"
nvm use --lts

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Restarting server..."
pm2 restart "$BACKEND_PROD_PM2_NAME"

echo "Done"
