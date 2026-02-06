import { FairyStockfishEngine } from '../engines/FairyStockfishEngine';
import type { IChessEngine, EngineMove } from '../types';

/**
 * Engine Pool Manager
 * 
 * Manages a pool of Fairy Stockfish engine instances to handle concurrent game requests.
 * Implements resource pooling to avoid spawning too many processes.
 */
export class EnginePool {
  private availableEngines: FairyStockfishEngine[] = [];
  private busyEngines: Set<FairyStockfishEngine> = new Set();
  private readonly enginePath: string;
  private readonly maxEngines: number;
  private waitingQueue: Array<(engine: FairyStockfishEngine) => void> = [];
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(enginePath: string, maxEngines: number = 20) {
    this.enginePath = enginePath;
    this.maxEngines = maxEngines;
    
    // Cleanup idle engines every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleEngines();
    }, 5 * 60 * 1000);
  }

  /**
   * Acquire an engine from the pool
   */
  async acquireEngine(): Promise<FairyStockfishEngine> {
    // Check if we have available engines
    if (this.availableEngines.length > 0) {
      const engine = this.availableEngines.pop()!;
      this.busyEngines.add(engine);
      console.log(`[EnginePool] Acquired existing engine. Available: ${this.availableEngines.length}, Busy: ${this.busyEngines.size}`);
      return engine;
    }

    // Check if we can create a new engine
    const totalEngines = this.availableEngines.length + this.busyEngines.size;
    if (totalEngines < this.maxEngines) {
      const engine = await this.createEngine();
      this.busyEngines.add(engine);
      console.log(`[EnginePool] Created new engine. Total: ${totalEngines + 1}/${this.maxEngines}`);
      return engine;
    }

    // Wait for an engine to become available
    console.log(`[EnginePool] Max engines reached. Waiting in queue. Queue size: ${this.waitingQueue.length + 1}`);
    return this.waitForEngine();
  }

  /**
   * Release an engine back to the pool
   */
  releaseEngine(engine: FairyStockfishEngine): void {
    this.busyEngines.delete(engine);

    // If someone is waiting, give them the engine immediately
    if (this.waitingQueue.length > 0) {
      const resolve = this.waitingQueue.shift()!;
      this.busyEngines.add(engine);
      resolve(engine);
      console.log(`[EnginePool] Engine reassigned to waiting request. Queue size: ${this.waitingQueue.length}`);
    } else {
      this.availableEngines.push(engine);
      console.log(`[EnginePool] Engine released. Available: ${this.availableEngines.length}, Busy: ${this.busyEngines.size}`);
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      available: this.availableEngines.length,
      busy: this.busyEngines.size,
      total: this.availableEngines.length + this.busyEngines.size,
      maxEngines: this.maxEngines,
      queueSize: this.waitingQueue.length,
    };
  }

  /**
   * Shutdown all engines and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    console.log('[EnginePool] Shutting down all engines...');
    
    const allEngines = [...this.availableEngines, ...Array.from(this.busyEngines)];
    await Promise.all(allEngines.map(engine => engine.shutdown()));
    
    this.availableEngines = [];
    this.busyEngines.clear();
    this.waitingQueue = [];
    
    console.log('[EnginePool] All engines shut down');
  }

  // Private methods

  private async createEngine(): Promise<FairyStockfishEngine> {
    const engine = new FairyStockfishEngine(this.enginePath);
    await engine.initialize();
    return engine;
  }

  private waitForEngine(): Promise<FairyStockfishEngine> {
    return new Promise((resolve) => {
      this.waitingQueue.push(resolve);
    });
  }

  private async cleanupIdleEngines(): Promise<void> {
    const now = new Date();
    const idleThreshold = 10 * 60 * 1000; // 10 minutes
    const minEngines = 2; // Keep at least 2 engines warm

    if (this.availableEngines.length <= minEngines) {
      return;
    }

    const enginesToKeep: FairyStockfishEngine[] = [];
    const enginesToShutdown: FairyStockfishEngine[] = [];

    for (const engine of this.availableEngines) {
      const idleTime = now.getTime() - engine.getLastUsed().getTime();
      
      if (idleTime > idleThreshold && enginesToKeep.length >= minEngines) {
        enginesToShutdown.push(engine);
      } else {
        enginesToKeep.push(engine);
      }
    }

    if (enginesToShutdown.length > 0) {
      console.log(`[EnginePool] Cleaning up ${enginesToShutdown.length} idle engines`);
      
      await Promise.all(enginesToShutdown.map(engine => engine.shutdown()));
      this.availableEngines = enginesToKeep;
    }
  }
}

// Singleton instance
let enginePool: EnginePool | null = null;

export function initializeEnginePool(enginePath: string, maxEngines: number = 20): EnginePool {
  if (enginePool) {
    throw new Error('Engine pool already initialized');
  }
  
  enginePool = new EnginePool(enginePath, maxEngines);
  console.log(`[EnginePool] Initialized with max ${maxEngines} engines`);
  return enginePool;
}

export function getEnginePool(): EnginePool {
  if (!enginePool) {
    throw new Error('Engine pool not initialized. Call initializeEnginePool first.');
  }
  return enginePool;
}
