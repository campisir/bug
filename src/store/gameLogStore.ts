import { create } from 'zustand';

export type LogCategory = 
  | 'moves'
  | 'stalls'
  | 'stall_details'
  | 'requests'
  | 'captures'
  | 'game_events'
  | 'chat';

export interface GameLogEntry {
  timestamp: number; // Milliseconds since game start
  category: LogCategory;
  message: string;
  actor?: 'Player' | 'Bot 1' | 'Bot 2' | 'Partner';
}

interface GameLogState {
  logs: GameLogEntry[];
  gameStartTime: number | null;
  
  // Actions
  startLogging: () => void;
  addLog: (category: LogCategory, message: string, actor?: GameLogEntry['actor']) => void;
  clearLogs: () => void;
  getFilteredLogs: (categories: LogCategory[]) => GameLogEntry[];
  formatLog: (categories: LogCategory[]) => string;
}

export const useGameLogStore = create<GameLogState>((set, get) => ({
  logs: [],
  gameStartTime: null,

  startLogging: () => {
    set({ 
      gameStartTime: Date.now(),
      logs: []
    });
  },

  addLog: (category: LogCategory, message: string, actor?: GameLogEntry['actor']) => {
    const { gameStartTime } = get();
    if (gameStartTime === null) return;

    const timestamp = Date.now() - gameStartTime;
    set((state) => ({
      logs: [...state.logs, { timestamp, category, message, actor }]
    }));
  },

  clearLogs: () => {
    set({ logs: [], gameStartTime: null });
  },

  getFilteredLogs: (categories: LogCategory[]) => {
    const { logs } = get();
    if (categories.length === 0) return logs;
    return logs.filter(log => categories.includes(log.category));
  },

  formatLog: (categories: LogCategory[]) => {
    const filteredLogs = get().getFilteredLogs(categories);
    
    return filteredLogs.map(log => {
      const minutes = Math.floor(log.timestamp / 60000);
      const seconds = Math.floor((log.timestamp % 60000) / 1000);
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      if (log.actor) {
        return `[${log.actor}]: ${log.message} (${timeStr})`;
      } else {
        return `${log.message} (${timeStr})`;
      }
    }).join('\n');
  },
}));
