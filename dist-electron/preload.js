"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { contextBridge, ipcRenderer } = require('electron');
// Expose protected methods that allow the renderer process to use ipcRenderer
contextBridge.exposeInMainWorld('electronAPI', {
    engine: {
        initialize: (engineId, enginePath) => ipcRenderer.invoke('engine:initialize', engineId, enginePath),
        setPosition: (engineId, fen, moves) => ipcRenderer.invoke('engine:setPosition', engineId, fen, moves),
        getBestMove: (engineId, timeMs) => ipcRenderer.invoke('engine:getBestMove', engineId, timeMs),
        setOptions: (engineId, options) => ipcRenderer.invoke('engine:setOptions', engineId, options),
        shutdown: (engineId) => ipcRenderer.invoke('engine:shutdown', engineId),
    },
});
