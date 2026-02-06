import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database/connection';
import type { GameState } from '../types';

const router = Router();

/**
 * GET /api/games
 * List all active games
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        g.*,
        u1.username as white_board1_username,
        u2.username as black_board1_username,
        u3.username as white_board2_username,
        u4.username as black_board2_username
      FROM games g
      LEFT JOIN users u1 ON g.white_board1_id = u1.id
      LEFT JOIN users u2 ON g.black_board1_id = u2.id
      LEFT JOIN users u3 ON g.white_board2_id = u3.id
      LEFT JOIN users u4 ON g.black_board2_id = u4.id
      WHERE g.status IN ('waiting', 'active')
      ORDER BY g.created_at DESC
      LIMIT 50
    `);

    res.json({ games: result.rows });
  } catch (error) {
    console.error('[API] Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

/**
 * GET /api/games/:id
 * Get a specific game with moves
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const gameResult = await query(
      `SELECT * FROM games WHERE id = $1`,
      [id]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const movesResult = await query(
      `SELECT * FROM moves WHERE game_id = $1 ORDER BY board_id, ply`,
      [id]
    );

    res.json({
      game: gameResult.rows[0],
      moves: movesResult.rows,
    });
  } catch (error) {
    console.error('[API] Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

/**
 * POST /api/games
 * Create a new game
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { type = 'pvp', userId, username } = req.body;

    // Starting FEN for bughouse (standard chess starting position)
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    const result = await query(
      `INSERT INTO games (
        type,
        board1_fen,
        board2_fen,
        current_turn,
        status
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [type, startingFen, startingFen, 'white', 'waiting']
    );

    const game = result.rows[0];
    
    console.log(`[API] Created new game: ${game.id}`);
    
    res.status(201).json({ game });
  } catch (error) {
    console.error('[API] Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

/**
 * POST /api/games/:id/join
 * Join a game
 */
router.post('/:id/join', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, username, position } = req.body;

    // For MVP, we'll allow joining without authentication
    // Position should be one of: white_board1, black_board1, white_board2, black_board2

    const result = await query(
      `UPDATE games 
       SET ${position}_id = $1,
           status = CASE 
             WHEN white_board1_id IS NOT NULL 
               AND black_board1_id IS NOT NULL 
               AND white_board2_id IS NOT NULL 
               AND black_board2_id IS NOT NULL 
             THEN 'active'::VARCHAR
             ELSE status 
           END,
           started_at = CASE 
             WHEN status = 'waiting' 
               AND white_board1_id IS NOT NULL 
               AND black_board1_id IS NOT NULL 
               AND white_board2_id IS NOT NULL 
               AND black_board2_id IS NOT NULL 
             THEN NOW() 
             ELSE started_at 
           END
       WHERE id = $2
       RETURNING *`,
      [userId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ game: result.rows[0] });
  } catch (error) {
    console.error('[API] Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

/**
 * POST /api/games/:id/move
 * Make a move (for HTTP fallback, mainly use WebSocket)
 */
router.post('/:id/move', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { boardId, move, fen, ply } = req.body;

    // Store the move
    await query(
      `INSERT INTO moves (game_id, board_id, ply, move, fen)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, boardId, ply, move, fen]
    );

    // Update game state
    const fenColumn = boardId === 1 ? 'board1_fen' : 'board2_fen';
    await query(
      `UPDATE games 
       SET ${fenColumn} = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [fen, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error making move:', error);
    res.status(500).json({ error: 'Failed to make move' });
  }
});

/**
 * GET /api/games/:id/engine-move
 * Get engine suggestion for a position
 */
router.get('/:id/engine-move', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { boardId, timeMs = 1000 } = req.query;

    const gameResult = await query(
      `SELECT * FROM games WHERE id = $1`,
      [id]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = gameResult.rows[0];
    const fen = boardId === '1' ? game.board1_fen : game.board2_fen;

    // Get moves for this board
    const movesResult = await query(
      `SELECT move FROM moves 
       WHERE game_id = $1 AND board_id = $2 
       ORDER BY ply`,
      [id, boardId]
    );

    const moves = movesResult.rows.map(r => r.move);

    // Note: Engine move calculation will be handled via WebSocket in production
    // This is a placeholder for HTTP fallback
    res.json({ 
      message: 'Use WebSocket for engine moves',
      fen,
      moves 
    });
  } catch (error) {
    console.error('[API] Error getting engine move:', error);
    res.status(500).json({ error: 'Failed to get engine move' });
  }
});

export default router;
