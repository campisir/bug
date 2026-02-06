export interface EngineMove {
  from: string;
  to: string;
  promotion?: string;
  drop?: string;
}

export interface EngineInfo {
  depth: number;
  score: number;
  nodes: number;
  time: number;
  pv: string[];
}

export interface IChessEngine {
  initialize(): Promise<void>;
  setPosition(fen: string, moves?: string[]): Promise<void>;
  getBestMove(timeMs: number): Promise<EngineMove>;
  getBestMoveWithSearchMoves(timeMs: number, searchMoves: string[]): Promise<EngineMove>;
  startAnalysis(callback: (info: EngineInfo) => void): void;
  stopAnalysis(): Promise<void>;
  sendCommand(command: string): void;
  shutdown(): Promise<void>;
  isReady(): Promise<boolean>;
  setOptions(options: Record<string, string | number>): Promise<void>;
}

export interface GameState {
  id: string;
  board1Fen: string;
  board2Fen: string;
  board1Moves: string[];
  board2Moves: string[];
  currentTurn: 'white' | 'black';
  players: {
    whiteBoard1: string | null;
    blackBoard1: string | null;
    whiteBoard2: string | null;
    blackBoard2: string | null;
  };
  status: 'waiting' | 'active' | 'completed';
  result?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Player {
  id: string;
  username: string;
  elo: number;
  gamesPlayed: number;
}

export interface Move {
  gameId: string;
  boardId: 1 | 2;
  ply: number;
  move: string;
  fen: string;
  timestamp: Date;
}
