import { Board } from './Board';
import type { IChessEngine } from '../engines/IChessEngine';
import type { PieceType } from './PiecePool';
import { Chess } from 'chess.js';

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
  PARTNER_WON: 'partner_won',
  PARTNER_LOST: 'partner_lost',
  DRAW: 'draw',
  FINISHED: 'finished',
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
  
  // Piece request system for strategic stalling
  private pieceRequests: {
    playerRequests?: PieceType; // What player board bot wants from partner
    partnerRequests?: PieceType; // What partner board bot wants from player
  } = {};

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

    // Check if game is over
    await this.checkGameOver();

    // Trigger update callback
    if (this.onUpdate) {
      this.onUpdate();
    }

    // Only continue if game is still in progress
    if (this.status !== GameStatus.IN_PROGRESS) {
      return true;
    }

    // Engine responds on player board
    await this.makeEngineMove(this.playerBoard, this.engines.player);

    // Update piece pools after engine response
    this.updatePiecePools();

    // Check again after engine move
    await this.checkGameOver();

    // Trigger update callback
    if (this.onUpdate) {
      this.onUpdate();
    }

    // Start partner board playing if not already running
    if (!this.isPartnerBoardPlaying && this.status === GameStatus.IN_PROGRESS) {
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

    // Validate the drop before committing
    const currentFen = this.playerBoard.getFen();
    if (!this.isDropLegal(currentFen, square, pieceType, this.playerBoard.getPlayerColor())) {
      console.log(`[DROP] Drop is not legal on ${square}`);
      // Return the piece to the pool
      playerPool.addPiece(pieceType);
      return false;
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

    // Check if game is over after drop
    await this.checkGameOver();

    // Only continue if game is still in progress
    if (this.status !== GameStatus.IN_PROGRESS) {
      return true;
    }

    // Start partner board if not already playing
    if (!this.isPartnerBoardPlaying) {
      this.playPartnerBoard().catch(err => console.error('Partner board error:', err));
    }

    // Engine responds
    await this.makeEngineMove(this.playerBoard, this.engines.player);

    // Update pools after engine response
    this.updatePiecePools();

    // Check again after engine response
    await this.checkGameOver();

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

  /**
   * Check if game is over due to checkmate or stalemate
   */
  private async checkGameOver(): Promise<void> {
    if (this.status !== GameStatus.IN_PROGRESS) return;

    // Check player board for true checkmate
    const playerCheckmate = await this.isTrueCheckmate(this.playerBoard, this.engines.player);
    if (playerCheckmate) {
      const losingColor = this.playerBoard.getCurrentTurn();
      if (losingColor === this.playerBoard.getPlayerColor()) {
        this.status = GameStatus.PLAYER_LOST;
      } else {
        this.status = GameStatus.PLAYER_WON;
      }
      console.log(`[GAME] Player board TRUE checkmate: ${this.status}`);
      return;
    }

    // Check for stalemate on player board
    if (this.playerBoard.isStalemate()) {
      this.status = GameStatus.DRAW;
      console.log(`[GAME] Player board stalemate`);
      return;
    }

    // Check partner board for true checkmate
    const partnerCheckmate = await this.isTrueCheckmate(this.partnerBoard, this.engines.partner1);
    if (partnerCheckmate) {
      const losingColor = this.partnerBoard.getCurrentTurn();
      if (losingColor === this.partnerBoard.getPlayerColor()) {
        this.status = GameStatus.PARTNER_LOST;
      } else {
        this.status = GameStatus.PARTNER_WON;
      }
      console.log(`[GAME] Partner board TRUE checkmate: ${this.status}`);
      return;
    }

    // Check for stalemate on partner board
    if (this.partnerBoard.isStalemate()) {
      this.status = GameStatus.DRAW;
      console.log(`[GAME] Partner board stalemate`);
      return;
    }
  }

  /**
   * Check if a position is a true checkmate in bughouse
   * 
   * In bughouse, checkmate is only final if adding a queen to the pool
   * wouldn't allow the player to escape. This handles cases like:
   * - Smothered mate: Still mate even with a queen (TRUE CHECKMATE)
   * - Back-rank mate: Not mate if you could drop a piece (NOT TRUE CHECKMATE)
   */
  private async isTrueCheckmate(board: Board, engine: IChessEngine): Promise<boolean> {
    // First check if Fairy-Stockfish thinks it's checkmate with current pool
    if (!board.isCheckmate()) {
      return false;
    }

    console.log(`[CHECKMATE] Position is checkmate by chess.js, verifying with queen drop test...`);

    // Get the current turn (the player in checkmate)
    const checkmatedColor = board.getCurrentTurn();
    const pool = checkmatedColor === 'w' ? board.getWhitePiecePool() : board.getBlackPiecePool();

    // Get current pool holdings
    const currentPoolPieces = pool.getAllPieces();
    console.log(`[CHECKMATE] Current pool for ${checkmatedColor}:`, Object.fromEntries(currentPoolPieces));

    // Temporarily add a queen to the checkmated player's pool
    pool.addPiece('q');
    const testPoolPieces = pool.getAllPieces();
    console.log(`[CHECKMATE] Test pool with extra queen:`, Object.fromEntries(testPoolPieces));

    try {
      // Build FEN with holdings notation for Fairy-Stockfish
      // In bughouse FEN, holdings are appended after the position like: [Qq] for white Q and black q
      const baseFen = board.getFen();
      const fenParts = baseFen.split(' ');
      
      // Build holdings string for both colors
      const whitePool = board.getWhitePiecePool().getAllPieces();
      const blackPool = board.getBlackPiecePool().getAllPieces();
      
      let holdings = '';
      // White pieces (uppercase)
      ['Q', 'R', 'B', 'N', 'P'].forEach(piece => {
        const count = whitePool.get(piece.toLowerCase() as any) || 0;
        holdings += piece.repeat(count);
      });
      // Black pieces (lowercase)
      ['q', 'r', 'b', 'n', 'p'].forEach(piece => {
        const count = blackPool.get(piece as any) || 0;
        holdings += piece.repeat(count);
      });
      
      // Insert holdings into FEN (after castling rights, before en passant)
      // Standard FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
      // Bughouse FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[Qq] w KQkq - 0 1
      const positionFen = holdings ? `${fenParts[0]}[${holdings}]` : fenParts[0];
      const modifiedFen = [positionFen, ...fenParts.slice(1)].join(' ');
      
      console.log(`[CHECKMATE] Testing with FEN: ${modifiedFen}`);

      // Set up the position with the extra queen in holdings
      await engine.setPosition(modifiedFen, []);

      // Ask the engine to find a move with very short time
      const move = await engine.getBestMove(500); // 500ms to find any legal move

      console.log(`[CHECKMATE] Engine returned move:`, move);
      console.log(`[CHECKMATE] move.from =`, JSON.stringify(move.from), `move.to =`, JSON.stringify(move.to));

      // Remove the temporary queen
      pool.removePiece('q');

      if (!move || move.from === '(none)' || move.to === '(none)' || move.from === '0000') {
        // No legal move even with a queen available = TRUE CHECKMATE
        console.log(`[CHECKMATE] Still checkmate even with queen available - TRUE MATE`);
        return true;
      } else {
        // A legal move exists with the queen = can potentially block/escape
        console.log(`[CHECKMATE] Not true mate - could escape with move:`, JSON.stringify(move));
        return false;
      }
    } catch (error) {
      // Remove the temporary queen in case of error
      pool.removePiece('q');
      console.error(`[CHECKMATE] Error checking mate status:`, error);
      // Default to false (don't end game on error)
      return false;
    }
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
   * Check if adding a specific piece type would critically improve the position
   * Returns the CHEAPEST piece type to request, or null if no stalling needed
   * 
   * Criteria:
   * - Pawn/Knight/Bishop: Request if forces mate OR saves from significantly losing position
   * - Rook/Queen: ONLY request if forces mate OR saves from mate threat
   */
  private async shouldStallForPiece(
    board: Board, 
    engine: IChessEngine
  ): Promise<PieceType | null> {
    const EVAL_DEPTH = 12; // Depth for evaluation
    
    // Identify which board and color for logging
    const boardName = board === this.playerBoard ? 'PLAYER' : 'PARTNER';
    const turn = board.getCurrentTurn();
    const colorName = turn === 'w' ? 'WHITE' : 'BLACK';
    const botId = `[${boardName} ${colorName}]`;
    
    // Build FEN with current holdings
    const baseFen = board.getFen();
    const whitePool = board.getWhitePiecePool();
    const blackPool = board.getBlackPiecePool();
    const currentHoldings = this.buildHoldingsString(whitePool, true) + 
                           this.buildHoldingsString(blackPool, false);
    
    const fenWithCurrentHoldings = currentHoldings
      ? `${baseFen.split(' ')[0]}[${currentHoldings}] ${baseFen.split(' ').slice(1).join(' ')}`
      : baseFen;
    
    // Get current position evaluation
    await engine.setPosition(fenWithCurrentHoldings, []);
    const currentEval = await engine.getEvaluation(EVAL_DEPTH);
    
    const currentStatus = currentEval.isMate 
      ? `mate in ${currentEval.score}`
      : `eval ${currentEval.score}cp`;
    console.log(`[STALL] ${botId} Current: ${currentStatus}`);
    
    // If already delivering mate, don't stall
    if (currentEval.isMate && currentEval.score > 0) {
      return null;
    }
    
    const piecesToTry: PieceType[] = ['p', 'n', 'b', 'r', 'q'];
    
    for (const pieceType of piecesToTry) {
      // Add hypothetical piece to holdings
      const hypotheticalPiece = turn === 'w' ? pieceType.toUpperCase() : pieceType;
      const hypotheticalHoldings = currentHoldings + hypotheticalPiece;
      const fenWithHypothetical = `${baseFen.split(' ')[0]}[${hypotheticalHoldings}] ${baseFen.split(' ').slice(1).join(' ')}`;
      
      await engine.setPosition(fenWithHypothetical, []);
      const hypotheticalEval = await engine.getEvaluation(EVAL_DEPTH);
      
      const hypotheticalStatus = hypotheticalEval.isMate
        ? `mate in ${hypotheticalEval.score}`
        : `eval ${hypotheticalEval.score}cp`;
      console.log(`[STALL] ${botId} With ${pieceType}: ${hypotheticalStatus}`);
      
      // Check if this piece forces mate (not mating → mating)
      const forcesMate = !currentEval.isMate && hypotheticalEval.isMate && hypotheticalEval.score > 0;
      
      // Check if this piece saves from mate threat (getting mated → not getting mated)
      const savesFromMate = currentEval.isMate && currentEval.score < 0 && 
                           (!hypotheticalEval.isMate || hypotheticalEval.score > 0);
      
      // ONLY stall on actual mate threats - ignore material evaluation completely
      if (forcesMate) {
        console.log(`[STALL] ${botId} ${pieceType.toUpperCase()} forces mate in ${hypotheticalEval.score}! Requesting.`);
        return pieceType;
      }
      if (savesFromMate) {
        console.log(`[STALL] ${botId} ${pieceType.toUpperCase()} saves from mate! Requesting.`);
        return pieceType;
      }
    }
    
    return null; // No critical need found
  }

  /**
   * Find a "stalling" move - a safe waiting move that doesn't commit pieces
   * Used when waiting for partner to deliver a requested piece
   */
  private async getStallMove(board: Board, engine: IChessEngine): Promise<any> {
    // For now, just get the best move but could filter for quiet moves
    // TODO: Filter for moves that don't trade pieces, don't advance position much
    const baseFen = board.getFen();
    await engine.setPosition(baseFen, []);
    return await engine.getBestMove(this.thinkingTimeMs);
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

      // Check if we should stall for a piece
      const requestedPiece = await this.shouldStallForPiece(board, engine);
      
      // IMPORTANT: Reset engine to ACTUAL position after testing hypothetical pieces
      // shouldStallForPiece() leaves the engine with a hypothetical position loaded
      await engine.setPosition(fenWithHoldings, []);
      
      if (requestedPiece) {
        // Store the request so partner board can prioritize capturing this piece type
        const isPlayerBoard = board === this.playerBoard;
        if (isPlayerBoard) {
          this.pieceRequests.playerRequests = requestedPiece;
          console.log(`[REQUEST] Player board requests ${requestedPiece} from partner`);
        } else {
          this.pieceRequests.partnerRequests = requestedPiece;
          console.log(`[REQUEST] Partner board requests ${requestedPiece} from player`);
        }
        
        // Get a stalling move instead of the best move
        const move = await this.getStallMove(board, engine);
        console.log(`[STALL] Playing stalling move while waiting for ${requestedPiece}`);
        
        // Continue with the stalling move...
        await this.executeMoveOnBoard(board, engine, move);
        return;
      }

      // No stalling needed - get and play best move
      const move = await engine.getBestMove(this.thinkingTimeMs);
      
      await this.executeMoveOnBoard(board, engine, move);
    } catch (error) {
      console.error('Engine move failed:', error);
    }
  }

  /**
   * Execute a move on the board (extracted for reuse in stalling logic)
   */
  private async executeMoveOnBoard(board: Board, engine: IChessEngine, move: any): Promise<void> {
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
      
      // Check if this capture fulfills a piece request from partner board
      const capturedType = captured.toLowerCase() as PieceType;
      const isPlayerBoard = board === this.playerBoard;
      
      if (isPlayerBoard && this.pieceRequests.partnerRequests === capturedType) {
        console.log(`[REQUEST] Player board captured ${capturedType} - fulfilling partner's request!`);
        this.pieceRequests.partnerRequests = undefined; // Request fulfilled
      } else if (!isPlayerBoard && this.pieceRequests.playerRequests === capturedType) {
        console.log(`[REQUEST] Partner board captured ${capturedType} - fulfilling player's request!`);
        this.pieceRequests.playerRequests = undefined; // Request fulfilled
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

    // Trigger update
    if (this.onUpdate) {
      this.onUpdate();
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
        
        // Check if game is over
        await this.checkGameOver();
        
        // Notify update
        if (this.onUpdate) {
          this.onUpdate();
        }
        
        // Add a delay to prevent overwhelming the engines and UI
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Exit if game is over
        if (this.status !== GameStatus.IN_PROGRESS) {
          console.log(`Partner board stopped: ${this.status}`);
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

  /**
   * Check if a piece drop is legal
   */
  private isDropLegal(fen: string, square: string, pieceType: PieceType, playerColor: 'w' | 'b'): boolean {
    try {
      // Parse the FEN to check if square is occupied
      const fenParts = fen.split(' ');
      const board = fenParts[0];
      
      // Convert square to board position
      const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
      const rank = 8 - parseInt(square[1]); // 0-7 (rank 8 = index 0)
      
      // Parse board to check if square is occupied
      const ranks = board.split('/');
      let currentFile = 0;
      const rankStr = ranks[rank];
      
      for (const char of rankStr) {
        if (char >= '1' && char <= '8') {
          const emptySquares = parseInt(char);
          if (currentFile <= file && file < currentFile + emptySquares) {
            // Square is empty, continue validation
            break;
          }
          currentFile += emptySquares;
        } else {
          if (currentFile === file) {
            // Square is occupied
            console.log(`[DROP] Square ${square} is occupied`);
            return false;
          }
          currentFile++;
        }
      }
      
      // Create a test FEN with the piece dropped
      const testFen = this.createDropFEN(fen, square, pieceType, playerColor);
      
      // Use chess.js to validate the position is legal (not in check if we're in check)
      const chess = new Chess();
      
      try {
        chess.load(testFen);
        
        // Check if the player's king is in check after the drop
        // We cannot make a drop that leaves our king in check
        const isInCheckAfter = chess.isCheck();
        
        if (isInCheckAfter) {
          console.log(`[DROP] Would leave king in check`);
          return false;
        }
        
        return true;
      } catch (e) {
        console.log(`[DROP] Invalid FEN after drop:`, e);
        return false;
      }
    } catch (error) {
      console.error('[DROP] Error validating drop:', error);
      return false;
    }
  }
  
  /**
   * Create a FEN with a piece dropped on a square
   */
  private createDropFEN(fen: string, square: string, pieceType: PieceType, playerColor: 'w' | 'b'): string {
    const fenParts = fen.split(' ');
    const board = fenParts[0];
    
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = 8 - parseInt(square[1]);
    
    const ranks = board.split('/');
    const rankStr = ranks[rank];
    
    // Insert the piece into the rank
    let newRank = '';
    let currentFile = 0;
    let inserted = false;
    
    for (const char of rankStr) {
      if (char >= '1' && char <= '8') {
        const emptySquares = parseInt(char);
        if (!inserted && currentFile <= file && file < currentFile + emptySquares) {
          // Insert piece here
          const before = file - currentFile;
          const after = emptySquares - before - 1;
          
          if (before > 0) newRank += before.toString();
          newRank += playerColor === 'w' ? pieceType.toUpperCase() : pieceType.toLowerCase();
          if (after > 0) newRank += after.toString();
          
          inserted = true;
          currentFile += emptySquares;
        } else {
          newRank += char;
          currentFile += emptySquares;
        }
      } else {
        newRank += char;
        currentFile++;
      }
    }
    
    ranks[rank] = newRank;
    fenParts[0] = ranks.join('/');
    
    return fenParts.join(' ');
  }
}
