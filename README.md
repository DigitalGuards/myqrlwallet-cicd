# MyQRLWallet CI/CD Server

A Node.js-based continuous integration and continuous deployment (CI/CD) server that handles GitHub webhooks to automatically deploy frontend and backend applications to development and production environments.

## Features

- Automated deployments triggered by GitHub push events
- Separate webhook endpoints for frontend and backend deployments
- Support for both development and production environments
- Secure webhook verification using GitHub signatures
- Environment-based configuration

## Prerequisites

- Node Version Manager (NVM)
- Node.js (v20.17.0)
- npm
- PM2 (for process management)
- Git
- Bash shell
- Sudo access (for production deployments)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/DigitalGuards/myqrlwallet-cicd.git
cd myqrlwallet-cicd
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
PORT=3000
SECRET=your_github_webhook_secret
NVM_PATH=/path/to/nvm/nvm.sh
FRONTEND_PROD_PATH=/path/to/frontend/prod/repo
FRONTEND_DEV_PATH=/path/to/frontend/dev/repo
BACKEND_PROD_PATH=/path/to/backend/prod/repo
BACKEND_DEV_PATH=/path/to/backend/dev/repo
FRONTEND_DEPLOYED_PROD_PATH=/path/to/frontend/prod/deployed
FRONTEND_DEV_PM2_NAME=frontend-dev
BACKEND_PROD_PM2_NAME=backend-prod
BACKEND_DEV_PM2_NAME=backend-dev
```

## Usage

### Optional dev-only Node runtime

Set `DEV_NODE_BIN` to an absolute directory containing executable `node` and
`npm` binaries to pin the two dev deployments to a separate Node installation.
The backend dev restart also selects that installation as its PM2 interpreter.
With this option absent, dev retains the existing NVM 22 selection. Production
scripts and NVM defaults are unchanged. An invalid override fails the dev deploy.

Both dev scripts use `npm ci`, so their applications must commit a matching
lockfile. Validate the toolchain selector with
`node --test use-dev-toolchain.test.mjs`.

### Optional production Node runtime

Set `PRODUCTION_NODE_BIN` to an absolute directory containing executable `node`
and `npm` binaries to pin production builds and the backend PM2 interpreter.
Production deployments use `npm ci` with the committed lockfile. An invalid
override fails the deployment before changing the application checkout. With
the override absent, production retains its existing NVM 22 selection.

Validate both runtime selectors with `node --test use-*-toolchain.test.mjs`.

1. Start the server:
```bash
node server.js
```

2. Configure GitHub webhooks:
   - Add webhook URLs for your frontend and backend repositories:
     - Frontend webhook: `http://your-server:PORT/frontend-webhook`
     - Backend webhook: `http://your-server:PORT/backend-webhook`
   - Set content type to `application/json`
   - Set the secret to match your `SECRET` environment variable
   - Select the "Push" event

## Webhook Endpoints

### Frontend Webhook
- URL: `/frontend-webhook`
- Handles deployments for the frontend application
- Supports both main (production) and dev (development) branches

### Backend Webhook
- URL: `/backend-webhook`
- Handles deployments for the backend application
- Supports both main (production) and dev (development) branches

## Security

The server implements GitHub's webhook signature verification using SHA-256 HMAC validation. Each request is verified against the secret configured in the environment variables.

## Deployment Scripts

The project includes four deployment scripts:

1. `deploy-frontend-prod.sh`: Deploys frontend to production
   - Pulls from main branch
   - Builds the application
   - Copies built files to production server

2. `deploy-frontend-dev.sh`: Deploys frontend to development
   - Pulls from dev branch
   - Installs dependencies
   - Restarts PM2 process

3. `deploy-backend-prod.sh`: Deploys backend to production
   - Pulls from main branch
   - Installs dependencies
   - Restarts PM2 process

4. `deploy-backend-dev.sh`: Deploys backend to development
   - Pulls from dev branch
   - Installs dependencies
   - Restarts PM2 process

## Error Handling

- Failed signature verification returns 401 status code
- Failed deployments return 500 status code with error details
- All deployment activities are logged to the console

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
