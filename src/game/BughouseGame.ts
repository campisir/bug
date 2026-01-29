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
  onChatMessage?: (sender: 'Partner' | 'Bot 1' | 'Bot 2' | 'System' | 'You', message: string) => void;
  getClockTimes?: () => { playerWhite: number; playerBlack: number; partnerWhite: number; partnerBlack: number };
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
  private onChatMessage?: (sender: 'Partner' | 'Bot 1' | 'Bot 2' | 'System' | 'You', message: string) => void;
  private getClockTimes?: () => { playerWhite: number; playerBlack: number; partnerWhite: number; partnerBlack: number };
  private isPartnerBoardPlaying: boolean = false;
  private isPaused: boolean = false;
  private lastPlayerMoveCount: number = 0;
  private lastPartnerMoveCount: number = 0;
  
  // Stalling state tracking
  private stallingState: {
    bot1?: { piece: PieceType; reason: string; playerInduced?: boolean }; // Bot 1 (player's opponent)
    partner?: { piece: PieceType; reason: string; playerInduced?: boolean }; // Partner bot
    bot2?: { piece: PieceType; reason: string; playerInduced?: boolean }; // Bot 2 (partner's opponent)
  } = {};
  
  // Track if bot has already sent "down time" message
  private downTimeMessageSent: {
    bot1: boolean;
    partner: boolean;
    bot2: boolean;
  } = { bot1: false, partner: false, bot2: false };
  
  // Track when partner was forced to go (prevent immediate re-stall)
  private partnerForcedToGo: boolean = false;

  constructor(config: BughouseGameConfig) {
    // Player board: player vs engine
    this.playerBoard = new Board('player', config.playerColor);
    
    // Partner board: two engines playing
    // Partner plays OPPOSITE color from player for proper piece flow
    // If player is white, partner is black (and vice versa)
    const partnerColor = config.playerColor === 'w' ? 'b' : 'w';
    this.partnerBoard = new Board('partner', partnerColor);
    
    this.getClockTimes = config.getClockTimes;
    this.engines = {
      player: config.playerEngine,
      partner1: config.partnerEngine1,
      partner2: config.partnerEngine2,
    };

    this.thinkingTimeMs = config.thinkingTimeMs || 1000;
    this.onChatMessage = config.onChatMessage;
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

    // Check if any bot should abandon stalling due to time and resume
    const botsToResume = this.checkTimeBasedStallAbandonment();
    for (const { botName, board, engine } of botsToResume) {
      console.log(`[STALL] ${botName} resuming immediately after time abandonment`);
      // Set position before getting move
      await engine.setPosition(board.getFen(), []);
      // Directly make a move without re-evaluating stalling logic
      const move = await engine.getBestMove(this.thinkingTimeMs);
      await this.executeMoveOnBoard(board, engine, move);
    }
    
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
   * Player sends "Go" command - forces Partner to exit stalling
   */
  sendGoCommand(): void {
    // Send player's message first
    if (this.onChatMessage) {
      this.onChatMessage('You', 'Go');
    }
    
    // Random delay 1-2 seconds for realistic response
    const delay = 1000 + Math.random() * 1000;
    setTimeout(() => {
      if (this.stallingState.partner) {
        // Partner is stalling - force exit
        if (this.onChatMessage) {
          this.onChatMessage('Partner', 'I go.');
        }
        delete this.stallingState.partner;
        this.partnerForcedToGo = true; // Prevent immediate re-stall
      } else {
        // Partner is not stalling
        if (this.onChatMessage) {
          this.onChatMessage('Partner', '?');
        }
      }
    }, delay);
  }

  /**
   * Player sends "Sit" command - forces Partner to enter stalling
   */
  sendSitCommand(): void {
    // Send player's message first
    if (this.onChatMessage) {
      this.onChatMessage('You', 'Sit');
    }
    
    // Random delay 1-2 seconds for realistic response
    const delay = 1000 + Math.random() * 1000;
    setTimeout(() => {
      if (this.stallingState.partner) {
        // Partner is already stalling
        if (this.onChatMessage) {
          this.onChatMessage('Partner', 'I am.');
        }
      } else {
        // Partner is not stalling - force stall
        if (this.onChatMessage) {
          this.onChatMessage('Partner', 'I sit.');
        }
        // Enter player-induced stall (use dummy piece)
        this.stallingState.partner = {
          piece: 'q',
          reason: 'player_command',
          playerInduced: true
        };
      }
    }, delay);
  }

  /**
   * Check if adding a specific piece type would critically improve the position
   * Returns evaluation result with piece, scenario, and whether to stall
   */
  private async shouldStallForPiece(
    board: Board, 
    engine: IChessEngine,
    botName: 'Bot 1' | 'Partner' | 'Bot 2'
  ): Promise<{ piece: PieceType; scenario: string; shouldStall: boolean; mateDistance?: number } | null> {
    const EVAL_DEPTH = 12;
    const LOSING_THRESHOLD = 300; // Position is "lost" if eval > +300cp (positive = bad)
    const WINNING_THRESHOLD = 200; // Position is "significantly winning" if eval < -200cp (negative = good)
    const LONG_MATE_THRESHOLD = 5; // Treat mate distances > 5 as winning positions instead of mates
    const LONG_MATE_CP_VALUE = 5000; // Centipawn value to assign to long mates
    
    // Get diagonal player's time
    const times = this.getClockTimes?.();
    if (!times) return null;
    
    const { botTime, diagonalTime } = this.getBotAndDiagonalTimes(botName, times);
    const upOnTime = botTime > diagonalTime;
    
    // Build FEN with current holdings
    const baseFen = board.getFen();
    const whitePool = board.getWhitePiecePool();
    const blackPool = board.getBlackPiecePool();
    const turn = board.getCurrentTurn();
    const currentHoldings = this.buildHoldingsString(whitePool, true) + 
                           this.buildHoldingsString(blackPool, false);
    
    const fenWithCurrentHoldings = currentHoldings
      ? `${baseFen.split(' ')[0]}[${currentHoldings}] ${baseFen.split(' ').slice(1).join(' ')}`
      : baseFen;
    
    await engine.setPosition(fenWithCurrentHoldings, []);
    const currentEval = await engine.getEvaluation(EVAL_DEPTH);
    
    // Convert long mates (> 5 moves) to centipawn values
    let currentIsMate = currentEval.isMate;
    let currentScore = currentEval.score;
    if (currentEval.isMate && Math.abs(currentEval.score) > LONG_MATE_THRESHOLD) {
      currentIsMate = false;
      currentScore = currentEval.score > 0 ? LONG_MATE_CP_VALUE : -LONG_MATE_CP_VALUE;
    }
    
    const isPlayerBoard = board === this.playerBoard;
    const currentTurn = board.getCurrentTurn();
    
    console.log(`[STALL] ${botName} (board: ${isPlayerBoard ? 'player' : 'partner'}, turn: ${currentTurn}) evaluation: ${currentEval.isMate ? `mate ${currentEval.score}` : `${currentEval.score}cp`}${currentEval.isMate && Math.abs(currentEval.score) > LONG_MATE_THRESHOLD ? ' (treated as winning position)' : ''}`);
    
    // Score interpretation differs for mate vs centipawn:
    // MATE SCORES: mate +X = side to move mates in X, mate -X = side to move gets mated in X
    //   - Positive mate = good for us (we're mating)
    //   - Negative mate = bad for us (getting mated)
    //   - NO multiplier needed for mate scores
    // CENTIPAWN SCORES: UCI always from WHITE's perspective
    //   - Positive = good for WHITE, Negative = good for BLACK
    //   - If WHITE to move: flip (multiply by -1) so winning is negative
    //   - If BLACK to move: keep (multiply by 1) so winning is negative
    const scoreMultiplier = currentIsMate ? 1 : (currentTurn === 'w' ? -1 : 1);
    const adjustedScore = currentScore * scoreMultiplier;
    
    // If already delivering mate (positive mate score <= 5 moves), don't stall
    if (currentIsMate && adjustedScore > 0) {
      console.log(`[STALL] ${botName} is mating in ${Math.abs(adjustedScore)}, no stalling needed`);
      return null;
    }
    
    // Check for mate-in-1 with no escape (negative mate score means getting mated)
    if (currentIsMate && adjustedScore === -1) {
      console.log(`[STALL] ${botName} is getting mated in 1, checking if any piece saves...`);
      // Test if any piece saves us
      const piecesToTry: PieceType[] = ['p', 'n', 'b', 'r', 'q'];
      let canBeSaved = false;
      
      for (const pieceType of piecesToTry) {
        const hypotheticalPiece = turn === 'w' ? pieceType.toUpperCase() : pieceType;
        const hypotheticalHoldings = currentHoldings + hypotheticalPiece;
        const fenWithHypothetical = `${baseFen.split(' ')[0]}[${hypotheticalHoldings}] ${baseFen.split(' ').slice(1).join(' ')}`;
        
        await engine.setPosition(fenWithHypothetical, []);
        const hypotheticalEval = await engine.getEvaluation(EVAL_DEPTH);
        
        // Convert long mates to centipawn
        let hypIsMate = hypotheticalEval.isMate;
        let hypScore = hypotheticalEval.score;
        if (hypotheticalEval.isMate && Math.abs(hypotheticalEval.score) > LONG_MATE_THRESHOLD) {
          hypIsMate = false;
          hypScore = hypotheticalEval.score > 0 ? LONG_MATE_CP_VALUE : -LONG_MATE_CP_VALUE;
        }
        
        const hypotheticalMultiplier = hypIsMate ? 1 : (currentTurn === 'w' ? -1 : 1);
        const hypotheticalAdjusted = hypScore * hypotheticalMultiplier;
        
        // Check if adding this piece either removes mate or flips it to us mating (positive adjusted)
        if (!hypIsMate || hypotheticalAdjusted > 0) {
          canBeSaved = true;
          console.log(`[STALL] ${botName} CAN be saved by ${pieceType}`);
          break;
        }
      }
      
      if (!canBeSaved) {
        console.log(`[STALL] ${botName} CANNOT be saved - true mate in 1`);
        // Mated in 1, no escape - stall 100% if up on time
        return { piece: 'q', scenario: 'mated', shouldStall: upOnTime };
      }
    }
    
    const piecesToTry: PieceType[] = ['p', 'n', 'b', 'r', 'q'];
    
    for (const pieceType of piecesToTry) {
      const hypotheticalPiece = turn === 'w' ? pieceType.toUpperCase() : pieceType;
      const hypotheticalHoldings = currentHoldings + hypotheticalPiece;
      const fenWithHypothetical = `${baseFen.split(' ')[0]}[${hypotheticalHoldings}] ${baseFen.split(' ').slice(1).join(' ')}`;
      
      await engine.setPosition(fenWithHypothetical, []);
      const hypotheticalEval = await engine.getEvaluation(EVAL_DEPTH);
      
      // Convert long mates to centipawn values
      let hypIsMate = hypotheticalEval.isMate;
      let hypScore = hypotheticalEval.score;
      if (hypotheticalEval.isMate && Math.abs(hypotheticalEval.score) > LONG_MATE_THRESHOLD) {
        hypIsMate = false;
        hypScore = hypotheticalEval.score > 0 ? LONG_MATE_CP_VALUE : -LONG_MATE_CP_VALUE;
      }
      
      // Apply correct multiplier for hypothetical evaluation
      // Mate scores: no multiplier (positive = mating)
      // Centipawn scores: apply turn-based multiplier
      const hypotheticalMultiplier = hypIsMate ? 1 : (currentTurn === 'w' ? -1 : 1);
      const hypotheticalAdjusted = hypScore * hypotheticalMultiplier;
      
      console.log(`[STALL] ${botName} testing ${pieceType}: ${hypotheticalEval.isMate ? `mate ${hypotheticalEval.score}` : `${hypotheticalEval.score}cp`} (raw: ${hypotheticalEval.isMate ? `mate ${hypotheticalEval.score}` : `${hypotheticalEval.score}cp`})${hypotheticalEval.isMate && Math.abs(hypotheticalEval.score) > LONG_MATE_THRESHOLD ? ' [treated as +' + LONG_MATE_CP_VALUE + 'cp]' : ''}`);
      
      // Scenario 1: Forces mate (current NOT mating, with piece IS mating with positive mate score <= 5)
      const forcesMate = !currentIsMate && hypIsMate && hypotheticalAdjusted > 0;
      if (forcesMate) {
        console.log(`[STALL] ${botName} with ${pieceType} FORCES mate in ${Math.abs(hypotheticalAdjusted)}`);
        const stallChance = this.getStallProbability(pieceType, 'forces_mate');
        const shouldStall = upOnTime && Math.random() < stallChance;
        return { piece: pieceType, scenario: 'forces_mate', shouldStall, mateDistance: Math.abs(hypotheticalAdjusted) };
      }
      
      // Scenario 2: Saves from mate (current getting mated with negative mate score, with piece either not mate or mating with positive mate score)
      const savesFromMate = currentIsMate && adjustedScore < 0 && 
                           (!hypIsMate || hypotheticalAdjusted > 0);
      if (savesFromMate) {
        console.log(`[STALL] ${botName} with ${pieceType} SAVES from mate ${adjustedScore} -> ${hypIsMate ? `mate ${hypotheticalAdjusted}` : `${hypotheticalAdjusted}cp`}`);
        const isMateInOne = adjustedScore === -1;
        const stallChance = isMateInOne ? 1.0 : this.getStallProbability(pieceType, 'saves_from_mate');
        const shouldStall = upOnTime && Math.random() < stallChance;
        return { piece: pieceType, scenario: isMateInOne ? 'saves_mate_in_1' : 'saves_from_mate', shouldStall, mateDistance: Math.abs(adjustedScore) };
      }
      
      // Scenario 3: Turns lost to winning (only for p, n, b)
      // Use adjusted scores for centipawn evaluation too
      if (['p', 'n', 'b'].includes(pieceType)) {
        const currentCpAdjusted = currentIsMate ? 0 : adjustedScore;
        const hypotheticalCpAdjusted = hypIsMate ? 0 : hypotheticalAdjusted;
        
        const turnsLostToWinning = !currentEval.isMate && currentCpAdjusted > LOSING_THRESHOLD &&
                                   !hypotheticalEval.isMate && hypotheticalCpAdjusted < -WINNING_THRESHOLD;
        if (turnsLostToWinning) {
          console.log(`[STALL] ${botName} with ${pieceType} turns LOST (${currentCpAdjusted}cp) to WINNING (${hypotheticalCpAdjusted}cp)`);
          const stallChance = this.getStallProbability(pieceType, 'lost_to_winning');
          const shouldStall = upOnTime && Math.random() < stallChance;
          return { piece: pieceType, scenario: 'lost_to_winning', shouldStall };
        }
      }
    }
    
    console.log(`[STALL] ${botName} found no stalling scenario`);
    
    return null;
  }
  
  /**
   * Get stall probability based on piece type and scenario
   */
  private getStallProbability(piece: PieceType, scenario: string): number {
    const probabilities: Record<PieceType, Record<string, number>> = {
      'p': { forces_mate: 0.95, saves_from_mate: 0.90, lost_to_winning: 0.60 },
      'n': { forces_mate: 0.75, saves_from_mate: 0.70, lost_to_winning: 0.50 },
      'b': { forces_mate: 0.75, saves_from_mate: 0.70, lost_to_winning: 0.50 },
      'r': { forces_mate: 0.50, saves_from_mate: 0.33, lost_to_winning: 0.0 },
      'q': { forces_mate: 0.50, saves_from_mate: 0.25, lost_to_winning: 0.0 },
    };
    
    return probabilities[piece]?.[scenario] || 0;
  }
  
  /**
   * Get bot's time and diagonal player's time
   */
  private getBotAndDiagonalTimes(
    botName: 'Bot 1' | 'Partner' | 'Bot 2',
    times: { playerWhite: number; playerBlack: number; partnerWhite: number; partnerBlack: number }
  ): { botTime: number; diagonalTime: number } {
    // Player is white on player board, Partner is black on partner board
    // Bot 1 is black on player board, Bot 2 is white on partner board
    
    if (botName === 'Bot 1') {
      // Bot 1 plays black on player board, diagonal is Partner (black on partner board)
      return { botTime: times.playerBlack, diagonalTime: times.partnerBlack };
    } else if (botName === 'Partner') {
      // Partner plays black on partner board, diagonal is Bot 1 (black on player board)
      return { botTime: times.partnerBlack, diagonalTime: times.playerBlack };
    } else {
      // Bot 2 plays white on partner board, diagonal is Player (white on player board)
      return { botTime: times.partnerWhite, diagonalTime: times.playerWhite };
    }
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
   * Identify which bot is making a move
   */
  private identifyBot(board: Board, engine: IChessEngine): 'Bot 1' | 'Partner' | 'Bot 2' {
    if (board === this.playerBoard) {
      // Player board - engine is Bot 1 (player's opponent)
      return 'Bot 1';
    } else {
      // Partner board - determine which bot based on engine reference
      // partner1 is used on even moves (WHITE), so partner1 = Bot 2 (WHITE)
      // partner2 is used on odd moves (BLACK), so partner2 = Partner (BLACK)
      if (engine === this.engines.partner1) {
        return 'Bot 2';
      } else {
        return 'Partner';
      }
    }
  }
  
  /**
   * Convert bot name to stalling state key
   */
  private botNameToKey(botName: 'Bot 1' | 'Partner' | 'Bot 2'): 'bot1' | 'partner' | 'bot2' {
    if (botName === 'Bot 1') return 'bot1';
    if (botName === 'Partner') return 'partner';
    return 'bot2';
  }
  
  /**
   * Convert stalling state key to bot name
   */
  private botKeyToName(botKey: 'bot1' | 'partner' | 'bot2'): 'Bot 1' | 'Partner' | 'Bot 2' {
    if (botKey === 'bot1') return 'Bot 1';
    if (botKey === 'partner') return 'Partner';
    return 'Bot 2';
  }
  
  /**
   * Check if a captured piece fulfills the stalling request
   * Some pieces can substitute for others in bughouse tactics:
   * - Pawn request: fulfilled by p, b, or q (all can deliver similar attacks)
   * - Knight request: only fulfilled by n (unique movement)
   * - Bishop request: fulfilled by b or q (diagonal control)
   * - Rook request: fulfilled by r or q (file/rank control)
   * - Queen request: only fulfilled by q (most powerful)
   */
  private piecesFulfillRequest(requestedPiece: PieceType, capturedPiece: PieceType): boolean {
    if (requestedPiece === capturedPiece) return true; // Exact match always works
    
    switch (requestedPiece) {
      case 'p':
        return capturedPiece === 'b' || capturedPiece === 'q';
      case 'n':
        return false; // Only knight satisfies knight request
      case 'b':
        return capturedPiece === 'q'; // Queen can substitute for bishop
      case 'r':
        return capturedPiece === 'q'; // Queen can substitute for rook
      case 'q':
        return false; // Only queen satisfies queen request
      default:
        return false;
    }
  }
  
  /**
   * Check if bots should stop stalling due to time disadvantage
   * Returns array of bots that stopped stalling and need to move now
   */
  private checkTimeBasedStallAbandonment(): Array<{ botName: 'Bot 1' | 'Partner' | 'Bot 2', board: Board, engine: IChessEngine }> {
    const times = this.getClockTimes?.();
    if (!times) return [];
    
    const botsToResume: Array<{ botName: 'Bot 1' | 'Partner' | 'Bot 2', board: Board, engine: IChessEngine }> = [];
    const botKeys: Array<'bot1' | 'partner' | 'bot2'> = ['bot1', 'partner', 'bot2'];
    
    for (const botKey of botKeys) {
      if (this.stallingState[botKey]) {
        // Skip player-induced stalls - they can only be exited by player command
        if (this.stallingState[botKey]!.playerInduced) {
          continue;
        }
        
        const botName = this.botKeyToName(botKey);
        const { botTime, diagonalTime } = this.getBotAndDiagonalTimes(botName, times);
        
        // If bot is now down on time, stop stalling
        if (botTime <= diagonalTime) {
          console.log(`[STALL] ${botName} now down on time - abandoning stall and resuming play`);
          
          if (this.onChatMessage) {
            this.onChatMessage(botName, 'I go.');
          }
          
          // Determine which board and engine this bot uses
          let board: Board;
          let engine: IChessEngine;
          
          if (botName === 'Bot 1') {
            board = this.playerBoard;
            engine = this.engines.player;
          } else if (botName === 'Bot 2') {
            // Bot 2 plays WHITE on partner board (partner1 engine)
            board = this.partnerBoard;
            engine = this.engines.partner1;
          } else {
            // Partner plays BLACK on partner board (partner2 engine)
            board = this.partnerBoard;
            engine = this.engines.partner2;
          }
          
          // Check if it's actually this bot's turn
          const currentTurn = board.getCurrentTurn();
          const botPlaysThisTurn = (botName === 'Bot 1' && currentTurn === 'b') ||
                                   (botName === 'Partner' && currentTurn === 'b') ||
                                   (botName === 'Bot 2' && currentTurn === 'w');
          
          delete this.stallingState[botKey];
          
          // Only add to resume list if it's their turn
          if (botPlaysThisTurn) {
            botsToResume.push({ botName, board, engine });
          }
        }
      }
    }
    
    return botsToResume;
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

      // Identify which bot is making the move
      const botName = this.identifyBot(board, engine);
      const botKey = this.botNameToKey(botName);
      
      console.log(`[MOVE] ${botName} thinking...`);
      
      // Check if bot is already in stalling state
      if (this.stallingState[botKey]) {
        console.log(`[STALL] ${botName} is ALREADY stalling for ${this.stallingState[botKey]!.piece} - NOT MOVING`);
        // Stalling means NOT MOVING - just return and let the clock run
        return;
      }
      
      // Check if this is Partner and was just forced to go - prevent immediate re-stall
      if (botName === 'Partner' && this.partnerForcedToGo) {
        console.log(`[STALL] Partner was forced to go - skipping stall check this turn`);
        this.partnerForcedToGo = false; // Reset flag after one move
        const move = await engine.getBestMove(this.thinkingTimeMs);
        await this.executeMoveOnBoard(board, engine, move);
        return;
      }
      
      // Check if we should stall for a piece
      const stallResult = await this.shouldStallForPiece(board, engine, botName);
      
      // IMPORTANT: Reset engine to ACTUAL position after testing hypothetical pieces
      await engine.setPosition(fenWithHoldings, []);
      
      if (stallResult) {
        const { piece, scenario, shouldStall, mateDistance } = stallResult;
        
        console.log(`[STALL RESULT] ${botName}: piece=${piece}, scenario=${scenario}, shouldStall=${shouldStall}`);
        
        // Handle mated scenario
        if (scenario === 'mated') {
          console.log(`[STALL] ${botName} scenario is 'mated' - getting mated in 1 with no escape`);
          if (this.onChatMessage) {
            this.onChatMessage(botName, 'I am mated');
          }
          if (shouldStall) {
            console.log(`[STALL] ${botName} STARTS stalling for ${piece} - NOT MOVING`);
            this.stallingState[this.botNameToKey(botName)] = { piece, reason: scenario };
            // Stalling means NOT MOVING - just return and let the clock run
            return;
          } else {
            // Not stalling (down on time) - just play the move
            const move = await engine.getBestMove(this.thinkingTimeMs);
            const fulfilledBots = await this.executeMoveOnBoard(board, engine, move);
            // Bots with fulfilled requests will move on their next turn (stalling state cleared)
            return;
          }
        }
        
        // Generate scenario-specific message
        let requestMessage = '';
        if (scenario === 'forces_mate') {
          requestMessage = `${piece.toUpperCase()} mates in ${mateDistance}.`;
        } else if (scenario === 'saves_mate_in_1' || scenario === 'saves_from_mate') {
          requestMessage = `${piece.toUpperCase()} helps me survive`;
        } else if (scenario === 'lost_to_winning') {
          requestMessage = `${piece.toUpperCase()} saves my position`;
        }
        
        // Determine if we should stall based on time and probability
        if (shouldStall) {
          // We're stalling - send scenario-specific message
          console.log(`[STALL] ${botName} STARTS stalling for ${piece} - NOT MOVING`);
          this.stallingState[this.botNameToKey(botName)] = { piece, reason: scenario };
          
          // Reset down time message flag since we're back to stalling (up on time)
          this.downTimeMessageSent[this.botNameToKey(botName)] = false;
          
          if (this.onChatMessage) {
            this.onChatMessage(botName, requestMessage);
          }
          
          // Stalling means NOT MOVING - just return and let the clock run
          return;
        } else {
          // Not stalling - send appropriate message
          const times = this.getClockTimes?.();
          const upOnTime = times ? this.getBotAndDiagonalTimes(botName, times).botTime > this.getBotAndDiagonalTimes(botName, times).diagonalTime : false;
          
          if (this.onChatMessage) {
            if (upOnTime) {
              // Up on time but probability roll failed
              // Reset down time flag since we're up on time
              this.downTimeMessageSent[this.botNameToKey(botName)] = false;
              
              this.onChatMessage(botName, requestMessage);
              setTimeout(() => {
                if (this.onChatMessage) {
                  this.onChatMessage(botName, `Actually, I'll go for now. Not worth sitting.`);
                }
              }, 1500);
            } else {
              // Not up on time - only send message if we haven't already
              const botKey = this.botNameToKey(botName);
              if (!this.downTimeMessageSent[botKey]) {
                this.onChatMessage(botName, requestMessage);
                setTimeout(() => {
                  if (this.onChatMessage) {
                    this.onChatMessage(botName, `nvm we are down time. I go.`);
                  }
                }, 1500);
                // Mark that we've sent the down time message
                this.downTimeMessageSent[botKey] = true;
              }
              // If already sent, don't send any message
            }
          }
        }
      }

      // No stalling needed - get and play best move
      const move = await engine.getBestMove(this.thinkingTimeMs);
      
      const fulfilledBots = await this.executeMoveOnBoard(board, engine, move);
      
      // Bots with fulfilled requests will move on their next turn (stalling state cleared)
      // No need to immediately resume - just let them move naturally
    } catch (error) {
      console.error('Engine move failed:', error);
    }
  }

  /**
   * Execute a move on the board (extracted for reuse in stalling logic)
   * Returns array of bots whose stalling was fulfilled and should move now
   */
  private async executeMoveOnBoard(board: Board, engine: IChessEngine, move: any): Promise<Array<{ botName: 'Bot 1' | 'Partner' | 'Bot 2', board: Board, engine: IChessEngine }>> {
    const fulfilledBots: Array<{ botName: 'Bot 1' | 'Partner' | 'Bot 2', board: Board, engine: IChessEngine }> = [];
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
      
      // Check if this capture fulfills a stalling bot's request
      const capturedType = captured.toLowerCase() as PieceType;
      const capturingBotName = this.identifyBot(board, engine);
      
      // Check all bots to see if they were stalling for this piece (or equivalent)
      const botKeys: Array<'bot1' | 'partner' | 'bot2'> = ['bot1', 'partner', 'bot2'];
      for (const botKey of botKeys) {
        const requestedPiece = this.stallingState[botKey]?.piece;
        if (requestedPiece && this.piecesFulfillRequest(requestedPiece, capturedType)) {
          const stallingBotName = this.botKeyToName(botKey);
          
          // Only thank if the piece was captured by someone on the OTHER board
          // Bot 1 (player board) should thank Bot 2 or Partner (partner board)
          // Bot 2 or Partner (partner board) should thank Bot 1 (player board)
          const stallingOnPlayerBoard = stallingBotName === 'Bot 1';
          const capturedOnPlayerBoard = board === this.playerBoard;
          
          if (stallingOnPlayerBoard !== capturedOnPlayerBoard) {
            // Different boards - the capture helps!
            const fulfillmentMsg = capturedType === requestedPiece 
              ? `exact match ${capturedType}`
              : `${capturedType} fulfills ${requestedPiece} request`;
            console.log(`[STALL] ${stallingBotName} received ${fulfillmentMsg} from ${capturingBotName} - stall fulfilled!`);
            
            if (this.onChatMessage) {
              this.onChatMessage(stallingBotName, 'Thanks :)');
            }
            
            delete this.stallingState[botKey];
            
            // Determine which board and engine this bot uses
            let botBoard: Board;
            let botEngine: IChessEngine;
            
            if (stallingBotName === 'Bot 1') {
              botBoard = this.playerBoard;
              botEngine = this.engines.player;
            } else if (stallingBotName === 'Bot 2') {
              // Bot 2 plays WHITE on partner board (partner1 engine)
              botBoard = this.partnerBoard;
              botEngine = this.engines.partner1;
            } else {
              // Partner plays BLACK on partner board (partner2 engine)
              botBoard = this.partnerBoard;
              botEngine = this.engines.partner2;
            }
            
            // Check if it's actually this bot's turn
            const currentTurn = botBoard.getCurrentTurn();
            const botPlaysThisTurn = (stallingBotName === 'Bot 1' && currentTurn === 'b') ||
                                     (stallingBotName === 'Partner' && currentTurn === 'b') ||
                                     (stallingBotName === 'Bot 2' && currentTurn === 'w');
            
            // Only add to fulfilled list if it's their turn
            if (botPlaysThisTurn) {
              fulfilledBots.push({ botName: stallingBotName, board: botBoard, engine: botEngine });
            }
          } else {
            // Same board - bot captured it themselves, don't thank
            console.log(`[STALL] ${stallingBotName} captured ${capturedType} themselves on same board - ignoring`);
          }
        }
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
    
    return fulfilledBots;
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
        
        // Check if any bot should abandon stalling due to time and resume
        const botsToResume = this.checkTimeBasedStallAbandonment();
        for (const { botName, board, engine } of botsToResume) {
          console.log(`[STALL] ${botName} resuming immediately after time abandonment`);
          // Set position before getting move
          await engine.setPosition(board.getFen(), []);
          // Directly make a move without re-evaluating stalling logic
          const move = await engine.getBestMove(this.thinkingTimeMs);
          await this.executeMoveOnBoard(board, engine, move);
        }
        
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
