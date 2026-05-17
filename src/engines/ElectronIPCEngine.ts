import type { IChessEngine, EngineMove, EngineInfo } from './IChessEngine';

/**
 * Electron IPC Engine Adapter
 * 
 * Communicates with chess engines running in the Electron main process via IPC.
 * This adapter works in the renderer process and forwards calls to the main process.
 */
export class ElectronIPCEngine implements IChessEngine {
  private engineId: string;
  private enginePath: string;

  constructor(engineId: string, enginePath: string) {
    this.engineId = engineId;
    this.enginePath = enginePath;
  }

  private get api() {
    if (!window.electronAPI?.engine) {
      throw new Error(
        'window.electronAPI is not available. Ensure the app is running inside Electron with the preload script loaded.'
      );
    }
    return window.electronAPI.engine;
  }

  async initialize(): Promise<void> {
    await this.api.initialize(this.engineId, this.enginePath);
  }

  async setPosition(fen: string, moves?: string[]): Promise<void> {
    await this.api.setPosition(this.engineId, fen, moves);
  }

  async getBestMove(timeMs: number): Promise<EngineMove> {
    return await this.api.getBestMove(this.engineId, timeMs);
  }

  async getBestMoveWithSearchMoves(timeMs: number, searchMoves: string[]): Promise<EngineMove> {
    try {
      return await this.api.getBestMoveWithSearchMoves(this.engineId, timeMs, searchMoves);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[IPC] getBestMoveWithSearchMoves failed:', message);
      console.warn('[IPC] Falling back to getBestMove. Restart Electron after rebuild to register the handler.');
      return await this.api.getBestMove(this.engineId, timeMs);
    }
  }

  async getEvaluation(depth: number): Promise<EngineInfo> {
    return await this.api.getEvaluation(this.engineId, depth);
  }

  startAnalysis(_callback: (info: EngineInfo) => void): void {
    // TODO: Implement analysis via IPC if needed
    console.warn('Analysis not yet implemented for ElectronIPCEngine');
  }

  async stopAnalysis(): Promise<void> {
    // TODO: Implement if analysis is needed
  }

  sendCommand(_command: string): void {
    // Not needed for IPC adapter - commands handled by main process
  }

  async shutdown(): Promise<void> {
    await this.api.shutdown(this.engineId);
  }

  async isReady(): Promise<boolean> {
    // Assume ready if initialized
    return true;
  }

  async setOptions(options: Record<string, string | number>): Promise<void> {
    await this.api.setOptions(this.engineId, options);
  }
}
