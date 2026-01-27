import { PiecePool } from './PiecePool';
import type { PieceType } from './PiecePool';
import { Chess } from 'chess.js';

/**
 * Chess Board State
 * 
 * Represents a single chess board in the bughouse game.
 * Manages position, move history, and piece pool for drops.
 */

export interface Move {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  drop?: PieceType;
  san?: string; // Standard Algebraic Notation
  fen?: string; // FEN after this move
}

export type BoardSide = 'player' | 'partner';

export class Board {
  private fen: string;
  private moveHistory: Move[] = [];
  private whitePiecePool: PiecePool;  // Pieces available to white
  private blackPiecePool: PiecePool;  // Pieces available to black
  private side: BoardSide;
  private playerColor: 'w' | 'b';
  private chess: Chess;

  constructor(side: BoardSide, playerColor: 'w' | 'b', startFen?: string) {
    this.side = side;
    this.playerColor = playerColor;
    this.fen = startFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.whitePiecePool = new PiecePool();
    this.blackPiecePool = new PiecePool();
    this.chess = new Chess(this.fen);
  }

  /**
   * Get the current FEN position
   */
  getFen(): string {
    return this.fen;
  }

  /**
   * Set the board position from FEN
   */
  setFen(fen: string): void {
    this.fen = fen;
    this.chess.load(fen);
  }

  /**
   * Get the player's color for this board
   */
  getPlayerColor(): 'w' | 'b' {
    return this.playerColor;
  }

  /**
   * Get which side this board belongs to (player or partner)
   */
  getSide(): BoardSide {
    return this.side;
  }

  /**
   * Add a move to the history
   */
  addMove(move: Move): void {
    // Make the move on the chess.js board to update FEN
    try {
      const moveNotation = move.drop 
        ? `${move.drop.toUpperCase()}@${move.to}`  // Drop notation
        : `${move.from}${move.to}${move.promotion || ''}`; // Normal move
      
      if (this.side === 'player') {
        console.log(`[${this.side}] Adding move:`, moveNotation);
      }
      
      if (move.drop) {
        // For drops, manually update the FEN by placing the piece
        const piece = this.playerColor === 'w' ? move.drop.toUpperCase() : move.drop.toLowerCase();
        this.fen = this.placePieceOnFEN(this.fen, move.to, piece);
        if (this.side === 'player') {
          console.log(`[${this.side}] Dropped piece, new FEN:`, this.fen);
        }
        // Also update chess.js instance
        this.chess.load(this.fen);
      } else {
        // Normal chess move
        const result = this.chess.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion as any,
        });
        this.fen = this.chess.fen();
        if (this.side === 'player') {
          console.log(`[${this.side}] New FEN:`, this.fen);
        }
      }
    } catch (error) {
      console.error('Failed to make move:', move, error);
    }
    
    this.moveHistory.push(move);
    
    // Note: In bughouse, captured pieces are added to the partner board's pool
    // This is handled by BughouseGame.updatePiecePools(), not here
  }

  /**
   * Get the move history
   */
  getMoveHistory(): Move[] {
    return [...this.moveHistory];
  }

  /**
   * Get the last move
   */
  getLastMove(): Move | null {
    return this.moveHistory.length > 0 
      ? this.moveHistory[this.moveHistory.length - 1] 
      : null;
  }

  /**
   * Get the piece pool for the specified color
   * @param color - 'w' for white pool, 'b' for black pool. Defaults to player color.
   */
  getPiecePool(color?: 'w' | 'b'): PiecePool {
    const poolColor = color || this.playerColor;
    return poolColor === 'w' ? this.whitePiecePool : this.blackPiecePool;
  }

  /**
   * Get the white piece pool
   */
  getWhitePiecePool(): PiecePool {
    return this.whitePiecePool;
  }

  /**
   * Get the black piece pool
   */
  getBlackPiecePool(): PiecePool {
    return this.blackPiecePool;
  }

  /**
   * Make a drop move (place a piece from the pool onto the board)
   * @returns true if the drop was successful
   */
  dropPiece(pieceType: PieceType, _square: string): boolean {
    return this.piecePool.removePiece(pieceType);
  }

  /**
   * Reset the board to starting position
   */
  reset(): void {
    this.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.moveHistory = [];
    this.piecePool.reset();
  }

  /**
   * Get the current turn ('w' or 'b')
   */
  getCurrentTurn(): 'w' | 'b' {
    const parts = this.fen.split(' ');
    return parts[1] as 'w' | 'b';
  }

  /**
   * Check if it's the player's turn on this board
   */
  isPlayerTurn(): boolean {
    return this.getCurrentTurn() === this.playerColor;
  }

  /**
   * Clone this board
   */
  clone(): Board {
    const newBoard = new Board(this.side, this.playerColor, this.fen);
    newBoard.moveHistory = [...this.moveHistory];
    newBoard.piecePool = this.piecePool.clone();
    return newBoard;
  }

  /**
   * Helper to place a piece on a square in the FEN string
   */
  private placePieceOnFEN(fen: string, square: string, piece: string): string {
    const parts = fen.split(' ');
    const position = parts[0];
    
    // Convert square to indices
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
    const rank = 8 - parseInt(square[1]); // 0-7 from top
    
    const ranks = position.split('/');
    let newRank = '';
    let currentFile = 0;
    
    for (const char of ranks[rank]) {
      if (char >= '1' && char <= '8') {
        const emptyCount = parseInt(char);
        // Check if our target square is in this empty run
        if (currentFile <= file && file < currentFile + emptyCount) {
          // Split the empty run
          const before = file - currentFile;
          const after = emptyCount - before - 1;
          if (before > 0) newRank += before.toString();
          newRank += piece;
          if (after > 0) newRank += after.toString();
          currentFile += emptyCount;
        } else {
          newRank += char;
          currentFile += emptyCount;
        }
      } else {
        // Existing piece
        if (currentFile === file) {
          // Replace this piece with our dropped piece
          newRank += piece;
        } else {
          newRank += char;
        }
        currentFile++;
      }
    }
    
    ranks[rank] = newRank;
    parts[0] = ranks.join('/');
    
    // Toggle turn
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    
    return parts.join(' ');
  }
}
