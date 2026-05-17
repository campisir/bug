# Development Setup

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## First-time setup

**1. Install dependencies**
```bash
npm install
cd server && npm install && cd ..
```

**2. Create your local env files**

Create `server/.env` (gitignored — never commit this):
```
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bughouse
DB_USER=bughouse_user
DB_PASSWORD=localpassword
DB_SSL=false
ENGINE_PATH=
ENGINE_TIMEOUT_MS=10000
MAX_ENGINES=4
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

**3. Start Postgres**
```bash
cd server
docker compose up postgres -d
```

**4. Run migrations (first time only)**
```bash
cd server
npm run db:migrate
```

## Running locally

```bash
# Terminal 1 — backend (port 3000)
cd server
npm run dev

# Terminal 2 — frontend (port 5173)
npm run dev
```

Open `http://localhost:5173` in your browser.

To run as an **Electron desktop app** instead, just run `npm run dev` from the root — no server needed.

## Deploying

Push to the `bughouse.ai` branch. GitHub Actions will build and deploy automatically.

Check the **Actions** tab in GitHub to monitor the deploy.

## Useful commands

```bash
# Stop Postgres
docker compose -f server/docker-compose.yml stop postgres

# Wipe local database (destructive)
docker compose -f server/docker-compose.yml down -v

# Check production server health
curl https://bughouse.ai/health

# Check PM2 on EC2
ssh -i key_pair.pem ubuntu@3.141.49.29 'pm2 status'

# View production logs
ssh -i key_pair.pem ubuntu@3.141.49.29 'pm2 logs bughouse-server --lines 50'
```
