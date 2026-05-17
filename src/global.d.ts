import type { ElectronAPI } from '../electron/preload.cts';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
