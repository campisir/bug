import { create } from 'zustand';
import { Board } from '../game/Board';
import { BughouseGame, GameStatus } from '../game/BughouseGame';
import type { BughouseGameConfig } from '../game/BughouseGame';
import type { PieceType } from '../game/PiecePool';
import { ElectronIPCEngine } from '../engines/ElectronIPCEngine';

interface GameState {
  game: BughouseGame | null;
  playerBoard: Board | null;
  partnerBoard: Board | null;
  playerFen: string;
  partnerFen: string;
  playerTurn: 'w' | 'b';
  partnerTurn: 'w' | 'b';
  playerWhitePiecePool: Record<PieceType, number> | null;
  playerBlackPiecePool: Record<PieceType, number> | null;
  partnerWhitePiecePool: Record<PieceType, number> | null;
  partnerBlackPiecePool: Record<PieceType, number> | null;
  gameStatus: GameStatus;
  selectedPiece: PieceType | null;
  
  // Actions
  initialize: () => Promise<void>;
  makeMove: (from: string, to: string, promotion?: string) => Promise<void>;
  dropPiece: (square: string, pieceType: PieceType) => Promise<void>;
  selectPiece: (pieceType: PieceType | null) => void;
  pausePartnerBoard: () => void;
  resumePartnerBoard: () => void;
  updateBoards: () => void;
  reset: () => void;
}

/**
 * Game State Store
 * 
 * Manages the global state of the bughouse chess game using Zustand.
 */
export const useGameStore = create<GameState>((set, get) => ({
  game: null,
  playerBoard: null,
  partnerBoard: null,
  playerFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  partnerFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  playerTurn: 'w',
  partnerTurn: 'w',
  playerWhitePiecePool: null,
  playerBlackPiecePool: null,
  partnerWhitePiecePool: null,
  partnerBlackPiecePool: null,
  gameStatus: GameStatus.NOT_STARTED as GameStatus,
  selectedPiece: null,

  initialize: async () => {
    try {
      // Engine path relative to project root
      const enginePath = 'engines/fairy-stockfish.exe';

      const config: BughouseGameConfig = {
        playerColor: 'w',
        playerEngine: new ElectronIPCEngine('player-engine', enginePath),
        partnerEngine1: new ElectronIPCEngine('partner-engine-1', enginePath),
        partnerEngine2: new ElectronIPCEngine('partner-engine-2', enginePath),
        thinkingTimeMs: 2000, // Increased to 2 seconds to prevent timeouts
      };

      const game = new BughouseGame(config);

      // Set up update callback
      game.onGameUpdate(() => {
        get().updateBoards();
      });

      await game.initialize();
      await game.start();

      set({
        game,
        gameStatus: game.getStatus(),
      });

      // Initial board update
      get().updateBoards();
    } catch (error) {
      console.error('Failed to initialize game:', error);
      set({ gameStatus: GameStatus.NOT_STARTED as GameStatus });
    }
  },

  makeMove: async (from: string, to: string, promotion?: string) => {
    const { game } = get();
    if (!game) return;

    const success = await game.makePlayerMove(from, to, promotion);
    
    if (success) {
      get().updateBoards();
    }
  },

  dropPiece: async (square: string, pieceType: PieceType) => {
    const { game } = get();
    if (!game) return;

    const success = await game.dropPiece(square, pieceType);
    
    if (success) {
      get().updateBoards();
    }
  },

  selectPiece: (pieceType: PieceType | null) => {
    set({ selectedPiece: pieceType });
  },

  pausePartnerBoard: () => {
    const { game } = get();
    if (game) {
      game.pause();
    }
  },

  resumePartnerBoard: () => {
    const { game } = get();
    if (game) {
      game.resume();
    }
  },

  updateBoards: () => {
    const { game } = get();
    if (!game) return;

    const playerBoard = game.getPlayerBoard();
    const partnerBoard = game.getPartnerBoard();
    
    const playerFen = playerBoard.getFen();
    const partnerFen = partnerBoard.getFen();
    const playerTurn = playerBoard.getCurrentTurn();
    const partnerTurn = partnerBoard.getCurrentTurn();
    
    const playerWhitePool = playerBoard.getWhitePiecePool().getAllPieces();
    const playerBlackPool = playerBoard.getBlackPiecePool().getAllPieces();
    const partnerWhitePool = partnerBoard.getWhitePiecePool().getAllPieces();
    const partnerBlackPool = partnerBoard.getBlackPiecePool().getAllPieces();
    
    const playerWhitePiecePool: Record<PieceType, number> = {
      p: playerWhitePool.get('p') || 0,
      n: playerWhitePool.get('n') || 0,
      b: playerWhitePool.get('b') || 0,
      r: playerWhitePool.get('r') || 0,
      q: playerWhitePool.get('q') || 0,
    };
    const playerBlackPiecePool: Record<PieceType, number> = {
      p: playerBlackPool.get('p') || 0,
      n: playerBlackPool.get('n') || 0,
      b: playerBlackPool.get('b') || 0,
      r: playerBlackPool.get('r') || 0,
      q: playerBlackPool.get('q') || 0,
    };
    const partnerWhitePiecePool: Record<PieceType, number> = {
      p: partnerWhitePool.get('p') || 0,
      n: partnerWhitePool.get('n') || 0,
      b: partnerWhitePool.get('b') || 0,
      r: partnerWhitePool.get('r') || 0,
      q: partnerWhitePool.get('q') || 0,
    };
    const partnerBlackPiecePool: Record<PieceType, number> = {
      p: partnerBlackPool.get('p') || 0,
      n: partnerBlackPool.get('n') || 0,
      b: partnerBlackPool.get('b') || 0,
      r: partnerBlackPool.get('r') || 0,
      q: partnerBlackPool.get('q') || 0,
    };
    
    set({
      playerBoard,
      partnerBoard,
      playerFen,
      partnerFen,
      playerTurn,
      partnerTurn,
      playerWhitePiecePool,
      playerBlackPiecePool,
      partnerWhitePiecePool,
      partnerBlackPiecePool,
      gameStatus: game.getStatus(),
    });
  },

  reset: () => {
    const { game } = get();
    if (game) {
      game.shutdown();
    }

    set({
      game: null,
      playerBoard: null,
      partnerBoard: null,
      playerFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      partnerFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playerTurn: 'w',
      partnerTurn: 'w',
      playerPiecePool: null,
      partnerPiecePool: null,
      gameStatus: GameStatus.NOT_STARTED as GameStatus,
      selectedPiece: null,
    });
  },
}));
