'use strict';
// ============================================================================
// Procedural audio (Web Audio): engine, boost, hits, horns, crowd, music
// ============================================================================

const Sound = {
  ctx: null, ready: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(comp);
    this.musicBus = ctx.createGain(); this.musicBus.connect(comp);
    this.crowdBus = ctx.createGain(); this.crowdBus.connect(comp);
    this.applyVolumes();
    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.initEngine(); this.initCrowd();
    // iOS unlock blip
    const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.0001; o.connect(g); g.connect(this.sfx); o.start(); o.stop(ctx.currentTime + 0.01);
    this.ready = true;
  },
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = Settings.master;
    this.sfx.gain.value = Settings.sfx;
    this.musicBus.gain.value = Settings.music * 0.5;
    this.crowdBus.gain.value = Settings.crowd;
  },
  now() { return this.ctx.currentTime; },

  initEngine() {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.sfx);
    o1.start(); o2.start();
    // boost hiss
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const bg = ctx.createGain(); bg.gain.value = 0;
    n.connect(bp); bp.connect(bg); bg.connect(this.sfx); n.start();
    // supersonic wind
    const w = ctx.createBufferSource(); w.buffer = this.noise; w.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'highpass'; wf.frequency.value = 2500;
    const wg = ctx.createGain(); wg.gain.value = 0;
    w.connect(wf); wf.connect(wg); wg.connect(this.sfx); w.start();
    this.eng = { o1, o2, lp, g, bg, bp, wg };
  },
  initCrowd() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0;
    n.connect(bp); bp.connect(g); g.connect(this.crowdBus); n.start();
    this.crowd = { g, bp, base: 0 };
  },
  setCrowd(level) { if (!this.ctx) return; this.crowd.base = level; this.crowd.g.gain.setTargetAtTime(level * 0.12, this.now(), 0.6); },
  cheer(amount, dur) {
    if (!this.ctx) return;
    const g = this.crowd.g.gain, t = this.now();
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.12 + amount * 0.35, t + 0.25);
    g.setTargetAtTime(this.crowd.base * 0.12, t + dur, 0.8);
    this.crowd.bp.frequency.setValueAtTime(900 + amount * 400, t);
  },

  updateCar(car, inGame) {
    if (!this.ready || !this.eng) return;
    const e = this.eng, t = this.now();
    if (!inGame || !car || car.demolished) { e.g.gain.setTargetAtTime(0, t, 0.1); e.bg.gain.setTargetAtTime(0, t, 0.05); e.wg.gain.setTargetAtTime(0, t, 0.1); return; }
    const sp = car.vel.length() / 2300;
    const thr = Math.abs(car.ctrl.throttle) + (car.boosting ? 1 : 0);
    const f = 45 + sp * 120 + (car.onGround ? 0 : 20);
    e.o1.frequency.setTargetAtTime(f, t, 0.05); e.o2.frequency.setTargetAtTime(f * 0.501, t, 0.05);
    e.lp.frequency.setTargetAtTime(300 + thr * 500 + sp * 900, t, 0.05);
    e.g.gain.setTargetAtTime(0.035 + thr * 0.03 + sp * 0.03, t, 0.05);
    e.bg.gain.setTargetAtTime(car.boosting ? 0.22 : 0, t, 0.03);
    e.bp.frequency.setTargetAtTime(700 + sp * 900, t, 0.05);
    e.wg.gain.setTargetAtTime(car.supersonic ? 0.06 : 0, t, 0.2);
  },

  // ---- one-shots ----
  tone(freq, dur, type, vol, slide, when) {
    const ctx = this.ctx, t = (when || this.now());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  noiseHit(dur, freq, vol, type, when, q) {
    const ctx = this.ctx, t = (when || this.now());
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return f;
  },
  play(name, opt) {
    if (!this.ready) return;
    const v = opt && opt.vol !== undefined ? opt.vol : 1;
    if (v < 0.02) return;
    switch (name) {
      case 'hit': { const s = clamp(opt.s, 0.1, 1.5); this.tone(120 + s * 40, 0.25, 'sine', 0.5 * s * v, 0.4); this.noiseHit(0.12, 1800 + s * 2000, 0.35 * s * v); if (s > 0.8) this.noiseHit(0.4, 600, 0.3 * v); break; }
      case 'bounce': this.tone(90, 0.18, 'sine', 0.25 * v, 0.5); this.noiseHit(0.08, 900, 0.12 * v); break;
      case 'jump': { const f = this.noiseHit(0.18, 600, 0.12 * v, 'bandpass'); f.frequency.exponentialRampToValueAtTime(2400, this.now() + 0.18); break; }
      case 'dodge': { const f = this.noiseHit(0.35, 400, 0.18 * v, 'bandpass'); f.frequency.exponentialRampToValueAtTime(3000, this.now() + 0.3); break; }
      case 'land': this.tone(70, 0.15, 'sine', 0.2 * v, 0.6); this.noiseHit(0.1, 500, 0.1 * v); break;
      case 'padSmall': this.tone(1200, 0.08, 'triangle', 0.08 * v, 1.5); break;
      case 'padBig': [0, 0.06, 0.12].forEach((d, i) => this.tone(660 * Math.pow(1.26, i), 0.18, 'triangle', 0.12 * v, 1.2, this.now() + d)); break;
      case 'demo': this.noiseHit(1.2, 500, 0.8 * v); this.tone(60, 0.9, 'sawtooth', 0.35 * v, 0.3); this.noiseHit(0.3, 3000, 0.3 * v, 'highpass'); break;
      case 'bump': this.tone(100, 0.2, 'square', 0.15 * v, 0.5); this.noiseHit(0.15, 1200, 0.25 * v); break;
      case 'horn': {
        const t = this.now();
        for (const [f, d] of [[220, 0], [277, 0], [330, 0], [440, 0]]) { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.09 * v, t + d + 0.05); g.gain.setValueAtTime(0.09 * v, t + 1.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 2); }
        this.noiseHit(1.5, 300, 0.5 * v);
        break;
      }
      case 'count': this.tone(520, 0.18, 'square', 0.12 * v); break;
      case 'go': this.tone(1040, 0.5, 'square', 0.14 * v); this.tone(780, 0.5, 'square', 0.08 * v); break;
      case 'click': this.tone(900, 0.04, 'triangle', 0.08 * v); break;
      case 'select': this.tone(600, 0.06, 'triangle', 0.1 * v, 1.6); break;
      case 'back': this.tone(500, 0.07, 'triangle', 0.08 * v, 0.6); break;
      case 'chat': this.tone(1500, 0.05, 'sine', 0.08 * v); this.tone(2000, 0.06, 'sine', 0.06 * v, 1, this.now() + 0.05); break;
      case 'award': this.tone(880, 0.12, 'triangle', 0.08 * v, 1.2); break;
      case 'item': [0, 0.07].forEach((d, i) => this.tone(900 + i * 400, 0.12, 'sine', 0.12 * v, 1, this.now() + d)); break;
      case 'itemuse': this.tone(300, 0.3, 'sawtooth', 0.12 * v, 3); break;
      case 'flipreset': [0, 0.05, 0.1].forEach((d, i) => this.tone(1000 + i * 300, 0.1, 'sine', 0.12 * v, 1, this.now() + d)); break;
      case 'levelup': [0, 0.1, 0.2, 0.3].forEach((d, i) => this.tone(523 * Math.pow(1.26, i), 0.25, 'triangle', 0.14 * v, 1, this.now() + d)); break;
      case 'whoosh': { const f = this.noiseHit(0.6, 300, 0.25 * v, 'bandpass'); f.frequency.exponentialRampToValueAtTime(2000, this.now() + 0.5); break; }
      case 'tile': this.noiseHit(0.3, 2500, 0.3 * v, 'highpass'); this.tone(200, 0.2, 'square', 0.1 * v, 0.5); break;
    }
  },

  // ---- music: simple synthwave loop with lookahead scheduler ----
  music: null,
  startMusic() {
    if (!this.ready || this.music) return;
    const ctx = this.ctx;
    const bpm = 112, step = 60 / bpm / 4;
    const prog = [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]];
    const m = { next: ctx.currentTime + 0.1, i: 0, timer: null };
    const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const note = (f, t, d, type, vol, cutoff) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = cutoff || 2000;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(lp); lp.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + d + 0.05);
    };
    const tick = () => {
      while (m.next < ctx.currentTime + 0.25) {
        const bar = Math.floor(m.i / 16) % 4, s = m.i % 16, ch = prog[bar], t = m.next;
        if (s % 2 === 0) note(mtof(ch[0] - 12), t, step * 1.8, 'sawtooth', 0.09, 500);
        note(mtof(ch[(s * 3) % 4] + 12), t, step * 0.9, 'square', 0.025, 2400);
        if (s % 4 === 0) { // kick
          const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
          g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.25);
        }
        if (s % 8 === 4) { const sN = ctx.createBufferSource(); sN.buffer = this.noise; const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); sN.connect(f); f.connect(g); g.connect(this.musicBus); sN.start(t, Math.random()); sN.stop(t + 0.2); }
        if (s % 2 === 1) { const sN = ctx.createBufferSource(); sN.buffer = this.noise; const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(0.025, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); sN.connect(f); f.connect(g); g.connect(this.musicBus); sN.start(t, Math.random()); sN.stop(t + 0.06); }
        if (s === 0) for (const n of ch) note(mtof(n + 12), t, step * 15, 'triangle', 0.018, 1800);
        m.next += step; m.i++;
      }
    };
    m.timer = setInterval(tick, 60); tick();
    this.music = m;
  },
  stopMusic() { if (this.music) { clearInterval(this.music.timer); this.music = null; } },

  // spatial volume helper for other cars' sounds
  distVol(pos) {
    if (!R.camera) return 1;
    const d = R.camera.position.distanceTo(pos);
    return clamp(1 - d / 7000, 0, 1);
  },
};
