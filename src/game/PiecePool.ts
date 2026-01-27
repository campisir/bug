/**
 * Piece Pool
 * 
 * Manages captured pieces that can be dropped on the board.
 * In bughouse, when you capture a piece, it goes to your partner's pool.
 */

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q';
export type PieceColor = 'w' | 'b';

export interface CapturedPiece {
  type: PieceType;
  color: PieceColor;
}

export class PiecePool {
  private pieces: Map<PieceType, number> = new Map();

  constructor() {
    this.reset();
  }

  reset(): void {
    this.pieces.clear();
    this.pieces.set('p', 0);
    this.pieces.set('n', 0);
    this.pieces.set('b', 0);
    this.pieces.set('r', 0);
    this.pieces.set('q', 0);
  }

  /**
   * Add a captured piece to the pool
   */
  addPiece(type: PieceType): void {
    const current = this.pieces.get(type) || 0;
    this.pieces.set(type, current + 1);
  }

  /**
   * Remove a piece from the pool (when dropping it on the board)
   * @returns true if piece was available and removed, false otherwise
   */
  removePiece(type: PieceType): boolean {
    const current = this.pieces.get(type) || 0;
    if (current > 0) {
      this.pieces.set(type, current - 1);
      return true;
    }
    return false;
  }

  /**
   * Get the count of a specific piece type
   */
  getCount(type: PieceType): number {
    return this.pieces.get(type) || 0;
  }

  /**
   * Get all pieces in the pool
   */
  getAllPieces(): Map<PieceType, number> {
    return new Map(this.pieces);
  }

  /**
   * Check if the pool has any pieces
   */
  isEmpty(): boolean {
    return Array.from(this.pieces.values()).every(count => count === 0);
  }

  /**
   * Get total count of all pieces
   */
  getTotalCount(): number {
    return Array.from(this.pieces.values()).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Create a copy of this pool
   */
  clone(): PiecePool {
    const newPool = new PiecePool();
    this.pieces.forEach((count, type) => {
      newPool.pieces.set(type, count);
    });
    return newPool;
  }
}
