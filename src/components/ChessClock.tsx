interface ChessClockProps {
  whiteTime: number; // in milliseconds
  blackTime: number; // in milliseconds
  currentTurn: 'w' | 'b';
  playerColor: 'w' | 'b';
}

/**
 * ChessClock Component
 * 
 * Displays the chess clock for both players
 */
export function ChessClock({ whiteTime, blackTime, currentTurn, playerColor: _playerColor }: ChessClockProps) {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const isWhiteActive = currentTurn === 'w';
  const isBlackActive = currentTurn === 'b';
  
  // Determine if time is running low (less than 20 seconds)
  const isWhiteLow = whiteTime < 20000;
  const isBlackLow = blackTime < 20000;

  return (
    <div className="chess-clock">
      <div className={`clock-display ${isBlackActive ? 'active' : ''} ${isBlackLow ? 'low-time' : ''}`}>
        <span className="clock-label">Black</span>
        <span className="clock-time">{formatTime(blackTime)}</span>
      </div>

      <div className={`clock-display ${isWhiteActive ? 'active' : ''} ${isWhiteLow ? 'low-time' : ''}`}>
        <span className="clock-label">White</span>
        <span className="clock-time">{formatTime(whiteTime)}</span>
      </div>

      <style>{`
        .chess-clock {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
        }

        .clock-display {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-sm);
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }

        .clock-display.active {
          background: rgba(28, 53, 87, 0.06);
          border-color: var(--navy);
          box-shadow: 0 0 0 2px rgba(28,53,87,0.12);
        }

        .clock-display.low-time {
          background: rgba(198, 40, 40, 0.06);
          border-color: var(--red);
          animation: clockPulse 0.9s ease-in-out infinite;
        }

        .clock-display.low-time.active {
          background: rgba(198, 40, 40, 0.12);
        }

        @keyframes clockPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.65; }
        }

        .clock-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }

        .clock-display.active .clock-label {
          color: var(--navy);
        }

        .clock-time {
          font-size: 1.3rem;
          font-weight: 700;
          font-family: 'Courier New', 'JetBrains Mono', monospace;
          color: var(--text);
          letter-spacing: 0.04em;
        }

        .clock-display.low-time .clock-time {
          color: var(--red);
        }

        @media (max-width: 860px) {
          .chess-clock {
            flex-direction: row;
          }
          .clock-display {
            flex: 1;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            padding: 8px 6px;
          }
          .clock-time {
            font-size: 1.1rem;
          }
        }
      `}</style>
    </div>
  );
}
