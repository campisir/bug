import { Board } from './Board';
import type { IChessEngine } from '../engines/IChessEngine';
import type { PieceType } from './PiecePool';

/**
 * Bughouse Game
 * 
 * Manages the complete bughouse chess game with two boards:
 * - Player board: Where the human plays against a bot
 * - Partner board: Where two bots play against each other
 * 
 * In bughouse, pieces captured on one board become available 
 * for dropping on the partner board.
 */

export const GameStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  PLAYER_WON: 'player_won',
  PLAYER_LOST: 'player_lost',
  DRAW: 'draw',
} as const;

export type GameStatus = typeof GameStatus[keyof typeof GameStatus];

export interface BughouseGameConfig {
  playerColor: 'w' | 'b'; // Player's color on their board
  playerEngine: IChessEngine; // Engine opponent for player
  partnerEngine1: IChessEngine; // First bot on partner board
  partnerEngine2: IChessEngine; // Second bot on partner board
  thinkingTimeMs?: number; // Time for engine to think (default: 1000ms)
}

export class BughouseGame {
  private playerBoard: Board;
  private partnerBoard: Board;
  private engines: {
    player: IChessEngine;
    partner1: IChessEngine;
    partner2: IChessEngine;
  };
  private status: GameStatus = GameStatus.NOT_STARTED;
  private thinkingTimeMs: number;
  private onUpdate?: () => void;
  private isPartnerBoardPlaying: boolean = false;
  private isPaused: boolean = false;
  private lastPlayerMoveCount: number = 0;
  private lastPartnerMoveCount: number = 0;

  constructor(config: BughouseGameConfig) {
    // Player board: player vs engine
    this.playerBoard = new Board('player', config.playerColor);
    
    // Partner board: two engines playing
    // Partner plays OPPOSITE color from player for proper piece flow
    // If player is white, partner is black (and vice versa)
    const partnerColor = config.playerColor === 'w' ? 'b' : 'w';
    this.partnerBoard = new Board('partner', partnerColor);
    
    this.engines = {
      player: config.playerEngine,
      partner1: config.partnerEngine1,
      partner2: config.partnerEngine2,
    };

    this.thinkingTimeMs = config.thinkingTimeMs || 1000;
  }

  /**
   * Initialize all engines and start the game
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.engines.player.initialize(),
      this.engines.partner1.initialize(),
      this.engines.partner2.initialize(),
    ]);

    // Set bughouse variant for all engines
    await Promise.all([
      this.engines.player.setOptions({ UCI_Variant: 'bughouse' }),
      this.engines.partner1.setOptions({ UCI_Variant: 'bughouse' }),
      this.engines.partner2.setOptions({ UCI_Variant: 'bughouse' }),
    ]);

    this.status = GameStatus.IN_PROGRESS;
  }

  /**
   * Start the game
   */
  async start(): Promise<void> {
    this.status = GameStatus.IN_PROGRESS;
    
    console.log('Game starting...');
    
    // If player is black, make the first engine move
    if (this.playerBoard.getPlayerColor() === 'b') {
      await this.makeEngineMove(this.playerBoard, this.engines.player);
    }

    // Don't start partner board yet - it will start after player's first move
    console.log('Waiting for player to make first move...');
  }

  /**
   * Make a move on the player's board
   */
  async makePlayerMove(from: string, to: string, promotion?: string): Promise<boolean> {
    if (this.status !== GameStatus.IN_PROGRESS) {
      return false;
    }

    if (!this.playerBoard.isPlayerTurn()) {
      return false;
    }

    // TODO: Validate move legality
    // For now, assume move is legal
    
    // Detect captured piece (if any) before making the move
    const captured = this.getPieceAt(this.playerBoard, to);
    if (captured) {
      console.log(`[CAPTURE] Detected capture at ${to}: ${captured}`);
    }
    
    // Add move to history
    this.playerBoard.addMove({
      from,
      to,
      piece: 'p', // TODO: Get actual piece
      captured,
      promotion,
    });

    // Update partner's piece pool with any captured pieces
    this.updatePiecePools();

    // Trigger update callback
    if (this.onUpdate) {
      this.onUpdate();
    }

    // Engine responds on player board
    await this.makeEngineMove(this.playerBoard, this.engines.player);

    // Update piece pools after engine response
    this.updatePiecePools();

    // Trigger update callback
    if (this.onUpdate) {
      this.onUpdate();
    }

    // Start partner board playing if not already running
    if (!this.isPartnerBoardPlaying) {
      this.playPartnerBoard().catch(err => console.error('Partner board error:', err));
    }

    return true;
  }

