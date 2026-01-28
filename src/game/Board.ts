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
  dropColor?: 'w' | 'b'; // Color of the dropped piece
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
      
      if (move.drop) {
        // For drops, manually update the FEN by placing the piece
        // Use dropColor to preserve the actual color of the dropped piece
        const piece = move.dropColor === 'w' ? move.drop.toUpperCase() : move.drop.toLowerCase();
        this.fen = this.placePieceOnFEN(this.fen, move.to, piece);
        // Reset chess.js to the new FEN so subsequent moves work correctly
        this.chess.load(this.fen);
      } else {
        // For normal moves, try chess.js first, but if it fails (bughouse position), update manually
        try {
          const result = this.chess.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion as any,
          });
          this.fen = this.chess.fen();
        } catch (chessJsError) {
          // chess.js can't handle the position (likely due to bughouse drops)
          // Update FEN manually
          this.fen = this.makeManualMove(this.fen, move.from, move.to, move.captured, move.promotion);
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
   * Check if the game is over (checkmate or stalemate)
   */
  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  /**
   * Check if the current position is checkmate
   */
  isCheckmate(): boolean {
    return this.chess.isCheckmate();
  }

  /**
   * Check if the current position is stalemate
   */
  isStalemate(): boolean {
    return this.chess.isStalemate();
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

  /**
   * Manually make a move by updating FEN (for bughouse positions that chess.js can't handle)
   */
  private makeManualMove(fen: string, from: string, to: string, captured?: string, promotion?: string): string {
    if (this.side === 'partner') {
      console.log(`[PARTNER MANUAL] Making move ${from} to ${to}, FEN before:`, fen);
    }
    
    const parts = fen.split(' ');
    const position = parts[0];
    
    // Parse from and to squares
    const fromFile = from.charCodeAt(0) - 'a'.charCodeAt(0);
    const fromRank = 8 - parseInt(from[1]);
    const toFile = to.charCodeAt(0) - 'a'.charCodeAt(0);
    const toRank = 8 - parseInt(to[1]);
    
    const ranks = position.split('/');
    
    // Get the piece at 'from' square
    let movingPiece = '';
    let newFromRank = '';
    let currentFile = 0;
    
    for (const char of ranks[fromRank]) {
      if (char >= '1' && char <= '8') {
        const emptyCount = parseInt(char);
        if (currentFile <= fromFile && fromFile < currentFile + emptyCount) {
          // From square is empty - should not happen
          const before = fromFile - currentFile;
          const after = emptyCount - before - 1;
          if (before > 0) newFromRank += before.toString();
          newFromRank += '1';
          if (after > 0) newFromRank += after.toString();
          currentFile += emptyCount;
        } else {
          newFromRank += char;
          currentFile += emptyCount;
        }
      } else {
        if (currentFile === fromFile) {
          movingPiece = char;
          newFromRank += '1'; // Empty square
        } else {
          newFromRank += char;
        }
        currentFile++;
      }
    }
    
    // Apply promotion if specified
    if (promotion) {
      const turn = parts[1];
      movingPiece = turn === 'w' ? promotion.toUpperCase() : promotion.toLowerCase();
    }
    
    // Consolidate empty squares in from rank
    newFromRank = this.consolidateEmptySquares(newFromRank);
    ranks[fromRank] = newFromRank;
    
    // Place piece at 'to' square (same logic as placePieceOnFEN but for specific rank)
    let newToRank = '';
    currentFile = 0;
    
    for (const char of ranks[toRank]) {
      if (char >= '1' && char <= '8') {
        const emptyCount = parseInt(char);
        if (currentFile <= toFile && toFile < currentFile + emptyCount) {
          const before = toFile - currentFile;
          const after = emptyCount - before - 1;
          if (before > 0) newToRank += before.toString();
          newToRank += movingPiece;
          if (after > 0) newToRank += after.toString();
          currentFile += emptyCount;
        } else {
          newToRank += char;
          currentFile += emptyCount;
        }
      } else {
        if (currentFile === toFile) {
          newToRank += movingPiece; // Replace piece
        } else {
          newToRank += char;
        }
        currentFile++;
      }
    }
    
    ranks[toRank] = newToRank;
    
    // Consolidate empty squares in to rank as well
    ranks[toRank] = this.consolidateEmptySquares(ranks[toRank]);
    
    parts[0] = ranks.join('/');
    
    // Toggle turn
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    
    // Clear en passant
    parts[3] = '-';
    
    // Update halfmove clock
    const halfmove = parseInt(parts[4]);
    parts[4] = (captured || promotion) ? '0' : (halfmove + 1).toString();
    
    // Update fullmove number
    if (parts[1] === 'w') {
      parts[5] = (parseInt(parts[5]) + 1).toString();
    }
    
    const result = parts.join(' ');
    if (this.side === 'partner') {
      console.log(`[PARTNER MANUAL] FEN after:`, result);
    }
    
    return result;
  }

  /**
   * Consolidate consecutive empty squares in a rank string
   */
  private consolidateEmptySquares(rank: string): string {
    let result = '';
    let emptyCount = 0;
    
    for (const char of rank) {
      if (char >= '1' && char <= '8') {
        emptyCount += parseInt(char);
      } else {
        if (emptyCount > 0) {
          result += emptyCount.toString();
          emptyCount = 0;
        }
        result += char;
      }
    }
    
    if (emptyCount > 0) {
      result += emptyCount.toString();
    }
    
    return result;
  }
}
