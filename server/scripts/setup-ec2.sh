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

# Create application directories
echo "Creating application directories..."
sudo mkdir -p /var/www/bughouse/dist    # React frontend
sudo mkdir -p /var/www/bughouse/server  # Node backend
sudo chown -R $USER:$USER /var/www/bughouse

# Clone repository (user will need to configure this)
echo ""
echo "================================"
echo "Manual Steps Required:"
echo "================================"
echo "1. Copy the nginx config:"
echo "   sudo cp /var/www/bughouse/server/nginx.conf.example /etc/nginx/sites-available/bughouse.ai"
echo "   sudo ln -s /etc/nginx/sites-available/bughouse.ai /etc/nginx/sites-enabled/"
echo "   sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "2. Provision SSL (after DNS is pointing to this server):"
echo "   sudo apt-get install -y certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d bughouse.ai -d www.bughouse.ai"
echo "   Then uncomment the ssl_* lines in /etc/nginx/sites-available/bughouse.ai"
echo ""
echo "3. Set up environment variables:"
echo "   cp /var/www/bughouse/server/.env.example /var/www/bughouse/server/.env"
echo "   nano /var/www/bughouse/server/.env"
echo ""
echo "4. Run database migrations:"
echo "   cd /var/www/bughouse/server && npm run db:migrate"
echo ""
echo "5. Start with PM2:"
echo "   cd /var/www/bughouse/server"
echo "   pm2 start dist/index.js --name bughouse-server"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "6. For GitHub Actions deploys, add these secrets to your repo:"
echo "   EC2_HOST  — your EC2 public IP or hostname"
echo "   EC2_USER  — ubuntu (or ec2-user)"
echo "   EC2_SSH_KEY — contents of your PEM key file"
echo ""
echo "System setup complete!"
