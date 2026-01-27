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
export function ChessClock({ whiteTime, blackTime, currentTurn, playerColor }: ChessClockProps) {
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
          gap: 8px;
          width: 100%;
        }

        .clock-display {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #f5f5f5;
          border-radius: 8px;
          border: 2px solid #ddd;
          transition: all 0.2s;
        }

        .clock-display.active {
          background: #e3f2fd;
          border-color: #2196F3;
          box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
        }

        .clock-display.low-time {
          background: #ffebee;
          border-color: #f44336;
          animation: pulse 1s ease-in-out infinite;
        }

        .clock-display.low-time.active {
          background: #ffcdd2;
          border-color: #f44336;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        .clock-label {
          font-size: 14px;
          font-weight: 600;
          color: #555;
        }

        .clock-time {
          font-size: 24px;
          font-weight: bold;
          font-family: 'Courier New', monospace;
          color: #333;
        }

        .clock-display.low-time .clock-time {
          color: #f44336;
        }
      `}</style>
    </div>
  );
}
