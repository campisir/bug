/**
 * Chess Engine Interface
 * 
 * Provides a unified interface for communicating with any UCI-compatible chess engine.
 * This abstraction allows swapping engines (e.g., Fairy Stockfish, custom engines) 
 * without modifying the application logic.
 */

export interface EngineMove {
  from: string;
  to: string;
  promotion?: string;
  drop?: string; // For bughouse piece drops (e.g., 'P@e4')
}

export interface EngineInfo {
  depth: number;
  score: number;
  pv: string[]; // Principal variation (best line)
  nodes: number;
  time: number;
}

export interface IChessEngine {
  /**
   * Initialize the engine and start the process
   */
  initialize(): Promise<void>;

  /**
   * Set position using FEN string and optional move list
   * @param fen - FEN string representing the position
   * @param moves - Array of moves in UCI format
   */
  setPosition(fen: string, moves?: string[]): Promise<void>;

  /**
   * Request the engine to analyze and return the best move
   * @param timeMs - Time limit in milliseconds
   * @returns Promise resolving to the best move
   */
  getBestMove(timeMs: number): Promise<EngineMove>;

  /**
   * Start infinite analysis
   * @param callback - Called with engine info updates
   */
  startAnalysis(callback: (info: EngineInfo) => void): void;

  /**
   * Stop current analysis
   */
  stopAnalysis(): Promise<void>;

  /**
   * Send a raw UCI command to the engine
   * @param command - UCI command string
   */
  sendCommand(command: string): void;

  /**
   * Shutdown the engine and cleanup resources
   */
  shutdown(): Promise<void>;

  /**
   * Check if the engine is ready
   */
  isReady(): Promise<boolean>;

  /**
   * Set engine options (e.g., Threads, Hash, variant)
   * @param options - Key-value pairs of option names and values
   */
  setOptions(options: Record<string, string | number>): Promise<void>;
}
