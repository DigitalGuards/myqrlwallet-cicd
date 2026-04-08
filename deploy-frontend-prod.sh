#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

cd "$FRONTEND_PROD_PATH"

source "$NVM_PATH"
nvm use --lts

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Copying files to server..."
sudo cp -rf dist/* "$FRONTEND_DEPLOYED_PROD_PATH"

echo "Done"
