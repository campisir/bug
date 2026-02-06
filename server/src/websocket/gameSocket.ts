import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { getEnginePool } from '../services/EnginePool';
import { query } from '../database/connection';

interface GameRoom {
  gameId: string;
  players: Set<string>;
}

const gameRooms = new Map<string, GameRoom>();

export function initializeWebSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    // Join a game room
    socket.on('joinGame', async (data: { gameId: string; username: string }) => {
      const { gameId, username } = data;
      
      socket.join(gameId);
      
      if (!gameRooms.has(gameId)) {
        gameRooms.set(gameId, { gameId, players: new Set() });
      }
      
      const room = gameRooms.get(gameId)!;
      room.players.add(socket.id);
      
      console.log(`[WebSocket] ${username} joined game ${gameId}`);
      
      // Notify other players
      socket.to(gameId).emit('playerJoined', { username, playerId: socket.id });
      
      // Send current game state
      try {
        const gameResult = await query('SELECT * FROM games WHERE id = $1', [gameId]);
        if (gameResult.rows.length > 0) {
          socket.emit('gameState', gameResult.rows[0]);
        }
      } catch (error) {
        console.error('[WebSocket] Error fetching game state:', error);
      }
    });

    // Handle moves
    socket.on('makeMove', async (data: {
      gameId: string;
      boardId: 1 | 2;
      move: string;
      fen: string;
      ply: number;
    }) => {
      const { gameId, boardId, move, fen, ply } = data;
      
      try {
        // Store move in database
        await query(
          `INSERT INTO moves (game_id, board_id, ply, move, fen)
           VALUES ($1, $2, $3, $4, $5)`,
          [gameId, boardId, ply, move, fen]
        );

        // Update game state
        const fenColumn = boardId === 1 ? 'board1_fen' : 'board2_fen';
        await query(
          `UPDATE games 
           SET ${fenColumn} = $1, updated_at = NOW()
           WHERE id = $2`,
          [fen, gameId]
        );

        // Broadcast move to all players in the game
        io.to(gameId).emit('moveMade', {
          boardId,
          move,
          fen,
          ply,
        });

        console.log(`[WebSocket] Move made in game ${gameId}: ${move}`);
      } catch (error) {
        console.error('[WebSocket] Error handling move:', error);
        socket.emit('error', { message: 'Failed to process move' });
      }
    });

    // Handle engine move requests
    socket.on('requestEngineMove', async (data: {
      gameId: string;
      boardId: 1 | 2;
      fen: string;
      moves: string[];
      timeMs?: number;
    }) => {
      const { gameId, boardId, fen, moves, timeMs = 1000 } = data;
      
      try {
        const enginePool = getEnginePool();
        const engine = await enginePool.acquireEngine();
        
        try {
          await engine.setPosition(fen, moves);
          const bestMove = await engine.getBestMove(timeMs);
          
          socket.emit('engineMove', {
            boardId,
            move: bestMove,
          });
          
          console.log(`[WebSocket] Engine move calculated for board ${boardId}:`, bestMove);
        } finally {
          enginePool.releaseEngine(engine);
        }
      } catch (error) {
        console.error('[WebSocket] Error calculating engine move:', error);
        socket.emit('error', { message: 'Failed to calculate engine move' });
      }
    });

    // Handle chat messages
    socket.on('sendChatMessage', async (data: {
      gameId: string;
      username: string;
      message: string;
    }) => {
      const { gameId, username, message } = data;
      
      try {
        await query(
          `INSERT INTO chat_messages (game_id, username, message)
           VALUES ($1, $2, $3)`,
          [gameId, username, message]
        );

        io.to(gameId).emit('chatMessage', {
          username,
          message,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('[WebSocket] Error handling chat message:', error);
      }
    });

    // Handle game end
    socket.on('endGame', async (data: {
      gameId: string;
      result: string;
    }) => {
      const { gameId, result } = data;
      
      try {
        await query(
          `UPDATE games 
           SET status = 'completed', result = $1, completed_at = NOW()
           WHERE id = $2`,
          [result, gameId]
        );

        io.to(gameId).emit('gameEnded', { result });
        
        console.log(`[WebSocket] Game ${gameId} ended: ${result}`);
      } catch (error) {
        console.error('[WebSocket] Error ending game:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      
      // Remove from all game rooms
      for (const [gameId, room] of gameRooms.entries()) {
        if (room.players.has(socket.id)) {
          room.players.delete(socket.id);
          socket.to(gameId).emit('playerLeft', { playerId: socket.id });
          
          if (room.players.size === 0) {
            gameRooms.delete(gameId);
          }
        }
      }
    });
  });

  console.log('[WebSocket] WebSocket server initialized');
  
  return io;
}
