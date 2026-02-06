import express, { Request, Response } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { testConnection } from './database/connection';
import { initializeEnginePool, getEnginePool } from './services/EnginePool';
import { initializeWebSocket } from './websocket/gameSocket';
import gamesRouter from './routes/games';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  const enginePool = getEnginePool();
  const stats = enginePool.getStats();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    enginePool: stats,
  });
});

// API routes
app.use('/api/games', gamesRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('[Server] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize services
async function initialize() {
  try {
    console.log('[Server] Starting bughouse.ai server...');
    
    // Test database connection
    console.log('[Server] Testing database connection...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    
    // Initialize engine pool
    console.log('[Server] Initializing engine pool...');
    const enginePath = process.env.ENGINE_PATH || '/usr/local/bin/fairy-stockfish';
    const maxEngines = parseInt(process.env.MAX_ENGINES || '20');
    initializeEnginePool(enginePath, maxEngines);
    
    // Initialize WebSocket server
    console.log('[Server] Initializing WebSocket server...');
    initializeWebSocket(httpServer);
    
    // Start server
    httpServer.listen(PORT, () => {
      console.log(`[Server] Server is running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[Server] Allowed origins: ${process.env.ALLOWED_ORIGINS || 'http://localhost:5173'}`);
    });
  } catch (error) {
    console.error('[Server] Failed to initialize:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
  });
  
  const enginePool = getEnginePool();
  await enginePool.shutdown();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down gracefully...');
  
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
  });
  
  const enginePool = getEnginePool();
  await enginePool.shutdown();
  
  process.exit(0);
});

// Start the server
initialize();
