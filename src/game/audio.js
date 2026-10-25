export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.next = {};
    this.noise = null;
  }

  unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.22;
  }

  can(name, gap) {
    const now = performance.now() / 1000;
    if (now < (this.next[name] ?? 0)) return false;
    this.next[name] = now + gap;
    return true;
  }

  blip({ freq = 440, dur = 0.08, type = 'sine', gain = 0.12, slide = 0, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), t);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    }
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur = 0.06, gain = 0.08, freq = 980, delay = 0) {
    if (!this.ctx || this.muted || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  cut() {
    if (!this.can('cut', 0.045)) return;
    this.noiseBurst(0.04, 0.05, 1400);
    this.blip({ freq: 720, dur: 0.045, type: 'triangle', gain: 0.04, slide: 180 });
  }

  shatter() {
    if (!this.can('shatter', 0.07)) return;
    this.noiseBurst(0.12, 0.11, 520);
    this.blip({ freq: 480, dur: 0.12, type: 'square', gain: 0.035, slide: -280 });
  }

  clank() {
    if (!this.can('clank', 0.14)) return;
    this.blip({ freq: 210, dur: 0.07, type: 'square', gain: 0.05, slide: -90 });
    this.blip({ freq: 90, dur: 0.09, type: 'triangle', gain: 0.04 });
  }

  full() {
    if (!this.can('full', 0.4)) return;
    this.blip({ freq: 392, dur: 0.1, type: 'square', gain: 0.05 });
    this.blip({ freq: 311, dur: 0.14, type: 'triangle', gain: 0.05, delay: 0.08 });
  }

  sell() {
    [523, 659, 784, 1046].forEach((freq, i) => {
      this.blip({ freq, dur: 0.13, type: 'triangle', gain: 0.08, delay: i * 0.07 });
    });
    this.noiseBurst(0.18, 0.04, 1600, 0.05);
  }

  buy() {
    [392, 523, 659].forEach((freq, i) => {
      this.blip({ freq, dur: 0.11, type: 'sine', gain: 0.08, delay: i * 0.055 });
    });
  }
}
