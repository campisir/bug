import { spawn } from 'child_process';
export class FairyStockfishEngine {
    constructor(enginePath) {
        this.process = null;
        this.outputBuffer = '';
        this.pendingCallbacks = new Map();
        this.analysisCallback = null;
        this.enginePath = enginePath;
    }
    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                this.process = spawn(this.enginePath);
                if (!this.process.stdout || !this.process.stderr) {
                    reject(new Error('Failed to create engine process streams'));
                    return;
                }
                this.process.stdout.on('data', (data) => {
                    this.handleOutput(String(data));
                });
                this.process.stderr.on('data', (data) => {
                    console.error('Engine stderr:', String(data));
                });
                this.process.on('exit', (code) => {
                    console.log(`Engine process exited with code ${code}`);
                });
                this.sendCommand('uci');
                this.waitForResponse('uciok', () => {
                    resolve();
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    async setPosition(fen, moves = []) {
        const movesStr = moves.length > 0 ? ` moves ${moves.join(' ')}` : '';
        this.sendCommand(`position fen ${fen}${movesStr}`);
        await this.isReady();
    }
    async getBestMove(timeMs) {
        return new Promise((resolve, reject) => {
            this.sendCommand(`go movetime ${timeMs}`);
            this.waitForResponse('bestmove', (response) => {
                const match = response.match(/bestmove\s+(\S+)/);
                if (match) {
                    const moveStr = match[1];
                    resolve(this.parseMove(moveStr));
                }
                else {
                    reject(new Error('Failed to parse best move'));
                }
            });
        });
    }
    startAnalysis(callback) {
        this.analysisCallback = callback;
        this.sendCommand('go infinite');
    }
    async stopAnalysis() {
        return new Promise((resolve) => {
            this.sendCommand('stop');
            this.analysisCallback = null;
            this.waitForResponse('bestmove', () => {
                resolve();
            });
        });
    }
    sendCommand(command) {
        if (this.process && this.process.stdin) {
            this.process.stdin.write(command + '\n');
            console.log('→ Engine:', command);
        }
    }
    async shutdown() {
        return new Promise((resolve) => {
            if (this.process) {
                this.sendCommand('quit');
                setTimeout(() => {
                    if (this.process) {
                        this.process.kill();
                    }
                    resolve();
                }, 1000);
            }
            else {
                resolve();
            }
        });
    }
    async isReady() {
        return new Promise((resolve) => {
            this.sendCommand('isready');
            this.waitForResponse('readyok', () => {
                resolve(true);
            });
        });
    }
    async setOptions(options) {
        for (const [name, value] of Object.entries(options)) {
            this.sendCommand(`setoption name ${name} value ${value}`);
        }
        await this.isReady();
    }
    handleOutput(data) {
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
    processLine(line) {
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
    waitForResponse(trigger, callback) {
        this.pendingCallbacks.set(trigger, callback);
    }
    parseMove(moveStr) {
        if (moveStr.includes('@')) {
            const [piece, square] = moveStr.split('@');
            return { from: '', to: square, drop: piece };
        }
        const from = moveStr.substring(0, 2);
        const to = moveStr.substring(2, 4);
        const promotion = moveStr.length > 4 ? moveStr[4] : undefined;
        return { from, to, promotion };
    }
    parseInfo(line) {
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
    extractValue(line, key) {
        const regex = new RegExp(`${key}\\s+([-\\d]+)`);
        const match = line.match(regex);
        return match ? parseInt(match[1], 10) : null;
    }
}
