import { useEffect, useState } from 'react';
import { ChessBoard } from './ChessBoard';
import { PiecePoolDisplay } from './PiecePoolDisplay';
import { ChessClock } from './ChessClock';
import { useGameStore } from '../store/gameStore';
import type { PieceType } from '../game/PiecePool';

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
  
  // Get actions (these don't cause re-renders)
  const initialize = useGameStore((state) => state.initialize);
  const makeMove = useGameStore((state) => state.makeMove);
  const dropPiece = useGameStore((state) => state.dropPiece);
  const selectPiece = useGameStore((state) => state.selectPiece);
  const pausePartnerBoard = useGameStore((state) => state.pausePartnerBoard);
  const resumePartnerBoard = useGameStore((state) => state.resumePartnerBoard);
  const tickClock = useGameStore((state) => state.tickClock);

  useEffect(() => {
    console.log('[GameContainer] Component mounted');
    return () => console.log('[GameContainer] Component unmounted');
  }, []);

  useEffect(() => {
    // Initialize the game when component mounts
    initialize();
  }, [initialize]);

  useEffect(() => {
    // Set up clock ticker (100ms intervals)
    const interval = setInterval(() => {
      tickClock();
    }, 100);

    return () => clearInterval(interval);
  }, [tickClock]);

  const handlePlayerMove = (from: string, to: string, promotion?: string) => {
    makeMove(from, to, promotion);
  };

  const handlePieceDrop = (pieceType: PieceType) => {
    selectPiece(pieceType);
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
      <div className="game-header">
        <h1>Bughouse Chess</h1>
        <div className="game-status">
          Status: <span className="status-badge">{gameStatus}</span>
        </div>
      </div>

      <div className="boards-container">
        {/* Player Board Section */}
        <div className="board-section player-board">
          <div className="board-header">
            <h2>Your Board</h2>
            <span className="board-info">
              Playing as {playerBoard?.getPlayerColor() === 'w' ? 'White' : 'Black'}
              {selectedPiece && <span style={{marginLeft: '10px', color: '#e67e22'}}>● Drop mode: {selectedPiece.toUpperCase()}</span>}
            </span>
          </div>
          
          <div className="board-with-pool">
            <div className="pool-wrapper player-pool">
              {playerWhitePiecePool && playerBlackPiecePool && (
                <PiecePoolDisplay
                  whitePieces={playerWhitePiecePool}
                  blackPieces={playerBlackPiecePool}
                  onPieceClick={(pieceType) => selectPiece(selectedPiece === pieceType ? null : pieceType)}
                  selectedPiece={selectedPiece}
                />
              )}
            </div>
            
            <div className="board-and-clock">
              <div className="board-wrapper player-board-wrapper">
                {playerBoard && (
                  <ChessBoard
                    key="player-board"
                    fen={playerFen}
                    orientation={playerBoard.getPlayerColor() === 'w' ? 'white' : 'black'}
                    onMove={handlePlayerMove}
                    onSquareClick={handleSquareClick}
                    movable={playerTurn === playerBoard.getPlayerColor() && !selectedPiece}
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

        {/* Partner Board Section */}
        <div className="board-section partner-board">
          <div className="board-header">
            <h2>Partner Board</h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
              <button onClick={pausePartnerBoard} className="control-button">Pause</button>
              <button onClick={resumePartnerBoard} className="control-button">Resume</button>
              <span className="board-info">Bots Playing</span>
            </div>
          </div>
          
          <div className="board-with-pool">
            <div className="board-and-clock">
              <div className="board-wrapper partner-board-wrapper">
                {partnerBoard && (
                  <ChessBoard
                    key="partner-board"
                    fen={partnerFen}
                    orientation={partnerBoard.getPlayerColor() === 'w' ? 'white' : 'black'}
                    movable={false}
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
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .game-container {
          padding: 20px;
          max-width: 100%;
          margin: 0 auto;
        }

        .game-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .game-header h1 {
          margin: 0 0 10px 0;
          color: #333;
        }

        .game-status {
          font-size: 18px;
          color: #666;
        }

        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          background: #4CAF50;
          color: white;
          border-radius: 4px;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 14px;
        }

        .boards-container {
          display: flex;
          gap: 30px;
          justify-content: center;
          align-items: flex-start;
        }

        .board-section {
          flex-shrink: 0;
        }

        .board-section.player-board {
          order: 1;
        }

        .board-section.partner-board {
          order: 2;
        }

        .board-header {
          margin-bottom: 15px;
          text-align: center;
        }

        .board-header h2 {
          margin: 0 0 5px 0;
          color: #333;
        }

        .board-info {
          color: #666;
          font-size: 14px;
        }

        .control-button {
          padding: 6px 12px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }

        .control-button:hover {
          background: #45a049;
        }

        .control-button:active {
          background: #3d8b40;
        }

        .pool-wrapper {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .pool-wrapper h3 {
          margin: 10px 0 5px 0;
          font-size: 14px;
          font-weight: 600;
          color: #555;
          text-align: center;
        }

        .board-with-pool {
          display: flex;
          gap: 20px;
          align-items: center;
        }

        .board-and-clock {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .board-wrapper {
          flex-shrink: 0;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          border-radius: 4px;
          overflow: hidden;
        }

        .player-board-wrapper {
          width: 600px;
          height: 600px;
        }

        .partner-board-wrapper {
          width: 600px;
          height: 600px;
        }

        .board-wrapper > div {
          width: 100% !important;
          height: 100% !important;
        }

        .clock-container {
          width: 600px;
        }

        .pool-wrapper {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
        }

        .player-pool {
          width: 200px;
          height: 600px;
        }

        .partner-pool {
          width: 200px;
          height: 600px;
        }



        @media (max-width: 1200px) {
          .boards-container {
            flex-direction: column;
            align-items: center;
          }

          .board-section {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
