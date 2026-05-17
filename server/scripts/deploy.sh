#!/bin/bash

# Deployment script for bughouse.ai server
# Run from the repository ROOT (not the server/ subdirectory)
# Usage: bash server/scripts/deploy.sh

set -e

# ── Configuration ─────────────────────────────────────────────────────────────
EC2_USER="${EC2_USER:-ubuntu}"
EC2_HOST="${EC2_HOST:?Set EC2_HOST env var to your server IP or hostname}"
SSH_KEY="${SSH_KEY:-~/.ssh/bughouse-ec2.pem}"

echo "================================"
echo "Deploying bughouse.ai"
echo "================================"

# ── Build frontend ────────────────────────────────────────────────────────────
echo "[1/5] Building frontend..."
npm ci
VITE_API_URL=https://bughouse.ai npm run build

# ── Build server ──────────────────────────────────────────────────────────────
echo "[2/5] Building server..."
(cd server && npm ci && npm run build)

# ── Upload frontend ───────────────────────────────────────────────────────────
echo "[3/5] Uploading frontend..."
rsync -avz --delete \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  dist/ \
  "$EC2_USER@$EC2_HOST:/var/www/bughouse/dist/"

# ── Upload server ─────────────────────────────────────────────────────────────
echo "[4/5] Uploading server..."
rsync -avz --delete \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  server/dist/ server/package.json server/package-lock.json \
  "$EC2_USER@$EC2_HOST:/var/www/bughouse/server/"

# ── Restart PM2 ───────────────────────────────────────────────────────────────
echo "[5/5] Restarting server..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" '
  set -e
  cd /var/www/bughouse/server
  npm ci --production --ignore-scripts
  pm2 restart bughouse-server || pm2 start dist/index.js --name bughouse-server
  pm2 save
'

echo "================================"
echo "Deployment complete!"
echo "Health: https://bughouse.ai/health"
echo "Logs:   ssh $EC2_USER@$EC2_HOST pm2 logs bughouse-server"
echo "================================"


echo "================================"
echo "Deploying bughouse.ai Server"
echo "================================"

# Build locally
echo "Building server..."
npm run build

# Create deployment package
echo "Creating deployment package..."
tar -czf deploy.tar.gz \
  dist/ \
  package.json \
  package-lock.json \
  .env.example

# Upload to EC2
echo "Uploading to EC2..."
scp deploy.tar.gz $EC2_USER@$EC2_HOST:/tmp/

# Extract and restart on EC2
echo "Deploying on EC2..."
ssh $EC2_USER@$EC2_HOST << 'ENDSSH'
  cd /var/www/bughouse/server
  
  # Backup current version
  if [ -d "dist" ]; then
    mv dist dist.backup.$(date +%Y%m%d_%H%M%S)
  fi
  
  # Extract new version
  tar -xzf /tmp/deploy.tar.gz
  
  # Install/update dependencies
  npm ci --production
  
  # Restart PM2
  pm2 restart bughouse-server
  
  # Cleanup
  rm /tmp/deploy.tar.gz
  
  echo "Deployment complete!"
ENDSSH

# Cleanup local deployment package
rm deploy.tar.gz

echo "================================"
echo "Deployment successful!"
echo "================================"
echo "Check logs: ssh $EC2_USER@$EC2_HOST 'pm2 logs bughouse-server'"