  /**
   * Drop a piece from the pool onto the board
   */
  async dropPiece(square: string, pieceType: PieceType): Promise<boolean> {
    if (this.status !== GameStatus.IN_PROGRESS) {
      return false;
    }

    if (!this.playerBoard.isPlayerTurn()) {
      return false;
    }

    // Use player's pool (pieces captured on partner board)
    const playerPool = this.playerBoard.getPiecePool();
    
    console.log(`[DROP] Before drop - ${pieceType} count:`, playerPool.getCount(pieceType));
    
    if (!playerPool.removePiece(pieceType)) {
      console.log(`[DROP] Piece ${pieceType} not available in pool`);
      return false; // Piece not available
    }

    console.log(`[DROP] After removePiece - ${pieceType} count:`, playerPool.getCount(pieceType));
    console.log(`[DROP] Dropping ${pieceType} on ${square}`);

    // Add drop move
    this.playerBoard.addMove({
      from: '',
      to: square,
      piece: pieceType,
      drop: pieceType,
      dropColor: 'w', // Player is always white
    });

    // Trigger update callback
    if (this.onUpdate) {
      this.onUpdate();
    }

    // Start partner board if not already playing
    if (!this.isPartnerBoardPlaying) {
      this.playPartnerBoard().catch(err => console.error('Partner board error:', err));
    }

    // Engine responds
    await this.makeEngineMove(this.playerBoard, this.engines.player);

    // Update pools after engine response
    this.updatePiecePools();

    return true;
  }

  /**
   * Get the player's board
   */
  getPlayerBoard(): Board {
    return this.playerBoard;
  }

  /**
   * Get the partner's board
   */
  getPartnerBoard(): Board {
    return this.partnerBoard;
  }

  /**
   * Get the current game status
   */
  getStatus(): GameStatus {
    return this.status;
  }

  pause(): void {
    console.log('[GAME] Pausing partner board');
    this.isPaused = true;
  }

  resume(): void {
    console.log('[GAME] Resuming partner board');
    this.isPaused = false;
    // Restart partner board if it stopped
    if (!this.isPartnerBoardPlaying && this.status === GameStatus.IN_PROGRESS) {
      this.playPartnerBoard().catch(err => console.error('Partner board error:', err));
    }
  }

  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Register a callback for game updates
   */
  onGameUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Shutdown all engines and cleanup
   */
  async shutdown(): Promise<void> {
    await Promise.all([
      this.engines.player.shutdown(),
      this.engines.partner1.shutdown(),
      this.engines.partner2.shutdown(),
    ]);
  }

  /**
   * Helper to get piece at a square from FEN
   */
  private getPieceAt(board: Board, square: string): string | undefined {
    const fen = board.getFen();
    const fenParts = fen.split(' ');
    const position = fenParts[0];
    
    // Convert square notation (e.g., 'e4') to rank/file indices
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
    const rank = 8 - parseInt(square[1]); // 0-7 (from top)
    
    const ranks = position.split('/');
    if (rank < 0 || rank >= 8) return undefined;
    
    const rankStr = ranks[rank];
    let fileIndex = 0;
    
    for (const char of rankStr) {
      if (char >= '1' && char <= '8') {
        // Empty squares
        fileIndex += parseInt(char);
      } else {
        // Piece
        if (fileIndex === file) {
          return char; // Return the piece (e.g., 'p', 'N', 'Q')
        }
        fileIndex++;
      }
    }
    
    return undefined;
  }

