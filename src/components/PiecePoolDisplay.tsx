import type { PieceType } from '../game/PiecePool';
import { useMemo } from 'react';

interface PiecePoolDisplayProps {
  whitePieces: Map<PieceType, number> | Record<PieceType, number>;
  blackPieces: Map<PieceType, number> | Record<PieceType, number>;
  onPieceClick?: (pieceType: PieceType) => void;
  selectedPiece?: PieceType | null;
  compact?: boolean;
  /** Current signal state per piece (player pool only) */
  signalledPieces?: Partial<Record<PieceType, 'soft' | 'urgent'>>;
  /** Called when a white piece is right-clicked; provides the next urgency in the cycle */
  onPieceSignal?: (pieceType: PieceType, urgency: 'soft' | 'urgent' | null) => void;
  /** Called when the "Clear Signals" button is clicked */
  onClearSignals?: () => void;
  /** Current avoid-signal state per piece (opponent pool, black pieces) */
  avoidSignalledPieces?: Partial<Record<PieceType, 'soft' | 'urgent'>>;
  /** Called when a black piece is right-clicked; provides the next urgency in the cycle */
  onPieceAvoidSignal?: (pieceType: PieceType, urgency: 'soft' | 'urgent' | null) => void;
  /** Called when the "Clear Avoid Signals" button is clicked */
  onClearAvoidSignals?: () => void;
}

/**
 * PiecePoolDisplay Component
 * 
 * Displays captured pieces available for dropping.
 * In bughouse, pieces captured by your partner become available to you.
 * Shows both white and black pieces in a compact layout.
 */
