import type { PieceType } from '../game/PiecePool';
import { useMemo } from 'react';

interface PiecePoolDisplayProps {
  whitePieces: Map<PieceType, number> | Record<PieceType, number>;
  blackPieces: Map<PieceType, number> | Record<PieceType, number>;
  onPieceClick?: (pieceType: PieceType) => void;
  selectedPiece?: PieceType | null;
  compact?: boolean;
}

/**
 * PiecePoolDisplay Component
 * 
 * Displays captured pieces available for dropping.
 * In bughouse, pieces captured by your partner become available to you.
 * Shows both white and black pieces in a compact layout.
 */
export function PiecePoolDisplay({ whitePieces, blackPieces, onPieceClick, selectedPiece, compact = false }: PiecePoolDisplayProps) {
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
    <div className={`piece-pool${compact ? ' piece-pool-compact' : ''}`}>
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
              <div className={`piece-item ${blackCount === 0 ? 'empty' : ''}`}>
                <span className="piece-symbol">{getPieceSymbol(pieceType, 'black')}</span>
                <span className="piece-count-badge">{blackCount}</span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .piece-pool {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 10px 8px;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .piece-pool-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
          height: 100%;
          justify-content: space-evenly;
        }

        .piece-row {
          display: flex;
          gap: 6px;
          flex: 1;
        }

        .piece-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 4px;
          background: var(--surface-2);
          border-radius: var(--radius-sm);
          border: 1.5px solid var(--border-light);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
          min-height: 0;
        }

        .piece-item:not(.empty):hover {
          border-color: var(--gold);
          background: rgba(184,136,46,0.06);
          box-shadow: var(--shadow-sm);
        }

        .piece-item.selected {
          border-color: var(--gold);
          background: rgba(184,136,46,0.12);
          box-shadow: 0 0 0 2px rgba(184,136,46,0.25);
        }

        .piece-item.empty {
          opacity: 0.28;
          cursor: default;
        }

        .piece-symbol {
          font-size: clamp(20px, 2.2vw, 34px);
          line-height: 1;
          user-select: none;
        }

        .piece-count-badge {
          background: var(--navy);
          color: #fff;
          padding: 1px 6px;
          border-radius: 99px;
          font-size: 0.7rem;
          font-weight: 700;
          min-width: 20px;
          text-align: center;
        }

        .piece-item.empty .piece-count-badge {
          background: var(--border);
          color: var(--text-muted);
        }

        /* ── Compact mode (partner pool) ───────────────────── */
        .piece-pool-compact .piece-item {
          padding: 4px 2px;
          gap: 2px;
        }

        .piece-pool-compact .piece-symbol {
          font-size: clamp(14px, 1.5vw, 24px);
        }

        .piece-pool-compact .piece-count-badge {
          font-size: 0.62rem;
          padding: 1px 4px;
          min-width: 16px;
        }

        /* ── Horizontal mode (mobile) ────────────────────────── */
        @media (max-width: 860px) {
          .piece-pool {
            padding: 8px 10px;
            height: auto;
          }

          .piece-pool-content {
            flex-direction: row;
            justify-content: space-between;
            height: auto;
            gap: 6px;
          }

          .piece-row {
            flex-direction: column;
            flex: 1;
            gap: 5px;
          }

          .piece-item {
            padding: 5px 3px;
          }

          .piece-symbol {
            font-size: clamp(18px, 5vw, 26px);
          }
        }
      `}</style>
    </div>
  );
}