  /**
   * Build holdings string for bughouse FEN
   * Format: UppercaseForWhite, lowercaseForBlack (e.g., "QRPpp")
   */
  private buildHoldingsString(piecePool: any, isWhite: boolean): string {
    const pieces = piecePool.getAllPieces();
    const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
    let holdings = '';
    
    for (const pieceType of order) {
      const count = pieces.get(pieceType) || 0;
      if (count > 0) {
        const piece = isWhite ? pieceType.toUpperCase() : pieceType;
        holdings += piece.repeat(count);
      }
    }
    
    return holdings;
  }

  /**
   * Determine the color of a dropped piece based on whose turn it is
   */
  private getDropColor(board: Board, _pieceType: string): 'w' | 'b' {
    // The piece color matches whose turn it is to move
    return board.getCurrentTurn();
  }

  // Private methods

  private async makeEngineMove(board: Board, engine: IChessEngine): Promise<void> {
    try {
      // Build FEN with holdings for bughouse
      const baseFen = board.getFen();
      const fenParts = baseFen.split(' ');
      
      // Get piece pools for holdings
      const whitePool = board.getWhitePiecePool();
      const blackPool = board.getBlackPiecePool();
      
      // Build holdings string (white pieces first, then black)
      const whiteHoldings = this.buildHoldingsString(whitePool, true);
      const blackHoldings = this.buildHoldingsString(blackPool, false);
      const holdings = whiteHoldings + blackHoldings;
      
      // Insert holdings before the halfmove clock (after en passant square)
      // Standard FEN: position w castling ep halfmove fullmove
      // Bughouse FEN: position[holdings] w castling ep halfmove fullmove
      const fenWithHoldings = holdings 
        ? `${fenParts[0]}[${holdings}] ${fenParts.slice(1).join(' ')}`
        : baseFen;
      
      // Set current position with holdings (no moves - FEN already has the current position)
      await engine.setPosition(fenWithHoldings, []);

      // Get best move
      const move = await engine.getBestMove(this.thinkingTimeMs);

      // If it's a drop move, remove the piece from the pool first
      if (move.drop) {
        const pieceType = move.drop.toLowerCase() as PieceType;
        const dropColor = this.getDropColor(board, move.drop);
        const pool = dropColor === 'w' ? board.getWhitePiecePool() : board.getBlackPiecePool();
        
        const boardName = board === this.playerBoard ? 'player' : 'partner';
        if (boardName === 'partner') {
          console.log(`[PARTNER] ${dropColor === 'w' ? 'WHITE' : 'BLACK'} dropping ${pieceType} at ${move.to}`);
          console.log(`[PARTNER] FEN BEFORE DROP:`, board.getFen());
        }
        
        if (!pool.removePiece(pieceType)) {
          console.error(`[DROP ERROR] Piece ${pieceType} not available in ${dropColor} pool`);
          return; // Can't drop a piece that's not available
        }
      }

      // Detect captured piece (if any) before making the move
      const captured = move.drop ? undefined : this.getPieceAt(board, move.to);
      if (captured) {
        const boardName = board === this.playerBoard ? 'player' : 'partner';
        const moveNum = board.getMoveHistory().length + 1;
        if (boardName === 'partner') {
          console.log(`[PARTNER] Move ${moveNum}: ${move.from || 'drop'} to ${move.to} captures ${captured}`);
        }
      }

      // Apply move with captured piece info
      board.addMove({
        from: move.from,
        to: move.to,
        piece: 'p', // TODO: Get actual piece
        captured,
        promotion: move.promotion,
        drop: move.drop ? move.drop as PieceType : undefined,
        dropColor: move.drop ? this.getDropColor(board, move.drop) : undefined,
      });

      if (board === this.partnerBoard) {
        console.log(`[PARTNER] FEN AFTER MOVE:`, board.getFen());
      }

      // Note: updatePiecePools() is called after this function returns

      // Trigger update
      if (this.onUpdate) {
        this.onUpdate();
      }
    } catch (error) {
      console.error('Engine move failed:', error);
    }
  }

