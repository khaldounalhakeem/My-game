// Stockfish 19 (WASM, single-threaded) wrapper speaking UCI over a Web Worker.
// Scores are always reported from White's point of view.

const ENGINE_URL = 'vendor/stockfish/stockfish-19-lite-single.js';

export const MATE = 100000;

export function scoreToCp(line) {
  // Collapse {cp, mate} into a single sortable number (White's view).
  if (line.mate != null) return line.mate > 0 ? MATE - line.mate : -MATE - line.mate;
  return line.cp;
}

export function formatScore(line) {
  if (!line) return '0.0';
  if (line.mate != null) {
    if (line.mate === 0) return '#';
    return (line.mate > 0 ? '' : '-') + 'M' + Math.abs(line.mate);
  }
  const v = line.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(Math.abs(v) >= 10 ? 0 : 1);
}

export class Engine {
  constructor(name = 'engine') {
    this.name = name;
    this.queue = [];
    this.job = null;
    this.ready = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(ENGINE_URL);
      } catch (e) { reject(e); return; }
      this.worker.onerror = e => { console.error('Engine error', e); reject(e); };
      this.worker.onmessage = e => this._onLine(String(e.data));
      this._readyResolve = resolve;
      this.worker.postMessage('uci');
      this.worker.postMessage('setoption name Hash value 32');
      this.worker.postMessage('isready');
    });
  }

  _onLine(line) {
    if (line === 'readyok' && this._readyResolve) { this._readyResolve(); this._readyResolve = null; return; }
    const job = this.job;
    if (!job) return;
    if (line.startsWith('info') && line.includes(' pv ')) {
      const m = line.match(/depth (\d+).*?(?:multipv (\d+))?.*?score (cp|mate) (-?\d+)(?: (?:upperbound|lowerbound))?.*? pv (.+)$/);
      if (!m) return;
      const depth = +m[1];
      const idx = (+(line.match(/multipv (\d+)/) || [0, 1])[1]) - 1;
      let val = +m[4];
      if (job.blackToMove) val = -val;
      const entry = { depth, pv: m[5].trim().split(' ') };
      if (m[3] === 'mate') entry.mate = val; else entry.cp = val;
      const nodes = line.match(/ nodes (\d+)/);
      if (nodes) entry.nodes = +nodes[1];
      job.lines[idx] = entry;
      job.depth = Math.max(job.depth, depth);
      if (job.onInfo && (idx === job.multipv - 1 || job.multipv === 1)) {
        job.onInfo(this._result(job));
      }
    } else if (line.startsWith('bestmove')) {
      job.bestmove = line.split(' ')[1];
      this.job = null;
      job.resolve(this._result(job));
      this._next();
    }
  }

  _result(job) {
    return { lines: job.lines.filter(Boolean).slice(0, job.multipv), depth: job.depth, bestmove: job.bestmove || (job.lines[0] && job.lines[0].pv[0]), fen: job.fen };
  }

  _next() {
    if (this.job || !this.queue.length) return;
    const job = this.queue.shift();
    if (job.cancelled) { job.resolve(null); return this._next(); }
    this.job = job;
    const w = this.worker;
    w.postMessage('setoption name MultiPV value ' + job.multipv);
    w.postMessage('setoption name Skill Level value ' + (job.skill ?? 20));
    w.postMessage('position fen ' + job.fen);
    let go = 'go';
    if (job.depth_) go += ' depth ' + job.depth_;
    if (job.movetime) go += ' movetime ' + job.movetime;
    if (job.nodes) go += ' nodes ' + job.nodes;
    if (job.infinite) go = 'go infinite';
    w.postMessage(go);
  }

  /** Analyse a position. opts: depth, movetime, nodes, multipv, skill, infinite, onInfo */
  analyse(fen, opts = {}) {
    return this.ready.then(() => new Promise(resolve => {
      const job = {
        fen, resolve, lines: [], depth: 0,
        depth_: opts.depth, movetime: opts.movetime, nodes: opts.nodes, infinite: opts.infinite,
        multipv: opts.multipv || 1, skill: opts.skill, onInfo: opts.onInfo,
        blackToMove: fen.split(' ')[1] === 'b',
      };
      if (opts.exclusive) this.stopAll();
      this.queue.push(job);
      this._next();
    }));
  }

  /** Cancel queued jobs and stop the running one (it resolves with partial results). */
  stopAll() {
    this.queue.forEach(j => { j.cancelled = true; });
    if (this.job) this.worker.postMessage('stop');
  }

  newGame() { this.ready.then(() => this.worker.postMessage('ucinewgame')); }
}

let shared = {};
export function getEngine(name) {
  if (!shared[name]) shared[name] = new Engine(name);
  return shared[name];
}
