import { io, Socket } from 'socket.io-client';
import type { EngineMove } from '../engines/IChessEngine';

interface GameState {
  id: string;
  board1Fen: string;
  board2Fen: string;
  board1Moves: string[];
  board2Moves: string[];
  currentTurn: 'white' | 'black';
  status: 'waiting' | 'active' | 'completed';
}

interface MoveData {
  boardId: 1 | 2;
  move: string;
  fen: string;
  ply: number;
}

interface ChatMessage {
  username: string;
  message: string;
  timestamp: Date;
}

type GameStateCallback = (state: any) => void;
type MoveCallback = (data: MoveData) => void;
type EngineMoveCallback = (data: { boardId: number; move: EngineMove }) => void;
type ChatCallback = (message: ChatMessage) => void;
type PlayerCallback = (data: { username: string; playerId: string }) => void;

/**
 * API Service for bughouse.ai
 * 
 * Handles HTTP API calls and WebSocket real-time communication
 * Replaces Electron IPC for web deployment
 */
export class ApiService {
  private socket: Socket | null = null;
  private baseUrl: string;
  private currentGameId: string | null = null;

  // Event callbacks
  private onGameStateUpdate: GameStateCallback | null = null;
  private onMoveReceived: MoveCallback | null = null;
  private onEngineMoveReceived: EngineMoveCallback | null = null;
  private onChatReceived: ChatCallback | null = null;
  private onPlayerJoined: PlayerCallback | null = null;
  private onPlayerLeft: PlayerCallback | null = null;

  constructor(baseUrl: string = import.meta.env.VITE_API_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Initialize WebSocket connection
   */
  connect(username: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(this.baseUrl, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('[API] Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('[API] Disconnected from server');
    });

    this.socket.on('gameState', (state: any) => {
      if (this.onGameStateUpdate) {
        this.onGameStateUpdate(state);
      }
    });

    this.socket.on('moveMade', (data: MoveData) => {
      if (this.onMoveReceived) {
        this.onMoveReceived(data);
      }
    });

    this.socket.on('engineMove', (data: { boardId: number; move: EngineMove }) => {
      if (this.onEngineMoveReceived) {
        this.onEngineMoveReceived(data);
      }
    });

    this.socket.on('chatMessage', (message: ChatMessage) => {
      if (this.onChatReceived) {
        this.onChatReceived(message);
      }
    });

    this.socket.on('playerJoined', (data: { username: string; playerId: string }) => {
      if (this.onPlayerJoined) {
        this.onPlayerJoined(data);
      }
    });

    this.socket.on('playerLeft', (data: { playerId: string }) => {
      if (this.onPlayerLeft) {
        this.onPlayerLeft(data);
      }
    });

    this.socket.on('error', (error: any) => {
      console.error('[API] Socket error:', error);
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Set event callbacks
   */
  setEventHandlers(handlers: {
    onGameStateUpdate?: GameStateCallback;
    onMoveReceived?: MoveCallback;
    onEngineMoveReceived?: EngineMoveCallback;
    onChatReceived?: ChatCallback;
    onPlayerJoined?: PlayerCallback;
    onPlayerLeft?: PlayerCallback;
  }): void {
    this.onGameStateUpdate = handlers.onGameStateUpdate || null;
    this.onMoveReceived = handlers.onMoveReceived || null;
    this.onEngineMoveReceived = handlers.onEngineMoveReceived || null;
    this.onChatReceived = handlers.onChatReceived || null;
    this.onPlayerJoined = handlers.onPlayerJoined || null;
    this.onPlayerLeft = handlers.onPlayerLeft || null;
  }

  // HTTP API Methods

  /**
   * Create a new game
   */
  async createGame(type: 'pvp' | 'pvb' | 'bvb' = 'pvp'): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type }),
    });

    if (!response.ok) {
      throw new Error('Failed to create game');
    }

    const data = await response.json();
    return data.game;
  }

  /**
   * Get list of active games
   */
  async getGames(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/games`);

    if (!response.ok) {
      throw new Error('Failed to fetch games');
    }

    const data = await response.json();
    return data.games;
  }

  /**
   * Get game by ID
   */
  async getGame(gameId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/games/${gameId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch game');
    }

    return response.json();
  }

  // WebSocket Methods

  /**
   * Join a game
   */
  joinGame(gameId: string, username: string): void {
    if (!this.socket) {
      throw new Error('Socket not connected. Call connect() first.');
    }

    this.currentGameId = gameId;
    this.socket.emit('joinGame', { gameId, username });
  }

  /**
   * Make a move
   */
  makeMove(data: MoveData): void {
    if (!this.socket || !this.currentGameId) {
      throw new Error('Not in a game');
    }

    this.socket.emit('makeMove', {
      gameId: this.currentGameId,
      ...data,
    });
  }

  /**
   * Request engine move
   */
  requestEngineMove(boardId: 1 | 2, fen: string, moves: string[], timeMs: number = 1000): void {
    if (!this.socket || !this.currentGameId) {
      throw new Error('Not in a game');
    }

    this.socket.emit('requestEngineMove', {
      gameId: this.currentGameId,
      boardId,
      fen,
      moves,
      timeMs,
    });
  }

  /**
   * Send chat message
   */
  sendChatMessage(username: string, message: string): void {
    if (!this.socket || !this.currentGameId) {
      throw new Error('Not in a game');
    }

    this.socket.emit('sendChatMessage', {
      gameId: this.currentGameId,
      username,
      message,
    });
  }

  /**
   * End the current game
   */
  endGame(result: string): void {
    if (!this.socket || !this.currentGameId) {
      throw new Error('Not in a game');
    }

    this.socket.emit('endGame', {
      gameId: this.currentGameId,
      result,
    });
  }

  /**
   * Get current game ID
   */
  getCurrentGameId(): string | null {
    return this.currentGameId;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Singleton instance
let apiService: ApiService | null = null;

export function getApiService(): ApiService {
  if (!apiService) {
    apiService = new ApiService();
  }
  return apiService;
}

export function initializeApiService(baseUrl?: string): ApiService {
  apiService = new ApiService(baseUrl);
  return apiService;
}
