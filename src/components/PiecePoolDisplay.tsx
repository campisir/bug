import type { PieceType } from '../game/PiecePool';
import { useMemo } from 'react';

interface PiecePoolDisplayProps {
  pieces: Map<PieceType, number> | Record<PieceType, number>;
  color: 'white' | 'black';
  onDrop?: (pieceType: PieceType) => void;
}

/**
 * PiecePoolDisplay Component
 * 
 * Displays captured pieces available for dropping.
 * In bughouse, pieces captured by your partner become available to you.
 */
export function PiecePoolDisplay({ pieces, color, onDrop }: PiecePoolDisplayProps) {
  const pieceOrder: PieceType[] = ['q', 'r', 'b', 'n', 'p'];

  // Memoize piece counts to ensure fresh computation
  const pieceCounts = useMemo(() => {
    const counts: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    if (pieces instanceof Map) {
      pieces.forEach((count, type) => {
        counts[type] = count;
      });
    } else {
      Object.assign(counts, pieces);
    }
    return counts;
  }, [pieces]);

  const totalPieces = Object.values(pieceCounts).reduce((sum, count) => sum + count, 0);
  
  // Helper to get piece count
  const getCount = (pieceType: PieceType): number => {
    return pieceCounts[pieceType];
  };

  const handleDragStart = (e: React.DragEvent, pieceType: PieceType) => {
    e.dataTransfer.setData('piece', pieceType);
    e.dataTransfer.effectAllowed = 'move';
  };

  const getPieceSymbol = (type: PieceType): string => {
    const symbols = {
      white: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' },
      black: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' },
    };
    return symbols[color][type];
  };

  return (
    <div className="piece-pool">
      <div className="piece-pool-header">
        <h3>Available Pieces</h3>
        <span className="piece-count">({totalPieces})</span>
      </div>
      
      <div className="piece-pool-content">
        {pieceOrder.map((pieceType) => {
          const count = getCount(pieceType);
          
          return (
            <div
              key={pieceType}
              className={`piece-item ${count === 0 ? 'empty' : ''}`}
              draggable={count > 0}
              onDragStart={(e) => handleDragStart(e, pieceType)}
              onClick={() => count > 0 && onDrop?.(pieceType)}
            >
              <span className="piece-symbol">{getPieceSymbol(pieceType)}</span>
              <span className="piece-count-badge">{count}</span>
            </div>
          );
        })}
      </div>

      <style>{`
        .piece-pool {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 12px;
          min-width: 200px;
        }

        .piece-pool-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 2px solid #ddd;
        }

        .piece-pool-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .piece-pool-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .piece-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px;
          background: white;
          border-radius: 6px;
          border: 2px solid #ddd;
          cursor: pointer;
          transition: all 0.2s;
        }

        .piece-item:not(.empty):hover {
          border-color: #4CAF50;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .piece-item.empty {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .piece-symbol {
          font-size: 32px;
          line-height: 1;
        }

        .piece-count-badge {
          background: #4CAF50;
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: bold;
          min-width: 24px;
          text-align: center;
        }

        .piece-item.empty .piece-count-badge {
          background: #ccc;
        }
      `}</style>
    </div>
  );
}
