#!/bin/bash

# AWS EC2 Setup Script for bughouse.ai
# Run this on a fresh Ubuntu 22.04 EC2 instance

set -e

echo "================================"
echo "bughouse.ai Server Setup Script"
echo "================================"

# Update system
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 20
echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build essentials
echo "Installing build essentials..."
sudo apt-get install -y build-essential git

# Install PostgreSQL client (for connecting to RDS)
echo "Installing PostgreSQL client..."
sudo apt-get install -y postgresql-client

# Install Nginx
echo "Installing Nginx..."
sudo apt-get install -y nginx

# Install PM2 globally
echo "Installing PM2..."
sudo npm install -g pm2

# Download Fairy Stockfish
echo "Downloading Fairy Stockfish..."
sudo wget https://github.com/fairy-stockfish/Fairy-Stockfish/releases/download/fairy_sf_14_0_1_xq/fairy-stockfish-largeboard_x86-64-modern \
  -O /usr/local/bin/fairy-stockfish
sudo chmod +x /usr/local/bin/fairy-stockfish

# Test engine
echo "Testing Fairy Stockfish..."
/usr/local/bin/fairy-stockfish quit || echo "Engine test complete"

# Create application directory
echo "Creating application directory..."
sudo mkdir -p /var/www/bughouse
sudo chown -R $USER:$USER /var/www/bughouse

# Clone repository (user will need to configure this)
echo ""
echo "================================"
echo "Manual Steps Required:"
echo "================================"
echo "1. Clone your repository to /var/www/bughouse"
echo "   git clone <your-repo-url> /var/www/bughouse"
echo ""
echo "2. Set up environment variables in /var/www/bughouse/server/.env"
echo ""
echo "3. Install dependencies:"
echo "   cd /var/www/bughouse/server && npm ci --production"
echo ""
echo "4. Build the server:"
echo "   npm run build"
echo ""
echo "5. Run database migrations:"
echo "   npm run db:migrate"
echo ""
echo "6. Start with PM2:"
echo "   pm2 start dist/index.js --name bughouse-server"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "7. Configure Nginx (see nginx.conf.example)"
echo ""
echo "8. Set up SSL with certbot:"
echo "   sudo apt-get install certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d api.bughouse.ai"
echo ""
echo "System setup complete!"
