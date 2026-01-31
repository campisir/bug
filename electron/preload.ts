const { contextBridge, ipcRenderer } = require('electron');

export interface EngineMove {
  from: string;
  to: string;
  promotion?: string;
  drop?: string;
}

export interface EngineInfo {
  depth: number;
  score: number;
  isMate: boolean;
  pv: string[];
  nodes: number;
  time: number;
}

/**
 * Preload Script
 * 
 * Exposes safe IPC methods to the renderer process.
 * This runs in a context that has access to both Node.js and browser APIs.
 */

export interface ElectronAPI {
  engine: {
    initialize: (engineId: string, enginePath: string) => Promise<void>;
    setPosition: (engineId: string, fen: string, moves?: string[]) => Promise<void>;
    getBestMove: (engineId: string, timeMs: number) => Promise<EngineMove>;
    getBestMoveWithSearchMoves: (engineId: string, timeMs: number, searchMoves: string[]) => Promise<EngineMove>;
    getEvaluation: (engineId: string, depth: number) => Promise<EngineInfo>;
    setOptions: (engineId: string, options: Record<string, string | number>) => Promise<void>;
    shutdown: (engineId: string) => Promise<void>;
  };
}

// Expose protected methods that allow the renderer process to use ipcRenderer
contextBridge.exposeInMainWorld('electronAPI', {
  engine: {
    initialize: (engineId: string, enginePath: string) => 
      ipcRenderer.invoke('engine:initialize', engineId, enginePath),
    
    setPosition: (engineId: string, fen: string, moves?: string[]) => 
      ipcRenderer.invoke('engine:setPosition', engineId, fen, moves),
    
    getBestMove: (engineId: string, timeMs: number) => 
      ipcRenderer.invoke('engine:getBestMove', engineId, timeMs),

    getBestMoveWithSearchMoves: (engineId: string, timeMs: number, searchMoves: string[]) =>
      ipcRenderer.invoke('engine:getBestMoveWithSearchMoves', engineId, timeMs, searchMoves),
    
    getEvaluation: (engineId: string, depth: number) =>
      ipcRenderer.invoke('engine:getEvaluation', engineId, depth),
    
    setOptions: (engineId: string, options: Record<string, string | number>) => 
      ipcRenderer.invoke('engine:setOptions', engineId, options),
    
    shutdown: (engineId: string) => 
      ipcRenderer.invoke('engine:shutdown', engineId),
  },
});
