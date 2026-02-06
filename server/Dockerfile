# Use Node.js 20 LTS
FROM node:20-slim

# Install dependencies for building native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Download and install Fairy-Stockfish
RUN wget https://github.com/fairy-stockfish/Fairy-Stockfish/releases/download/fairy_sf_14_0_1_xq/fairy-stockfish-largeboard_x86-64-modern \
    -O /usr/local/bin/fairy-stockfish && \
    chmod +x /usr/local/bin/fairy-stockfish

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "dist/index.js"]
