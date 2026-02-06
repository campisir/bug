import { query } from './connection';

/**
 * Database Schema Migration
 * 
 * Creates all necessary tables for bughouse.ai MVP
 */

export async function migrate() {
  console.log('[Migration] Starting database migration...');

  try {
    // Enable UUID extension
    await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255),
        elo_standard INTEGER DEFAULT 1200,
        elo_bot INTEGER DEFAULT 1200,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create index on username for quick lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    // Games table
    await query(`
      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type VARCHAR(20) NOT NULL CHECK (type IN ('pvp', 'pvb', 'bvb')),
        
        -- Players (null for bot positions)
        white_board1_id UUID REFERENCES users(id),
        black_board1_id UUID REFERENCES users(id),
        white_board2_id UUID REFERENCES users(id),
        black_board2_id UUID REFERENCES users(id),
        
        -- Bots (null for human positions) - for future
        white_board1_bot_id UUID,
        black_board1_bot_id UUID,
        white_board2_bot_id UUID,
        black_board2_bot_id UUID,
        
        -- Game state
        board1_fen TEXT NOT NULL,
        board2_fen TEXT NOT NULL,
        current_turn VARCHAR(10) NOT NULL DEFAULT 'white',
        status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'abandoned')),
        result VARCHAR(100),
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for game queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
      CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
    `);

    // Moves table
    await query(`
      CREATE TABLE IF NOT EXISTS moves (
        id SERIAL PRIMARY KEY,
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        board_id SMALLINT NOT NULL CHECK (board_id IN (1, 2)),
        ply INTEGER NOT NULL,
        move VARCHAR(10) NOT NULL,
        fen TEXT NOT NULL,
        
        -- Optional engine analysis cache
        evaluation INTEGER,
        depth SMALLINT,
        
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for move queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id);
      CREATE INDEX IF NOT EXISTS idx_moves_game_board ON moves(game_id, board_id, ply);
    `);

    // Chat messages table
    await query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        username VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_chat_game_id ON chat_messages(game_id, created_at);
    `);

    // Bots table (for future Phase 2)
    await query(`
      CREATE TABLE IF NOT EXISTS bots (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        creator_id UUID NOT NULL REFERENCES users(id),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        engine_type VARCHAR(50) DEFAULT 'fairy-stockfish',
        rules_json JSONB NOT NULL DEFAULT '[]',
        elo INTEGER DEFAULT 1200,
        games_played INTEGER DEFAULT 0,
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_bots_creator ON bots(creator_id);
      CREATE INDEX IF NOT EXISTS idx_bots_public_elo ON bots(is_public, elo DESC) WHERE is_public = true;
    `);

    console.log('[Migration] Database migration completed successfully!');
    return true;
  } catch (error) {
    console.error('[Migration] Error during migration:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('[Migration] Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Migration] Migration failed:', error);
      process.exit(1);
    });
}
