import { useEffect, useState } from 'react';
import { ChessBoard } from './ChessBoard';
import { PiecePoolDisplay } from './PiecePoolDisplay';
import { ChessClock } from './ChessClock';
import { ChatBox } from './ChatBox';
import { GameLog } from './GameLog';
import { useGameStore } from '../store/gameStore';

/**
 * GameContainer Component
 * 
 * Main container for the bughouse chess game.
 * Displays two boards side by side with piece pools.
 */
export function GameContainer() {
  // Subscribe only to the values we need - prevents unnecessary re-renders
  const playerBoard = useGameStore((state) => state.playerBoard);
  const partnerBoard = useGameStore((state) => state.partnerBoard);
  const playerFen = useGameStore((state) => state.playerFen);
  const partnerFen = useGameStore((state) => state.partnerFen);
  const playerTurn = useGameStore((state) => state.playerTurn);
  const partnerTurn = useGameStore((state) => state.partnerTurn);
  const playerWhitePiecePool = useGameStore((state) => state.playerWhitePiecePool);
  const playerBlackPiecePool = useGameStore((state) => state.playerBlackPiecePool);
  const partnerWhitePiecePool = useGameStore((state) => state.partnerWhitePiecePool);
  const partnerBlackPiecePool = useGameStore((state) => state.partnerBlackPiecePool);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const selectedPiece = useGameStore((state) => state.selectedPiece);
  const playerWhiteTime = useGameStore((state) => state.playerWhiteTime);
  const playerBlackTime = useGameStore((state) => state.playerBlackTime);
  const partnerWhiteTime = useGameStore((state) => state.partnerWhiteTime);
  const partnerBlackTime = useGameStore((state) => state.partnerBlackTime);
  const playerLastMove = useGameStore((state) => state.playerLastMove);
  const partnerLastMove = useGameStore((state) => state.partnerLastMove);
  const chatMessages = useGameStore((state) => state.chatMessages);
  
  // Get actions (these don't cause re-renders)
  const initialize = useGameStore((state) => state.initialize);
  const makeMove = useGameStore((state) => state.makeMove);
  const dropPiece = useGameStore((state) => state.dropPiece);
  const selectPiece = useGameStore((state) => state.selectPiece);
  const sendGoCommand = useGameStore((state) => state.sendGoCommand);
  const sendSitCommand = useGameStore((state) => state.sendSitCommand);
  const tickClock = useGameStore((state) => state.tickClock);
  const resign = useGameStore((state) => state.resign);
  const botSpeed = useGameStore((state) => state.botSpeed);
  const setBotSpeed = useGameStore((state) => state.setBotSpeed);
  const playerSignals = useGameStore((state) => state.playerSignals);
  const setPlayerSignal = useGameStore((state) => state.setPlayerSignal);
  const clearPlayerSignals = useGameStore((state) => state.clearPlayerSignals);
  const playerAvoidSignals = useGameStore((state) => state.playerAvoidSignals);
  const setPlayerAvoidSignal = useGameStore((state) => state.setPlayerAvoidSignal);
  const clearPlayerAvoidSignals = useGameStore((state) => state.clearPlayerAvoidSignals);

  const [showGameOver, setShowGameOver] = useState(true);
  const [showGameLog, setShowGameLog] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<string>('standard');

  const startingPositions: Record<string, { name: string; playerFen: string; partnerFen: string }> = {
    standard: {
      name: 'Standard',
      playerFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      partnerFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    },
    qMates: {
      name: 'Q Mates',
      playerFen: 'rnbqkb1r/pppp1ppp/4pn2/8/8/4P3/PPPPKPPP/RNBQ1BNR w KQkq - 0 1',
      partnerFen: 'rnb1kbnr/pppp1ppp/5q2/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 0 1',
    },
    sacForKnight: {
      name: 'Sac for Knight',
      playerFen: 'rnbqkbnr/pppppppp/8/8/8/8/PP1PPPPP/KR1NQBNR w KQkq - 0 1',
      partnerFen: 'rnbqkb1r/pppp1ppp/4pn2/8/8/4PQ2/PPPP1PPP/RNB1KBNR w KQkq - 0 1',
    },
    forkForQueen: {
      name: 'Fork for Queen',
      playerFen: 'rnbqkb1r/pppp1ppp/4pn2/8/8/4P3/PPPPKPPP/RNBQ1BNR w KQkq - 0 1',
      partnerFen: 'rnb1kbnr/ppppp1pp/5p1q/8/8/5QN1/PPPPPPPP/RNB1KB1R w KQkq - 0 1',
    },
  };

  useEffect(() => {
    console.log('[GameContainer] Component mounted');
    return () => console.log('[GameContainer] Component unmounted');
  }, []);

  useEffect(() => {
    // Initialize the game when component mounts
    const position = startingPositions[selectedPosition];
    initialize(position.playerFen, position.partnerFen);
  }, [initialize, selectedPosition]);

  useEffect(() => {
    // Set up clock ticker (100ms intervals)
    const interval = setInterval(() => {
      tickClock();
    }, 100);

    return () => clearInterval(interval);
  }, [tickClock]);

  useEffect(() => {
    // Show game over overlay when game ends
    if (gameStatus !== 'in_progress' && gameStatus !== 'not_started') {
      setShowGameOver(true);
    }
  }, [gameStatus]);

  const handlePlayerMove = (from: string, to: string, promotion?: string) => {
    makeMove(from, to, promotion);
  };

  const handleSquareClick = (square: string) => {
    // Read selectedPiece directly from store to avoid closure issues
    const currentSelectedPiece = useGameStore.getState().selectedPiece;
    if (currentSelectedPiece) {
      
      // Check pawn rank restriction
      const rank = square[1];
      if (currentSelectedPiece === 'p' && (rank === '1' || rank === '8')) {
        alert('Cannot drop pawns on the first or eighth rank!');
        selectPiece(null);
        return;
      }
      
      dropPiece(square, currentSelectedPiece);
      selectPiece(null);
    }
  };

  return (
    <div className="game-container">
      <header className="game-header">
        <h1 className="game-title">bughouse.ai</h1>
        <div className="header-controls">
          <div className="game-status">
            <span className="status-label">Status</span>
            <span className={`status-badge status-${gameStatus}`}>{gameStatus.replace('_', ' ')}</span>
          </div>
          <div className="position-selector">
            <label htmlFor="position-select">Position:</label>
            <select
              id="position-select"
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              disabled={gameStatus === 'in_progress'}
            >
              {Object.entries(startingPositions).map(([key, pos]) => (
                <option key={key} value={key}>{pos.name}</option>
              ))}
            </select>
          </div>
          <div className="speed-selector">
            <label htmlFor="speed-slider">
              Speed: <span className="speed-label">{['Slow', 'Normal', 'Fast', 'Blitz', 'Bullet'][botSpeed - 1]}</span>
            </label>
            <input
              id="speed-slider"
              type="range"
              min={1}
              max={5}
              step={1}
              value={botSpeed}
              onChange={(e) => setBotSpeed(Number(e.target.value))}
            />
          </div>
        </div>
      </header>

      {/* Game Over Overlay */}
      {showGameOver && gameStatus !== 'in_progress' && gameStatus !== 'not_started' && (
        <div className="game-over-overlay">
          <div className="game-over-modal">
            <h2>Game Over</h2>
            <p className="result">
              {gameStatus === 'player_won' && '🎉 You Won!'}
              {gameStatus === 'player_lost' && '😔 You Lost'}
              {gameStatus === 'partner_won' && '🎉 Your Partner Won!'}
              {gameStatus === 'partner_lost' && '😔 Your Partner Lost'}
              {gameStatus === 'draw' && '🤝 Draw'}
              {gameStatus === 'finished' && '⏱️ Time Out'}
            </p>
            <div className="modal-actions">
              <button onClick={() => setShowGameOver(false)} className="modal-btn modal-btn-secondary">
                Close
              </button>
              <button onClick={() => setShowGameLog(true)} className="modal-btn modal-btn-primary">
                View Game Log
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="boards-container">
        {/* Player Board Section */}
        <div className="board-section player-board">
          <div className="board-header">
            <div className="board-header-left">
              <h2>Your Board</h2>
              <span className="board-info">
                Playing as {playerBoard?.getPlayerColor() === 'w' ? 'White' : 'Black'}
              </span>
            </div>
            <div className="board-header-right">
              {selectedPiece && (
                <span className="drop-indicator">⬇ Drop: {selectedPiece.toUpperCase()}</span>
              )}
              <button onClick={resign} className="resign-button">Resign</button>
            </div>
          </div>

          <div className="board-with-pool">
            <div className="pool-wrapper player-pool">
              {playerWhitePiecePool && playerBlackPiecePool && (
                <PiecePoolDisplay
                  whitePieces={playerWhitePiecePool}
                  blackPieces={playerBlackPiecePool}
                  onPieceClick={(pieceType) => selectPiece(selectedPiece === pieceType ? null : pieceType)}
                  selectedPiece={selectedPiece}
                  signalledPieces={playerSignals}
                  onPieceSignal={setPlayerSignal}
                  onClearSignals={clearPlayerSignals}
                  avoidSignalledPieces={playerAvoidSignals}
                  onPieceAvoidSignal={setPlayerAvoidSignal}
                  onClearAvoidSignals={clearPlayerAvoidSignals}
                />
              )}
            </div>

            <div className="board-and-clock">
              <div className="board-wrapper">
                {playerBoard && (
                  <ChessBoard
                    key="player-board"
                    fen={playerFen}
                    orientation={playerBoard.getPlayerColor() === 'w' ? 'white' : 'black'}
                    onMove={handlePlayerMove}
                    onSquareClick={handleSquareClick}
                    movable={!selectedPiece}
                    lastMove={playerLastMove}
                    debug={true}
                  />
                )}
              </div>

              <div className="clock-container">
                {playerBoard && (
                  <ChessClock
                    whiteTime={playerWhiteTime}
                    blackTime={playerBlackTime}
                    currentTurn={playerTurn}
                    playerColor={playerBoard.getPlayerColor()}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right column: partner board + chat stacked */}
        <div className="right-column">
          <div className="board-section partner-board">
            <div className="board-header">
              <div className="board-header-left">
                <h2>Partner Board</h2>
                <span className="board-info">Bots playing</span>
              </div>
            </div>

            <div className="board-with-pool">
              <div className="board-and-clock">
                <div className="board-wrapper">
                  {partnerBoard && (
                    <ChessBoard
                      key="partner-board"
                      fen={partnerFen}
                      orientation={partnerBoard.getPlayerColor() === 'w' ? 'white' : 'black'}
                      movable={false}
                      lastMove={partnerLastMove}
                    />
                  )}
                </div>

                <div className="clock-container">
                  {partnerBoard && (
                    <ChessClock
                      whiteTime={partnerWhiteTime}
                      blackTime={partnerBlackTime}
                      currentTurn={partnerTurn}
                      playerColor={partnerBoard.getPlayerColor()}
                    />
                  )}
                </div>
              </div>

              <div className="pool-wrapper partner-pool">
                {partnerWhitePiecePool && partnerBlackPiecePool && (
                  <PiecePoolDisplay
                    whitePieces={partnerWhitePiecePool}
                    blackPieces={partnerBlackPiecePool}
                    compact
                  />
                )}
              </div>
            </div>
          </div>

          {/* Chat directly below partner board */}
          <div className="chat-section">
            <ChatBox
              messages={chatMessages}
              onSendGo={sendGoCommand}
              onSendSit={sendSitCommand}
            />
          </div>
        </div>
      </div>

      <style>{`
        /* ── Layout ─────────────────────────────────────────── */
        .game-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--bg);
        }

        /* ── Header ─────────────────────────────────────────── */
        .game-header {
          background: var(--navy);
          padding: 14px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }

        .game-title {
          margin: 0;
          color: #fff;
          font-size: 1.4rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }

        .game-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-label {
          color: rgba(255,255,255,0.65);
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .status-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 99px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: var(--gold);
          color: #fff;
        }

        .status-badge.status-in_progress { background: var(--green); }
        .status-badge.status-player_won  { background: var(--gold); }
        .status-badge.status-player_lost { background: var(--red); }

        .position-selector {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .position-selector label {
          color: rgba(255,255,255,0.65);
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }

        .position-selector select {
          padding: 5px 10px;
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.12);
          color: #fff;
          font-size: 0.85rem;
          cursor: pointer;
          outline: none;
        }

        .position-selector select:hover:not(:disabled) {
          border-color: var(--gold-light);
          background: rgba(255,255,255,0.18);
        }

        .position-selector select:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .position-selector select option {
          background: var(--navy);
          color: #fff;
        }

        /* ── Speed selector ─────────────────────────────────── */
        .speed-selector {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .speed-selector label {
          color: rgba(255,255,255,0.65);
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
          display: flex;
          gap: 4px;
        }

        .speed-label {
          color: var(--gold-light, #f0c040);
          font-weight: 700;
        }

        .speed-selector input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          width: 90px;
          height: 4px;
          border-radius: 2px;
          background: rgba(255,255,255,0.25);
          outline: none;
          cursor: pointer;
        }

        .speed-selector input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--gold, #b8882e);
          cursor: pointer;
        }

        .speed-selector input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--gold, #b8882e);
          cursor: pointer;
          border: none;
        }

        /* ── Boards container ────────────────────────────────── */
        .boards-container {
          flex: 1;
          display: flex;
          gap: 28px;
          padding: 28px;
          align-items: start;
          /* Center content on very wide / 4K displays */
          max-width: 1700px;
          margin: 0 auto;
          width: 100%;
        }

        .board-section.player-board {
          flex: 3;
          min-width: 0;
        }

        .right-column {
          flex: 2;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ── Board sections ──────────────────────────────────── */
        .board-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }

        .board-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 0 2px;
        }

        .board-header-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .board-header-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .board-header h2 {
          margin: 0;
          color: var(--navy);
          font-size: 1rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .board-info {
          color: var(--text-muted);
          font-size: 0.78rem;
        }

        .drop-indicator {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--gold);
          background: rgba(184,136,46,0.12);
          padding: 3px 8px;
          border-radius: 99px;
          white-space: nowrap;
        }

        .resign-button {
          background: var(--red);
          color: #fff;
          font-size: 0.8rem;
          padding: 5px 12px;
          border-radius: var(--radius-sm);
          white-space: nowrap;
        }

        .resign-button:hover { background: var(--red-hover); }

        /* ── Board + pool row ────────────────────────────────── */
        .board-with-pool {
          display: flex;
          gap: 14px;
          align-items: stretch;
        }

        .board-and-clock {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Size caps: constrain container so board AND clock share the same width */
        .board-section.player-board .board-and-clock {
          max-width: min(760px, calc(100vh - 260px));
        }

        .right-column .board-and-clock {
          max-width: min(520px, calc(100vh - 260px));
        }

        .board-wrapper {
          aspect-ratio: 1 / 1;
          width: 100%;
          border-radius: var(--radius-sm);
          overflow: hidden;
          box-shadow: var(--shadow-md);
        }

        .board-wrapper > div {
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
        }

        .clock-container {
          width: 100%;
        }

        /* ── Piece pool wrapper ───────────────────────────────── */
        .pool-wrapper {
          flex-shrink: 0;
          width: 120px;
          display: flex;
          flex-direction: column;
        }

        .player-pool  { width: 190px; }
        .partner-pool { width: 130px; }

        /* ── Chat section ────────────────────────────────────── */
        .chat-section {
          width: 100%;
        }

        /* ── Game Over overlay ───────────────────────────────── */
        .game-over-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: gcFadeIn 0.25s ease;
          backdrop-filter: blur(3px);
        }

        @keyframes gcFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .game-over-modal {
          background: var(--surface);
          padding: 40px 52px;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          text-align: center;
          animation: gcSlideUp 0.25s ease-out;
          max-width: 90vw;
        }

        @keyframes gcSlideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        .game-over-modal h2 {
          margin: 0 0 8px 0;
          color: var(--navy);
          font-size: 1.8rem;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .game-over-modal .result {
          font-size: 1.4rem;
          font-weight: 600;
          color: var(--text);
          margin: 0 0 28px 0;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .modal-btn {
          padding: 10px 22px;
          border-radius: var(--radius-md);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: background 0.15s, transform 0.1s;
        }

        .modal-btn:hover { filter: brightness(1.1); }
        .modal-btn-secondary { background: var(--border); color: var(--text); }
        .modal-btn-primary   { background: var(--blue); color: #fff; }

        /* ── Responsive: mobile (≤860px) ────────────────────── */
        @media (max-width: 860px) {
          .boards-container {
            flex-direction: column;
            padding: 16px 14px;
            gap: 20px;
          }
          .board-section.player-board,
          .right-column {
            flex: none;
            width: 100%;
          }
          .board-with-pool {
            flex-direction: column;
            gap: 10px;
          }
          .player-pool {
            order: 2;
            width: 100%;
          }
          .partner-pool {
            width: 100%;
          }
          .board-and-clock {
            order: 1;
          }
          .pool-wrapper {
            width: 100%;
          }
        }

        /* ── Responsive: small header ────────────────────────── */
        @media (max-width: 560px) {
          .game-header {
            flex-direction: column;
            align-items: flex-start;
            padding: 12px 16px;
          }
          .game-title {
            font-size: 1.15rem;
          }
          .header-controls {
            width: 100%;
            gap: 12px;
          }
        }
      `}</style>

      {/* Game Log Modal */}
      {showGameLog && (
        <GameLog onClose={() => setShowGameLog(false)} />
      )}
    </div>
  );
}
