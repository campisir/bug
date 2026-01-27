import { spawn, ChildProcess } from 'child_process';

export interface EngineMove {
  from: string;
  to: string;
  promotion?: string;
  drop?: string;
}

export interface EngineInfo {
  depth: number;
  score: number;
  isMate: boolean; // true if score is mate-in-X, false if centipawn eval
  pv: string[];
  nodes: number;
  time: number;
}

export interface IChessEngine {
  initialize(): Promise<void>;
  setPosition(fen: string, moves?: string[]): Promise<void>;
  getBestMove(timeMs: number): Promise<EngineMove>;
  getEvaluation(depth: number): Promise<EngineInfo>;
  startAnalysis(callback: (info: EngineInfo) => void): void;
  stopAnalysis(): Promise<void>;
  sendCommand(command: string): void;
  shutdown(): Promise<void>;
  isReady(): Promise<boolean>;
  setOptions(options: Record<string, string | number>): Promise<void>;
}

export class FairyStockfishEngine implements IChessEngine {
  private process: ChildProcess | null = null;
  private enginePath: string;
  private outputBuffer: string = '';
  private pendingCallbacks: Map<string, (response: string) => void> = new Map();
  private analysisCallback: ((info: EngineInfo) => void) | null = null;

  constructor(enginePath: string) {
    this.enginePath = enginePath;
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.enginePath);

        if (!this.process.stdout || !this.process.stderr) {
          reject(new Error('Failed to create engine process streams'));
          return;
        }

        this.process.stdout.on('data', (data: unknown) => {
          this.handleOutput(String(data));
        });

        this.process.stderr.on('data', (data: unknown) => {
          console.error('Engine stderr:', String(data));
        });

        this.process.on('exit', (code: number | null) => {
          console.log(`Engine process exited with code ${code}`);
        });

        this.sendCommand('uci');
        
        this.waitForResponse('uciok', () => {
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async setPosition(fen: string, moves: string[] = []): Promise<void> {
    const movesStr = moves.length > 0 ? ` moves ${moves.join(' ')}` : '';
    console.log('[UCI] Setting position:', fen);
    if (moves.length > 0) {
      console.log('[UCI] With moves:', moves);
    }
    this.sendCommand(`position fen ${fen}${movesStr}`);
    await this.isReady();
  }

  async getBestMove(timeMs: number): Promise<EngineMove> {
    return new Promise((resolve, reject) => {
      console.log(`[UCI] Requesting best move (${timeMs}ms)`);
      this.sendCommand(`go movetime ${timeMs}`);
      
      this.waitForResponse('bestmove', (response) => {
        const match = response.match(/bestmove\s+(\S+)/);
        if (match) {
          const moveStr = match[1];
          const parsedMove = this.parseMove(moveStr);
          console.log('[UCI] Best move received:', moveStr, '→', parsedMove);
          resolve(parsedMove);
        } else {
          reject(new Error('Failed to parse best move'));
        }
      });
    });
  }

  async getEvaluation(depth: number): Promise<EngineInfo> {
    return new Promise((resolve, reject) => {
      let lastInfo: EngineInfo | null = null;
      
      const infoHandler = (info: EngineInfo) => {
        lastInfo = info;
      };
      
      // Temporarily capture info updates
      const originalCallback = this.analysisCallback;
      this.analysisCallback = infoHandler;
      
      this.sendCommand(`go depth ${depth}`);
      
      this.waitForResponse('bestmove', () => {
        this.analysisCallback = originalCallback;
        if (lastInfo) {
          console.log('[UCI] Evaluation at depth', depth, '→ score:', lastInfo.score);
          resolve(lastInfo);
        } else {
          reject(new Error('No evaluation received'));
        }
      });
    });
  }

  startAnalysis(callback: (info: EngineInfo) => void): void {
    this.analysisCallback = callback;
    this.sendCommand('go infinite');
  }

  async stopAnalysis(): Promise<void> {
    return new Promise((resolve) => {
      this.sendCommand('stop');
      this.analysisCallback = null;
      
      this.waitForResponse('bestmove', () => {
        resolve();
      });
    });
  }

  sendCommand(command: string): void {
    if (this.process && this.process.stdin) {
      this.process.stdin.write(command + '\n');
      console.log('→ Engine:', command);
    }
  }

  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (this.process) {
        this.sendCommand('quit');
        
        setTimeout(() => {
          if (this.process) {
            this.process.kill();
          }
          resolve();
        }, 1000);
      } else {
        resolve();
      }
    });
  }

  async isReady(): Promise<boolean> {
    return new Promise((resolve) => {
      this.sendCommand('isready');
      this.waitForResponse('readyok', () => {
        resolve(true);
      });
    });
  }

  async setOptions(options: Record<string, string | number>): Promise<void> {
    console.log('[UCI] Setting options:', options);
    for (const [name, value] of Object.entries(options)) {
      this.sendCommand(`setoption name ${name} value ${value}`);
    }
    await this.isReady();
  }

  private handleOutput(data: string): void {
    this.outputBuffer += data;
    const lines = this.outputBuffer.split('\n');
    
    this.outputBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        console.log('← Engine:', trimmedLine);
        this.processLine(trimmedLine);
      }
    }
  }

  private processLine(line: string): void {
    if (line.startsWith('info') && this.analysisCallback) {
      const info = this.parseInfo(line);
      if (info) {
        this.analysisCallback(info);
      }
    }

    for (const [trigger, callback] of this.pendingCallbacks.entries()) {
      if (line.includes(trigger)) {
        callback(line);
        this.pendingCallbacks.delete(trigger);
        break;
      }
    }
  }

  private waitForResponse(trigger: string, callback: (response: string) => void): void {
    this.pendingCallbacks.set(trigger, callback);
  }

  private parseMove(moveStr: string): EngineMove {
    if (moveStr.includes('@')) {
      const [piece, square] = moveStr.split('@');
      return { from: '', to: square, drop: piece };
    }

    const from = moveStr.substring(0, 2);
    const to = moveStr.substring(2, 4);
    const promotion = moveStr.length > 4 ? moveStr[4] : undefined;

    return { from, to, promotion };
  }

  private parseInfo(line: string): EngineInfo | null {
    const depth = this.extractValue(line, 'depth');
    const cpScore = this.extractValue(line, 'score cp');
    const mateScore = this.extractValue(line, 'score mate');
    const nodes = this.extractValue(line, 'nodes');
    const time = this.extractValue(line, 'time');
    const pvMatch = line.match(/pv (.+)$/);
    const pv = pvMatch ? pvMatch[1].split(' ') : [];

    const isMate = mateScore !== null;
    const score = isMate ? mateScore : cpScore;

    if (depth !== null && score !== null) {
      return {
        depth,
        score,
        isMate,
        nodes: nodes || 0,
        time: time || 0,
        pv,
      };
    }

    return null;
  }

  private extractValue(line: string, key: string): number | null {
    const regex = new RegExp(`${key}\\s+([-\\d]+)`);
    const match = line.match(regex);
    return match ? parseInt(match[1], 10) : null;
  }
}
