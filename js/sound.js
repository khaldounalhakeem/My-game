// Board sounds: sampled move/capture clicks plus synthesized accents.
import { store } from './storage.js';

const files = {
  move: 'assets/sounds/Move.mp3',
  capture: 'assets/sounds/Capture.mp3',
  notify: 'assets/sounds/GenericNotify.mp3',
  lowtime: 'assets/sounds/LowTime.mp3',
  select: 'assets/sounds/Select.mp3',
  error: 'assets/sounds/Error.mp3',
  correct: 'assets/sounds/Confirmation.mp3',
};
const cache = {};
let ctx = null;

function audio(name) {
  if (!cache[name]) { cache[name] = new Audio(files[name]); cache[name].preload = 'auto'; }
  return cache[name];
}

function sample(name) {
  const a = audio(name).cloneNode();
  a.volume = store.settings.volume;
  a.play().catch(() => {});
}

function tone(freqs, dur = 0.12, type = 'sine', gain = 0.18) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      const start = t0 + i * dur * 0.8;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain * store.settings.volume, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(start); o.stop(start + dur + 0.02);
    });
  } catch { /* audio unavailable */ }
}

export const sound = {
  play(kind) {
    if (!store.settings.sound) return;
    switch (kind) {
      case 'move': return sample('move');
      case 'capture': return sample('capture');
      case 'castle': sample('move'); return setTimeout(() => sample('move'), 90);
      case 'check': sample('move'); return tone([880, 660], 0.09, 'triangle', 0.12);
      case 'promote': sample('move'); return tone([523, 659, 784], 0.08, 'triangle', 0.12);
      case 'start': return sample('notify');
      case 'end': return tone([392, 523, 659], 0.16, 'sine', 0.16);
      case 'win': return tone([523, 659, 784, 1047], 0.14, 'triangle', 0.15);
      case 'lose': return tone([440, 392, 330], 0.2, 'sine', 0.14);
      case 'lowtime': return sample('lowtime');
      case 'illegal': return sample('error');
      case 'correct': return sample('correct');
      case 'wrong': return tone([220, 180], 0.14, 'square', 0.06);
      case 'select': return sample('select');
      case 'premove': return tone([1200], 0.04, 'sine', 0.06);
    }
  },
  forMove(move, chessAfter) {
    if (chessAfter.isCheck()) this.play('check');
    else if (move.promotion) this.play('promote');
    else if (move.flags.includes('k') || move.flags.includes('q')) this.play('castle');
    else if (move.captured) this.play('capture');
    else this.play('move');
  },
  unlock() { Object.keys(files).forEach(audio); },
};
