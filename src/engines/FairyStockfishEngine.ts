import { spawn, ChildProcess } from 'child_process';
import type { IChessEngine, EngineMove, EngineInfo } from './IChessEngine';

/**
 * Fairy Stockfish Engine Adapter
 * 
 * Implements UCI protocol communication with Fairy Stockfish.
 * Fairy Stockfish supports bughouse chess natively.
 */
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
        // Spawn the Fairy Stockfish process
        this.process = spawn(this.enginePath);

        if (!this.process.stdout || !this.process.stderr) {
          reject(new Error('Failed to create engine process streams'));
          return;
        }

        // Capture all UCI output to log available options
        const uciLines: string[] = [];
        const originalHandleOutput = this.handleOutput.bind(this);
        this.handleOutput = (data: string) => {
          uciLines.push(data);
          originalHandleOutput(data);
        };

        // Handle stdout data
        this.process.stdout.on('data', (data: unknown) => {
          this.handleOutput(String(data));
        });

        // Handle stderr
        this.process.stderr.on('data', (data: unknown) => {
          console.error('Engine stderr:', String(data));
        });

        // Handle process exit
        this.process.on('exit', (code: number | null) => {
          console.log(`Engine process exited with code ${code}`);
        });

        // Send UCI initialization commands
        this.sendCommand('uci');
        
        // Wait for uciok response
        this.waitForResponse('uciok', () => {
          // Log all UCI options for research
          console.log('=== FAIRY-STOCKFISH UCI OPTIONS ===');
          const allOutput = uciLines.join('');
          const optionLines = allOutput.split('\n').filter(line => line.includes('option name'));
          optionLines.forEach(line => console.log(line.trim()));
          console.log('=== END UCI OPTIONS ===');
          
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async setPosition(fen: string, moves: string[] = []): Promise<void> {
    const movesStr = moves.length > 0 ? ` moves ${moves.join(' ')}` : '';
    this.sendCommand(`position fen ${fen}${movesStr}`);
    await this.isReady();
  }

  async getBestMove(timeMs: number): Promise<EngineMove> {
    return new Promise((resolve, reject) => {
      this.sendCommand(`go movetime ${timeMs}`);
      
      this.waitForResponse('bestmove', (response) => {
        console.log('[ENGINE] Bestmove response:', response);
        const match = response.match(/bestmove\s+(\S+)/);
        if (match) {
          const moveStr = match[1];
          console.log('[ENGINE] Extracted move string:', JSON.stringify(moveStr));
          resolve(this.parseMove(moveStr));
        } else {
          reject(new Error('Failed to parse best move'));
        }
      });
    });
  }

  async getBestMoveWithSearchMoves(timeMs: number, searchMoves: string[]): Promise<EngineMove> {
    return new Promise((resolve, reject) => {
      const moves = searchMoves.filter(Boolean);
      const searchMovesPart = moves.length > 0 ? ` searchmoves ${moves.join(' ')}` : '';
      this.sendCommand(`go movetime ${timeMs}${searchMovesPart}`);

      this.waitForResponse('bestmove', (response) => {
        console.log('[ENGINE] Bestmove response:', response);
        const match = response.match(/bestmove\s+(\S+)/);
        if (match) {
          const moveStr = match[1];
          console.log('[ENGINE] Extracted move string:', JSON.stringify(moveStr));
          resolve(this.parseMove(moveStr));
        } else {
          reject(new Error('Failed to parse best move'));
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
    for (const [name, value] of Object.entries(options)) {
      this.sendCommand(`setoption name ${name} value ${value}`);
    }
    await this.isReady();
  }

  // Private helper methods

  private handleOutput(data: string): void {
    this.outputBuffer += data;
    const lines = this.outputBuffer.split('\n');
    
    // Keep the last incomplete line in the buffer
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
    // Handle info lines for analysis
    if (line.startsWith('info') && this.analysisCallback) {
      const info = this.parseInfo(line);
      if (info) {
        this.analysisCallback(info);
      }
    }

    // Check for pending callbacks
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
    console.log('[ENGINE] parseMove input:', JSON.stringify(moveStr), 'length:', moveStr.length);
    
    // Handle null/no move cases - check this FIRST
    if (!moveStr || moveStr === '(none)' || moveStr === '0000') {
      console.log('[ENGINE] Detected no-move case');
      return { from: '(none)', to: '(none)' };
    }

    // Now check for minimum length for valid moves
    if (moveStr.length < 4) {
      console.log('[ENGINE] Move string too short');
      return { from: '(none)', to: '(none)' };
    }

    // Handle piece drops (e.g., P@e4 for bughouse)
    if (moveStr.includes('@')) {
      const [piece, square] = moveStr.split('@');
      return { from: '', to: square, drop: piece };
    }

    // Standard move (e.g., e2e4 or e7e8q)
    const from = moveStr.substring(0, 2);
    const to = moveStr.substring(2, 4);
    const promotion = moveStr.length > 4 ? moveStr[4] : undefined;

    console.log('[ENGINE] Parsed as standard move:', { from, to, promotion });
    return { from, to, promotion };
  }

  private parseInfo(line: string): EngineInfo | null {
    const depth = this.extractValue(line, 'depth');
    const score = this.extractValue(line, 'score cp') || this.extractValue(line, 'score mate');
    const nodes = this.extractValue(line, 'nodes');
    const time = this.extractValue(line, 'time');
    const pvMatch = line.match(/pv (.+)$/);
    const pv = pvMatch ? pvMatch[1].split(' ') : [];

    if (depth !== null && score !== null) {
      return {
        depth,
        score,
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