  private async playPartnerBoard(): Promise<void> {
    // Prevent multiple concurrent loops
    if (this.isPartnerBoardPlaying) {
      console.log('Partner board already playing, skipping...');
      return;
    }
    
    console.log('Partner board starting play loop...');
    this.isPartnerBoardPlaying = true;
    
    try {
      // Keep playing on the partner board until the game ends
      while (this.status === GameStatus.IN_PROGRESS) {
        // Check if paused
        if (this.isPaused) {
          console.log('[GAME] Partner board paused, waiting...');
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        
        const moveCount = this.partnerBoard.getMoveHistory().length;
        const engine = moveCount % 2 === 0 ? this.engines.partner1 : this.engines.partner2;
        
        console.log(`[PARTNER] ========== Move ${moveCount + 1} ==========`);
        await this.makeEngineMove(this.partnerBoard, engine);
        
        // Update piece pools after partner move
        this.updatePiecePools();
        
        // Trigger UI update
        if (this.onUpdate) {
          this.onUpdate();
        }
        
        // Add a delay to prevent overwhelming the engines and UI
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check for checkmate/stalemate on partner board
        // TODO: Implement proper game over detection
        // For now, limit to prevent infinite loop during testing
        if (this.partnerBoard.getMoveHistory().length > 100) {
          console.log('Partner board reached move limit');
          break;
        }
      }
    } finally {
      console.log('Partner board play loop ended');
      this.isPartnerBoardPlaying = false;
    }
  }

  private updatePiecePools(): void {
    // Only process captures from new moves
    const currentPlayerMoves = this.playerBoard.getMoveHistory().length;
    const currentPartnerMoves = this.partnerBoard.getMoveHistory().length;
    
    // Check for new captures on player board (skip drop moves)
    if (currentPlayerMoves > this.lastPlayerMoveCount) {
      const playerLastMove = this.playerBoard.getLastMove();
      if (playerLastMove?.captured && !playerLastMove?.drop) {
        const pieceType = playerLastMove.captured.toLowerCase() as PieceType;
        const capturedPieceIsWhite = playerLastMove.captured === playerLastMove.captured.toUpperCase();
        
        if (capturedPieceIsWhite) {
          // White piece captured → goes to white player on partner board
          console.log(`[POOL] White piece captured on player board: ${pieceType}, adding to partner WHITE pool`);
          this.partnerBoard.getWhitePiecePool().addPiece(pieceType);
        } else {
          // Black piece captured → goes to black player on partner board (your partner)
          console.log(`[POOL] Black piece captured on player board: ${pieceType}, adding to partner BLACK pool`);
          this.partnerBoard.getBlackPiecePool().addPiece(pieceType);
        }
      }
      this.lastPlayerMoveCount = currentPlayerMoves;
    }

    // Check for new captures on partner board (skip drop moves)
    if (currentPartnerMoves > this.lastPartnerMoveCount) {
      const partnerLastMove = this.partnerBoard.getLastMove();
      if (partnerLastMove?.captured && !partnerLastMove?.drop) {
        const pieceType = partnerLastMove.captured.toLowerCase() as PieceType;
        const capturedPieceIsWhite = partnerLastMove.captured === partnerLastMove.captured.toUpperCase();
        
        if (capturedPieceIsWhite) {
          // White piece captured → goes to white player on player board (you)
          console.log(`[POOL] White piece captured on partner board: ${pieceType}, adding to player WHITE pool`);
          this.playerBoard.getWhitePiecePool().addPiece(pieceType);
        } else {
          // Black piece captured → goes to black player on player board (your opponent)
          console.log(`[POOL] Black piece captured on partner board: ${pieceType}, adding to player BLACK pool`);
          this.playerBoard.getBlackPiecePool().addPiece(pieceType);
        }
      }
      this.lastPartnerMoveCount = currentPartnerMoves;
    }
  }
}
