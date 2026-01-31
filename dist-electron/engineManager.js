import { ipcMain } from 'electron';
import path from 'path';
import { FairyStockfishEngine } from './FairyStockfishEngine.js';
/**
 * Engine Manager
 *
 * Manages chess engine instances in the main process.
 * Handles IPC communication from the renderer process.
 */
class EngineManager {
    constructor() {
        this.engines = new Map();
    }
    async initializeEngine(engineId, enginePath) {
        // If engine already exists, shutdown first
        if (this.engines.has(engineId)) {
            await this.engines.get(engineId)?.shutdown();
        }
        const engine = new FairyStockfishEngine(enginePath);
        await engine.initialize();
        this.engines.set(engineId, engine);
    }
    async setPosition(engineId, fen, moves) {
        const engine = this.engines.get(engineId);
        if (!engine)
            throw new Error(`Engine ${engineId} not initialized`);
        await engine.setPosition(fen, moves);
    }
    async getBestMove(engineId, timeMs) {
        const engine = this.engines.get(engineId);
        if (!engine)
            throw new Error(`Engine ${engineId} not initialized`);
        return await engine.getBestMove(timeMs);
    }
    async getBestMoveWithSearchMoves(engineId, timeMs, searchMoves) {
        const engine = this.engines.get(engineId);
        if (!engine)
            throw new Error(`Engine ${engineId} not initialized`);
        return await engine.getBestMoveWithSearchMoves(timeMs, searchMoves);
    }
    async getEvaluation(engineId, depth) {
        const engine = this.engines.get(engineId);
        if (!engine)
            throw new Error(`Engine ${engineId} not initialized`);
        return await engine.getEvaluation(depth);
    }
    async setOptions(engineId, options) {
        const engine = this.engines.get(engineId);
        if (!engine)
            throw new Error(`Engine ${engineId} not initialized`);
        const resolvedOptions = { ...options };
        if (typeof resolvedOptions.VariantPath === 'string') {
            const variantPath = resolvedOptions.VariantPath;
            resolvedOptions.VariantPath = path.isAbsolute(variantPath)
                ? variantPath
                : path.join(process.cwd(), variantPath);
        }
        await engine.setOptions(resolvedOptions);
    }
    async shutdown(engineId) {
        const engine = this.engines.get(engineId);
        if (!engine)
            return;
        await engine.shutdown();
        this.engines.delete(engineId);
    }
    async shutdownAll() {
        const shutdownPromises = Array.from(this.engines.keys()).map(id => this.shutdown(id));
        await Promise.all(shutdownPromises);
    }
}
const engineManager = new EngineManager();
/**
 * Register IPC handlers for engine communication
 */
export function registerEngineHandlers() {
    ipcMain.handle('engine:initialize', async (_event, engineId, enginePath) => {
        try {
            // Resolve relative path from app root
            const resolvedPath = path.isAbsolute(enginePath)
                ? enginePath
                : path.join(process.cwd(), enginePath);
            await engineManager.initializeEngine(engineId, resolvedPath);
            return { success: true };
        }
        catch (error) {
            console.error('Engine initialization failed:', error);
            throw error;
        }
    });
    ipcMain.handle('engine:setPosition', async (_event, engineId, fen, moves) => {
        await engineManager.setPosition(engineId, fen, moves);
    });
    ipcMain.handle('engine:getBestMove', async (_event, engineId, timeMs) => {
        return await engineManager.getBestMove(engineId, timeMs);
    });
    ipcMain.handle('engine:getBestMoveWithSearchMoves', async (_event, engineId, timeMs, searchMoves) => {
        return await engineManager.getBestMoveWithSearchMoves(engineId, timeMs, searchMoves);
    });
    ipcMain.handle('engine:getEvaluation', async (_event, engineId, depth) => {
        return await engineManager.getEvaluation(engineId, depth);
    });
    ipcMain.handle('engine:setOptions', async (_event, engineId, options) => {
        await engineManager.setOptions(engineId, options);
    });
    ipcMain.handle('engine:shutdown', async (_event, engineId) => {
        await engineManager.shutdown(engineId);
    });
}
/**
 * Cleanup all engines on app quit
 */
export async function cleanupEngines() {
    await engineManager.shutdownAll();
}