export function PiecePoolDisplay({ whitePieces, blackPieces, onPieceClick, selectedPiece, compact = false, signalledPieces, onPieceSignal, onClearSignals, avoidSignalledPieces, onPieceAvoidSignal, onClearAvoidSignals }: PiecePoolDisplayProps) {
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

  const handleRightClick = (pieceType: PieceType, e: React.MouseEvent) => {
    e.preventDefault();
    if (!onPieceSignal) return;
    const current = signalledPieces?.[pieceType] ?? null;
    // Cycle: none → soft → urgent → none
    const next: 'soft' | 'urgent' | null =
      current === null ? 'soft' : current === 'soft' ? 'urgent' : null;
    onPieceSignal(pieceType, next);
  };

  const handleBlackRightClick = (pieceType: PieceType, e: React.MouseEvent) => {
    e.preventDefault();
    if (!onPieceAvoidSignal) return;
    const current = avoidSignalledPieces?.[pieceType] ?? null;
    // Cycle: none → soft → urgent → none
    const next: 'soft' | 'urgent' | null =
      current === null ? 'soft' : current === 'soft' ? 'urgent' : null;
    onPieceAvoidSignal(pieceType, next);
  };

  const hasSignals = signalledPieces && Object.keys(signalledPieces).length > 0;
  const hasAvoidSignals = avoidSignalledPieces && Object.keys(avoidSignalledPieces).length > 0;

  return (
    <div className={`piece-pool${compact ? ' piece-pool-compact' : ''}`}>
      <div className="piece-pool-content">
        {pieceOrder.map((pieceType) => {
          const whiteCount = whiteCounts[pieceType];
          const blackCount = blackCounts[pieceType];
          const signal = signalledPieces?.[pieceType] ?? null;
          const avoidSignal = avoidSignalledPieces?.[pieceType] ?? null;

          return (
            <div key={pieceType} className="piece-row">
              <div
                className={`piece-item ${whiteCount === 0 ? 'empty' : ''} ${selectedPiece === pieceType ? 'selected' : ''} ${signal === 'soft' ? 'signal-soft' : signal === 'urgent' ? 'signal-urgent' : ''}`}
                onClick={() => {
                  if (whiteCount > 0) {
                    onPieceClick?.(pieceType);
                  }
                }}
                onContextMenu={(e) => handleRightClick(pieceType, e)}
                title={signal ? `Signal: ${signal} (right-click to change)` : onPieceSignal ? 'Right-click to signal partner' : undefined}
              >
                <span className="piece-symbol">{getPieceSymbol(pieceType, 'white')}</span>
                <span className="piece-count-badge">{whiteCount}</span>
              </div>
              <div
                className={`piece-item ${blackCount === 0 ? 'empty' : ''} ${avoidSignal === 'soft' ? 'avoid-soft' : avoidSignal === 'urgent' ? 'avoid-urgent' : ''}`}
                onContextMenu={(e) => handleBlackRightClick(pieceType, e)}
                title={avoidSignal ? `Avoid signal: ${avoidSignal} (right-click to change)` : onPieceAvoidSignal ? 'Right-click to signal partner to protect this piece' : undefined}
              >
                <span className="piece-symbol">{getPieceSymbol(pieceType, 'black')}</span>
                <span className="piece-count-badge">{blackCount}</span>
              </div>
            </div>
          );
        })}
      </div>
      {hasSignals && onClearSignals && (
        <button className="clear-signals-btn" onClick={onClearSignals} title="Clear all partner signals">
          ✕ Clear signals
        </button>
      )}
      {hasAvoidSignals && onClearAvoidSignals && (
        <button className="clear-signals-btn avoid-clear-btn" onClick={onClearAvoidSignals} title="Clear all avoid signals">
          ✕ Clear avoid
        </button>
      )}

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

        /* ── Partner signal states ───────────────────────────── */
        .piece-item.signal-soft {
          border-color: #22c55e;
          background: rgba(34,197,94,0.12);
          box-shadow: 0 0 0 2px rgba(34,197,94,0.25);
        }

        .piece-item.signal-urgent {
          border-color: #15803d;
          background: rgba(21,128,61,0.20);
          box-shadow: 0 0 0 2px rgba(21,128,61,0.40);
          animation: urgentPulse 1s ease-in-out infinite;
        }

        @keyframes urgentPulse {
          0%   { box-shadow: 0 0 0 2px rgba(21,128,61,0.40); background: rgba(21,128,61,0.20); }
          50%  { box-shadow: 0 0 0 5px rgba(21,128,61,0.65); background: rgba(21,128,61,0.35); }
          100% { box-shadow: 0 0 0 2px rgba(21,128,61,0.40); background: rgba(21,128,61,0.20); }
        }

        /* ── Clear signals button ────────────────────────────── */
        .clear-signals-btn {
          margin-top: 8px;
          width: 100%;
          padding: 4px 6px;
          font-size: 0.7rem;
          font-weight: 600;
          color: #22c55e;
          background: transparent;
          border: 1px solid #22c55e;
          border-radius: var(--radius-sm);
          cursor: pointer;
          opacity: 0.75;
          transition: opacity 0.15s;
        }

        .clear-signals-btn:hover { opacity: 1; }

        /* ── Avoid signal states (red = opponent piece to protect) ─── */
        .piece-item.avoid-soft {
          border-color: #ef4444;
          background: rgba(239,68,68,0.12);
          box-shadow: 0 0 0 2px rgba(239,68,68,0.25);
        }

        .piece-item.avoid-urgent {
          border-color: #991b1b;
          background: rgba(153,27,27,0.20);
          box-shadow: 0 0 0 2px rgba(153,27,27,0.40);
          animation: avoidPulse 1s ease-in-out infinite;
        }

        @keyframes avoidPulse {
          0%   { box-shadow: 0 0 0 2px rgba(153,27,27,0.40); background: rgba(153,27,27,0.20); }
          50%  { box-shadow: 0 0 0 5px rgba(153,27,27,0.65); background: rgba(153,27,27,0.35); }
          100% { box-shadow: 0 0 0 2px rgba(153,27,27,0.40); background: rgba(153,27,27,0.20); }
        }

        /* ── Clear avoid signals button ──────────────────────── */
        .clear-signals-btn.avoid-clear-btn {
          color: #ef4444;
          border-color: #ef4444;
          margin-top: 4px;
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
