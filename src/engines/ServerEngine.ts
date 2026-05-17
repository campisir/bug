import { io, Socket } from 'socket.io-client';
import type { IChessEngine, EngineMove, EngineInfo } from './IChessEngine';

/**
 * Server Engine Adapter (Web mode)
 *
 * Implements IChessEngine by delegating move calculations to a Fairy Stockfish
 * instance running in the server's engine pool via Socket.IO.
 * All three ServerEngine instances created per game share a single socket.
 */

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket || !sharedSocket.connected) {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    sharedSocket = io(apiUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    sharedSocket.on('connect', () => {
      console.log('[ServerEngine] Connected to engine server');
    });

    sharedSocket.on('disconnect', () => {
      console.log('[ServerEngine] Disconnected from engine server');
    });
  }

  return sharedSocket;
}

export class ServerEngine implements IChessEngine {
  private currentFen: string = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  private currentMoves: string[] = [];

  async initialize(): Promise<void> {
    // Ensure socket is connected; actual engine lifecycle is managed server-side
    const socket = getSocket();
    if (!socket.connected) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server connection timeout')), 10000);
        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.once('connect_error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }
  }

  async setPosition(fen: string, moves?: string[]): Promise<void> {
    this.currentFen = fen;
    this.currentMoves = moves ?? [];
  }

  async getBestMove(timeMs: number): Promise<EngineMove> {
    return this.requestMove(timeMs);
  }

  async getBestMoveWithSearchMoves(timeMs: number, searchMoves: string[]): Promise<EngineMove> {
    return this.requestMove(timeMs, searchMoves);
  }

  private requestMove(timeMs: number, searchMoves?: string[]): Promise<EngineMove> {
    return new Promise((resolve, reject) => {
      const socket = getSocket();
      const requestId = crypto.randomUUID();

      const timeout = setTimeout(() => {
        socket.off('engineMoveResult', handler);
        reject(new Error(`Engine move timeout after ${timeMs + 10000}ms`));
      }, timeMs + 10000);

      const handler = (data: { requestId: string; move?: EngineMove; error?: string }) => {
        if (data.requestId !== requestId) return;
        clearTimeout(timeout);
        socket.off('engineMoveResult', handler);

        if (data.error || !data.move) {
          reject(new Error(data.error ?? 'No move returned from server'));
        } else {
          resolve(data.move);
        }
      };

      socket.on('engineMoveResult', handler);
      socket.emit('getEngineMove', {
        requestId,
        fen: this.currentFen,
        moves: this.currentMoves,
        timeMs,
        ...(searchMoves?.length ? { searchMoves } : {}),
      });
    });
  }

  async getEvaluation(_depth: number): Promise<EngineInfo> {
    // Not implemented for web mode; return a stub
    return { depth: 0, score: 0, isMate: false, pv: [], nodes: 0, time: 0 };
  }

  startAnalysis(_callback: (info: EngineInfo) => void): void {
    console.warn('[ServerEngine] Analysis not implemented in web mode');
  }

  async stopAnalysis(): Promise<void> {}

  sendCommand(_command: string): void {}

  async shutdown(): Promise<void> {
    // Individual engines don't own the socket; it's shared
  }

  async isReady(): Promise<boolean> {
    return sharedSocket?.connected ?? false;
  }

  async setOptions(_options: Record<string, string | number>): Promise<void> {
    // Options are configured server-side
  }
}

/** Call this when the user navigates away / the app unmounts to clean up the socket. */
export function disconnectServerEngine(): void {
  sharedSocket?.disconnect();
  sharedSocket = null;
}
