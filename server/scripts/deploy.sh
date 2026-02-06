#!/bin/bash

# Deployment script for bughouse.ai server
# Run this from your local machine to deploy to EC2

set -e

# Configuration
EC2_USER="ubuntu"
EC2_HOST="your-ec2-ip-or-domain"
APP_DIR="/var/www/bughouse/server"

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
