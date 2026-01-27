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

  async initialize(): Promise<void> {
    await window.electronAPI.engine.initialize(this.engineId, this.enginePath);
  }

  async setPosition(fen: string, moves?: string[]): Promise<void> {
    await window.electronAPI.engine.setPosition(this.engineId, fen, moves);
  }

  async getBestMove(timeMs: number): Promise<EngineMove> {
    return await window.electronAPI.engine.getBestMove(this.engineId, timeMs);
  }

  async getEvaluation(depth: number): Promise<EngineInfo> {
    return await window.electronAPI.engine.getEvaluation(this.engineId, depth);
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
    await window.electronAPI.engine.shutdown(this.engineId);
  }

  async isReady(): Promise<boolean> {
    // Assume ready if initialized
    return true;
  }

  async setOptions(options: Record<string, string | number>): Promise<void> {
    await window.electronAPI.engine.setOptions(this.engineId, options);
  }
}
