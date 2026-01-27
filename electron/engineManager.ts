import { ipcMain } from 'electron';
import path from 'path';
import { FairyStockfishEngine, IChessEngine } from './FairyStockfishEngine.js';

/**
 * Engine Manager
 * 
 * Manages chess engine instances in the main process.
 * Handles IPC communication from the renderer process.
 */

class EngineManager {
  private engines: Map<string, IChessEngine> = new Map();

  async initializeEngine(engineId: string, enginePath: string): Promise<void> {
    // If engine already exists, shutdown first
    if (this.engines.has(engineId)) {
      await this.engines.get(engineId)?.shutdown();
    }

    const engine = new FairyStockfishEngine(enginePath);
    await engine.initialize();
    this.engines.set(engineId, engine);
  }

  async setPosition(engineId: string, fen: string, moves?: string[]): Promise<void> {
    const engine = this.engines.get(engineId);
    if (!engine) throw new Error(`Engine ${engineId} not initialized`);
    await engine.setPosition(fen, moves);
  }

  async getBestMove(engineId: string, timeMs: number) {
    const engine = this.engines.get(engineId);
    if (!engine) throw new Error(`Engine ${engineId} not initialized`);
    return await engine.getBestMove(timeMs);
  }

  async getEvaluation(engineId: string, depth: number) {
    const engine = this.engines.get(engineId);
    if (!engine) throw new Error(`Engine ${engineId} not initialized`);
    return await engine.getEvaluation(depth);
  }

  async setOptions(engineId: string, options: Record<string, string | number>): Promise<void> {
    const engine = this.engines.get(engineId);
    if (!engine) throw new Error(`Engine ${engineId} not initialized`);
    await engine.setOptions(options);
  }

  async shutdown(engineId: string): Promise<void> {
    const engine = this.engines.get(engineId);
    if (!engine) return;
    await engine.shutdown();
    this.engines.delete(engineId);
  }

  async shutdownAll(): Promise<void> {
    const shutdownPromises = Array.from(this.engines.keys()).map(id => this.shutdown(id));
    await Promise.all(shutdownPromises);
  }
}

const engineManager = new EngineManager();

/**
 * Register IPC handlers for engine communication
 */
export function registerEngineHandlers(): void {
  ipcMain.handle('engine:initialize', async (_event, engineId: string, enginePath: string) => {
    try {
      // Resolve relative path from app root
      const resolvedPath = path.isAbsolute(enginePath) 
        ? enginePath 
        : path.join(process.cwd(), enginePath);
      
      await engineManager.initializeEngine(engineId, resolvedPath);
      return { success: true };
    } catch (error) {
      console.error('Engine initialization failed:', error);
      throw error;
    }
  });

  ipcMain.handle('engine:setPosition', async (_event, engineId: string, fen: string, moves?: string[]) => {
    await engineManager.setPosition(engineId, fen, moves);
  });

  ipcMain.handle('engine:getBestMove', async (_event, engineId: string, timeMs: number) => {
    return await engineManager.getBestMove(engineId, timeMs);
  });

  ipcMain.handle('engine:getEvaluation', async (_event, engineId: string, depth: number) => {
    return await engineManager.getEvaluation(engineId, depth);
  });

  ipcMain.handle('engine:setOptions', async (_event, engineId: string, options: Record<string, string | number>) => {
    await engineManager.setOptions(engineId, options);
  });

  ipcMain.handle('engine:shutdown', async (_event, engineId: string) => {
    await engineManager.shutdown(engineId);
  });
}

/**
 * Cleanup all engines on app quit
 */
export async function cleanupEngines(): Promise<void> {
  await engineManager.shutdownAll();
}
