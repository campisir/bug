import { create } from 'zustand';
import { Board } from '../game/Board';
import { BughouseGame, GameStatus } from '../game/BughouseGame';
import type { BughouseGameConfig } from '../game/BughouseGame';
import type { PieceType } from '../game/PiecePool';
import { ElectronIPCEngine } from '../engines/ElectronIPCEngine';
import type { ChatMessage } from '../components/ChatBox';

export type { ChatMessage };

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
  playerLastMove: [string, string] | null;
  partnerLastMove: [string, string] | null;
  chatMessages: ChatMessage[];
  
  // Clock state (in milliseconds)
  playerWhiteTime: number;
  playerBlackTime: number;
  partnerWhiteTime: number;
  partnerBlackTime: number;
  
  // Actions
  initialize: () => Promise<void>;
  makeMove: (from: string, to: string, promotion?: string) => Promise<void>;
  dropPiece: (square: string, pieceType: PieceType) => Promise<void>;
  selectPiece: (pieceType: PieceType | null) => void;
  pausePartnerBoard: () => void;
  resumePartnerBoard: () => void;
  updateBoards: () => void;
  reset: () => void;
  tickClock: () => void;
  addChatMessage: (sender: ChatMessage['sender'], message: string) => void;
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
  playerLastMove: null,
  partnerLastMove: null,
  chatMessages: [],
  
  // Initialize clocks to 5 minutes (300000 ms)
  playerWhiteTime: 300000,
  playerBlackTime: 300000,
  partnerWhiteTime: 300000,
  partnerBlackTime: 300000,

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
        onChatMessage: (sender, message) => {
          get().addChatMessage(sender, message);
        },
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
    
    // Get last moves for highlighting
    const playerMove = playerBoard.getLastMove();
    const partnerMove = partnerBoard.getLastMove();
    const playerLastMove = playerMove ? [playerMove.from || playerMove.to, playerMove.to] as [string, string] : null;
    const partnerLastMove = partnerMove ? [partnerMove.from || partnerMove.to, partnerMove.to] as [string, string] : null;
    
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
      playerLastMove,
      partnerLastMove,
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
      playerWhiteTime: 300000,
      playerBlackTime: 300000,
      partnerWhiteTime: 300000,
      partnerBlackTime: 300000,
    });
  },

  addChatMessage: (sender: ChatMessage['sender'], message: string) => {
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        {
          id: Date.now() + Math.random(),
          sender,
          message,
          timestamp: Date.now(),
        },
      ],
    }));
  },

  tickClock: () => {
    const { gameStatus, playerTurn, partnerTurn, playerWhiteTime, playerBlackTime, partnerWhiteTime, partnerBlackTime, playerBoard, game } = get();
    
    if (gameStatus !== GameStatus.IN_PROGRESS) return;

    const updates: Partial<GameState> = {};
    
    // Tick player board clock
    if (playerTurn === 'w' && playerWhiteTime > 0) {
      const newTime = Math.max(0, playerWhiteTime - 100);
      updates.playerWhiteTime = newTime;
      if (newTime === 0) {
        // White ran out of time on player board
        if (playerBoard?.getPlayerColor() === 'w') {
          updates.gameStatus = GameStatus.PLAYER_LOST;
        } else {
          updates.gameStatus = GameStatus.PLAYER_WON;
        }
        // Stop the game
        if (game) {
          game.pause();
        }
      }
    } else if (playerTurn === 'b' && playerBlackTime > 0) {
      const newTime = Math.max(0, playerBlackTime - 100);
      updates.playerBlackTime = newTime;
      if (newTime === 0) {
        // Black ran out of time on player board
        if (playerBoard?.getPlayerColor() === 'b') {
          updates.gameStatus = GameStatus.PLAYER_LOST;
        } else {
          updates.gameStatus = GameStatus.PLAYER_WON;
        }
        // Stop the game
        if (game) {
          game.pause();
        }
      }
    }
    
    // Tick partner board clock
    if (partnerTurn === 'w' && partnerWhiteTime > 0) {
      const newTime = Math.max(0, partnerWhiteTime - 100);
      updates.partnerWhiteTime = newTime;
      if (newTime === 0) {
        updates.gameStatus = GameStatus.FINISHED;
        // Stop the game
        if (game) {
          game.pause();
        }
      }
    } else if (partnerTurn === 'b' && partnerBlackTime > 0) {
      const newTime = Math.max(0, partnerBlackTime - 100);
      updates.partnerBlackTime = newTime;
      if (newTime === 0) {
        updates.gameStatus = GameStatus.FINISHED;
        // Stop the game
        if (game) {
          game.pause();
        }
      }
    }
    
    if (Object.keys(updates).length > 0) {
      set(updates);
    }
  },
}));
