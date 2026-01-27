import type { PieceType } from '../game/PiecePool';
import { useMemo } from 'react';

interface PiecePoolDisplayProps {
  whitePieces: Map<PieceType, number> | Record<PieceType, number>;
  blackPieces: Map<PieceType, number> | Record<PieceType, number>;
  onPieceClick?: (pieceType: PieceType) => void;
  selectedPiece?: PieceType | null;
}

/**
 * PiecePoolDisplay Component
 * 
 * Displays captured pieces available for dropping.
 * In bughouse, pieces captured by your partner become available to you.
 * Shows both white and black pieces in a compact layout.
 */
export function PiecePoolDisplay({ whitePieces, blackPieces, onPieceClick, selectedPiece }: PiecePoolDisplayProps) {
  const pieceOrder: PieceType[] = ['q', 'r', 'b', 'n', 'p'];

  // Memoize piece counts to ensure fresh computation
  const whiteCounts = useMemo(() => {
    const counts: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    if (whitePieces instanceof Map) {
      whitePieces.forEach((count, type) => {
        counts[type] = count;
      });
    } else {
      Object.assign(counts, whitePieces);
    }
    return counts;
  }, [whitePieces]);

  const blackCounts = useMemo(() => {
    const counts: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    if (blackPieces instanceof Map) {
      blackPieces.forEach((count, type) => {
        counts[type] = count;
      });
    } else {
      Object.assign(counts, blackPieces);
    }
    return counts;
  }, [blackPieces]);

  const getPieceSymbol = (type: PieceType, color: 'white' | 'black'): string => {
    const symbols = {
      white: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' },
      black: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' },
    };
    return symbols[color][type];
  };

  return (
    <div className="piece-pool">
      <div className="piece-pool-content">
        {pieceOrder.map((pieceType) => {
          const whiteCount = whiteCounts[pieceType];
          const blackCount = blackCounts[pieceType];
          
          return (
            <div key={pieceType} className="piece-row">
              <div
                className={`piece-item ${whiteCount === 0 ? 'empty' : ''} ${selectedPiece === pieceType ? 'selected' : ''}`}
                onClick={() => {
                  if (whiteCount > 0) {
                    onPieceClick?.(pieceType);
                  }
                }}
              >
                <span className="piece-symbol">{getPieceSymbol(pieceType, 'white')}</span>
                <span className="piece-count-badge">{whiteCount}</span>
              </div>
              <div
                className={`piece-item ${blackCount === 0 ? 'empty' : ''}`}
              >
                <span className="piece-symbol">{getPieceSymbol(pieceType, 'black')}</span>
                <span className="piece-count-badge">{blackCount}</span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .piece-pool {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 16px 12px;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-around;
        }

        .piece-pool-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
          height: 100%;
          justify-content: space-evenly;
        }

        .piece-row {
          display: flex;
          gap: 8px;
          flex: 1;
        }

        .piece-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 12px 8px;
          background: white;
          border-radius: 6px;
          border: 2px solid #ddd;
          cursor: pointer;
          transition: all 0.2s;
        }

        .piece-item:not(.empty):hover {
          border-color: #4CAF50;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }

        .piece-item.selected {
          border-color: #4CAF50;
          background: #e8f5e9;
          box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
        }

        .piece-item.empty {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .piece-symbol {
          font-size: 42px;
          line-height: 1;
        }

        .piece-count-badge {
          background: #4CAF50;
          color: white;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: bold;
          min-width: 28px;
          text-align: center;
        }

        .piece-item.empty .piece-count-badge {
          background: #ccc;
        }
      `}</style>
    </div>
  );
}
