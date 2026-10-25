/**
 * Original in-browser audio. Nothing here is a sample or a third-party track:
 * BGM and sound effects are synthesized with Web Audio when the player first
 * taps or presses a key.
 *
 * playSfx(name, opts?) names:
 * cut, pickup (alias vacuum), full, sell, buy, deny, zone, ui, clank,
 * shatter, bigHit, bigBreak.
 * `zone` takes `{ deeper: boolean }`.
 */

const MAJOR = [0, 2, 4, 7, 9];
const MINOR = [0, 3, 5, 7, 10];
const BPM = 68;
const STEP = 60 / BPM / 2;

/** Sparse pentatonic motif. Null is a rest, so the loop stays calm. */
const MELODY = [
  0, null, 2, null, 3, null, 2, null,
  4, null, 3, null, 1, null, 0, null,
  0, null, 2, 3, null, 2, null, 0,
  3, null, 2, null, 1, null, null, null,
  5, null, 4, null, 3, null, 2, null,
  1, null, 2, null, 3, null, 0, null,
  2, null, 0, null, 4, null, 3, 2,
  0, null, null, null, 0, null, null, null,
];

const LOOP = MELODY.length;

/** Deeper zones sit lower, quieter, and darker. */
const ZONE_MUSIC = {
  base: { root: 196, mode: 'major', cutoff: 1680, melody: 0.034, drone: 0.028, water: 620 },
  shallow: { root: 196, mode: 'major', cutoff: 1500, melody: 0.032, drone: 0.03, water: 560 },
  kelp: { root: 174.61, mode: 'major', cutoff: 1240, melody: 0.03, drone: 0.034, water: 480 },
  coral: { root: 146.83, mode: 'major', cutoff: 1000, melody: 0.028, drone: 0.038, water: 420 },
  wreck: { root: 130.81, mode: 'minor', cutoff: 820, melody: 0.025, drone: 0.042, water: 360 },
  deep: { root: 110, mode: 'minor', cutoff: 680, melody: 0.022, drone: 0.048, water: 300 },
};

const MAX_VOICES = 8;

export function scaleFreq(root, mode, degree) {
  const scale = mode === 'minor' ? MINOR : MAJOR;
  const deg = Math.trunc(degree);
  const oct = Math.floor(deg / scale.length);
  const idx = deg - oct * scale.length;
  return root * 2 ** ((scale[idx] + oct * 12) / 12);
}

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = false;
    this.hidden = false;
    this.failed = false;
    this.zoneId = 'base';
    this.voices = [];
    this.next = {};
    this.step = 0;
    this.nextStepTime = 0;
    this.resumeAt = 0;
    this.musicReady = false;
    this.masterLevel = 0.8;
  }

  unlock() {
    if (this.failed) return;
    if (this.ctx) {
      this.unlocked = true;
      this._settle();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.failed = true;
      return;
    }
    try {
      this._create(Ctx);
      this.unlocked = true;
      this._settle();
    } catch {
      this.failed = true;
    }
  }

  setMuted(muted, instant = false) {
    this.muted = !!muted;
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this.muted ? 0 : this.masterLevel;
    this.master.gain.cancelScheduledValues(now);
    if (instant) {
      this.master.gain.setValueAtTime(target, now);
      return;
    }
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(target, now + 0.045);
  }

  setZone(id) {
    if (id && ZONE_MUSIC[id]) this.zoneId = id;
    this._applyZone();
  }

  pause() {
    this.hidden = true;
    this._settle();
  }

  resume() {
    this.hidden = false;
    this._settle();
  }

  update() {
    if (!this.ctx || !this.unlocked) return;
    const nowMs = performance.now();
    if (!this.hidden && !this.muted && this.ctx.state !== 'running' && nowMs >= this.resumeAt) {
      this.resumeAt = nowMs + 1200;
      this._settle();
    }
    this._schedule();
  }

  /**
   * @param {string} name
   * @param {{ deeper?: boolean }} [opts]
   */
  playSfx(name, opts) {
    if (name === 'vacuum') name = 'pickup';
    if (!this.ctx || this.muted || this.hidden || this.failed) return;
    const play = SFX[name];
    if (!play) return;
    play(this, opts || {});
  }

  cut() { this.playSfx('cut'); }
  shatter() { this.playSfx('shatter'); }
  clank() { this.playSfx('clank'); }
  full() { this.playSfx('full'); }
  sell() { this.playSfx('sell'); }
  buy() { this.playSfx('buy'); }

  _create(Ctx) {
    const ctx = new Ctx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.masterLevel;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    const musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 1400;
    musicFilter.Q.value = 0.45;
    const bed = ctx.createGain();
    bed.gain.value = 0.0001;
    const duck = ctx.createGain();
    duck.gain.value = 1;
    musicFilter.connect(bed);
    bed.connect(duck);
    duck.connect(master);
    this.musicFilter = musicFilter;
    this.bed = bed;
    this.duck = duck;

    const melodyBus = ctx.createGain();
    melodyBus.gain.value = 1;
    const delay = ctx.createDelay(0.4);
    delay.delayTime.value = 0.21;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.16;
    const wet = ctx.createGain();
    wet.gain.value = 0.26;
    melodyBus.connect(musicFilter);
    melodyBus.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(musicFilter);
    this.melodyBus = melodyBus;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.028;
    droneGain.connect(musicFilter);
    const droneA = ctx.createOscillator();
    const droneB = ctx.createOscillator();
    droneA.type = 'sine';
    droneB.type = 'sine';
    droneA.frequency.value = 98;
    droneB.frequency.value = 147;
    droneA.connect(droneGain);
    droneB.connect(droneGain);
    droneA.start();
    droneB.start();
    this.droneGain = droneGain;
    this.droneA = droneA;
    this.droneB = droneB;

    const breath = ctx.createOscillator();
    breath.frequency.value = 0.055;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.005;
    breath.connect(breathGain);
    breathGain.connect(droneGain.gain);
    breath.start();

    const len = Math.floor(ctx.sampleRate * 2);
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < len; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.035) * 0.985;
      data[i] = brown;
    }
    let peak = 0.001;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
    const norm = 0.85 / peak;
    for (let i = 0; i < len; i++) data[i] *= norm;
    this.noise = noise;

    const water = ctx.createBufferSource();
    water.buffer = noise;
    water.loop = true;
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 520;
    waterFilter.Q.value = 0.65;
    const waterGain = ctx.createGain();
    waterGain.gain.value = 0.02;
    water.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(musicFilter);
    water.start();
    this.waterFilter = waterFilter;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain);
    lfoGain.connect(waterFilter.frequency);
    lfo.start();

    const sfxGain = ctx.createGain();
    sfxGain.gain.value = 1;
    const sfxFilter = ctx.createBiquadFilter();
    sfxFilter.type = 'lowpass';
    sfxFilter.frequency.value = 2800;
    sfxFilter.Q.value = 0.4;
    sfxGain.connect(sfxFilter);
    sfxFilter.connect(master);
    this.sfxGain = sfxGain;

    const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
    const pop = ctx.createBufferSource();
    pop.buffer = silent;
    pop.connect(master);
    pop.start();

    const now = ctx.currentTime;
    bed.gain.setValueAtTime(0.0001, now);
    bed.gain.linearRampToValueAtTime(0.42, now + 1.6);
    this.musicReady = true;
    this.nextStepTime = now + 0.12;
    this._applyZone();
  }

  _settle() {
    if (!this.ctx || !this.unlocked) return;
    const generation = (this._gen || 0) + 1;
    this._gen = generation;
    const wantRunning = !this.hidden;
    const running = this.ctx.state === 'running';
    if (wantRunning === running) return;
    const op = wantRunning ? this.ctx.resume() : this.ctx.suspend();
    op.catch(() => {}).then(() => {
      if (!this.ctx) return;
      const nowRunning = this.ctx.state === 'running';
      if (nowRunning === !this.hidden) return;
      // A newer pause/resume won the race, or this call failed autoplay.
      // Only a stale call (an older suspend landing after resume) retries.
      if (generation !== this._gen) this._settle();
    });
  }

  _applyZone() {
    if (!this.musicReady || !this.ctx) return;
    const z = ZONE_MUSIC[this.zoneId] || ZONE_MUSIC.base;
    const now = this.ctx.currentTime;
    const fundamental = z.root < 150 ? z.root : z.root / 2;
    this.droneA.frequency.setTargetAtTime(fundamental, now, 1.35);
    this.droneB.frequency.setTargetAtTime(fundamental * 1.498, now, 1.35);
    this.droneGain.gain.setTargetAtTime(z.drone, now, 0.9);
    this.musicFilter.frequency.setTargetAtTime(z.cutoff, now, 0.85);
    this.waterFilter.frequency.setTargetAtTime(z.water, now, 1.1);
  }

  _schedule() {
    if (!this.musicReady || !this.ctx || this.ctx.state !== 'running' || this.muted || this.hidden) return;
    const now = this.ctx.currentTime;
    if (this.nextStepTime < now - 0.08) this.nextStepTime = now + 0.05;
    const horizon = now + 0.32;
    let guard = 0;
    while (this.nextStepTime < horizon && guard < 4) {
      this._scheduleStep(this.nextStepTime, this.step);
      this.step = (this.step + 1) % LOOP;
      this.nextStepTime += STEP;
      guard += 1;
    }
  }

  _scheduleStep(time, step) {
    const z = ZONE_MUSIC[this.zoneId] || ZONE_MUSIC.base;
    const degree = MELODY[step];
    if (degree != null) {
      const wobble = 0.992 + Math.random() * 0.016;
      this._musicNote({
        time,
        freq: scaleFreq(z.root * 2, z.mode, degree) * wobble,
        dur: STEP * 1.45,
        type: 'triangle',
        gain: z.melody * (0.9 + Math.random() * 0.16),
        attack: 0.018,
        dest: this.melodyBus,
      });
    }
    const fundamental = z.root < 150 ? z.root : z.root / 2;
    if (step % 16 === 0) {
      const chord = z.mode === 'minor' ? [0, 1, 3] : [0, 2, 4];
      for (let i = 0; i < chord.length; i++) {
        this._musicNote({
          time,
          freq: scaleFreq(fundamental, z.mode, chord[i]),
          dur: STEP * 15,
          type: 'sine',
          gain: 0.011,
          attack: 0.55,
          dest: this.musicFilter,
        });
      }
      this._musicNote({
        time,
        freq: fundamental,
        dur: STEP * 7,
        type: 'sine',
        gain: 0.034,
        attack: 0.03,
        dest: this.musicFilter,
      });
    } else if (step % 16 === 8) {
      this._musicNote({
        time,
        freq: scaleFreq(fundamental, z.mode, 3),
        dur: STEP * 6,
        type: 'sine',
        gain: 0.02,
        attack: 0.05,
        dest: this.musicFilter,
      });
    }
    if (step === 20 || step === 52) {
      this._musicNote({
        time,
        freq: Math.min(540, z.root * 3.2),
        dur: 0.26,
        type: 'sine',
        gain: 0.01,
        attack: 0.012,
        slide: -180,
        dest: this.melodyBus,
      });
    }
  }

  _musicNote({ time, freq, dur, type, gain, attack, slide, dest }) {
    if (!this.ctx || !(freq > 0) || !(gain > 0)) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, time);
    const end = time + dur;
    if (slide) {
      const target = Math.max(48, freq + slide);
      if (target > 48 && Math.abs(target - freq) > 1) {
        osc.frequency.exponentialRampToValueAtTime(target, end);
      }
    }
    const atk = Math.min(attack || 0.02, dur * 0.45);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(gain, time + atk);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(amp);
    amp.connect(dest);
    osc.start(time);
    osc.stop(end + 0.02);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }

  _gap(name, seconds) {
    const now = performance.now() / 1000;
    if (now < (this.next[name] ?? 0)) return false;
    this.next[name] = now + seconds;
    return true;
  }

  _duck(level, recover) {
    if (!this.duck || !this.ctx) return;
    const g = this.duck.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(level, now + 0.03);
    g.linearRampToValueAtTime(1, now + recover);
  }

  _claim(start, end, priority) {
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((voice) => voice.end > now - 0.02);
    const overlaps = () => this.voices.filter((voice) => voice.start < end && voice.end > start);
    let group = overlaps();
    while (group.length >= MAX_VOICES) {
      let idx = -1;
      for (let i = 0; i < group.length; i++) {
        const voice = group[i];
        if (voice.priority > priority) continue;
        if (idx < 0 || voice.priority < group[idx].priority || (voice.priority === group[idx].priority && voice.end < group[idx].end)) {
          idx = i;
        }
      }
      if (idx < 0) return null;
      const victim = group[idx];
      victim.stop?.();
      this.voices = this.voices.filter((voice) => voice !== victim);
      group = overlaps();
    }
    const voice = { start, end, priority, stop: null };
    this.voices.push(voice);
    return voice;
  }

  _tone({ freq, dur, type = 'sine', gain = 0.05, slide = 0, delay = 0, attack = 0.006, priority = 2 }) {
    if (!this.ctx || !(freq > 0) || !(gain > 0)) return;
    const t = this.ctx.currentTime + Math.max(0, delay);
    const end = t + dur;
    const voice = this._claim(t, end, priority);
    if (!voice) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    const startFreq = Math.max(48, freq);
    osc.frequency.setValueAtTime(startFreq, t);
    if (slide) {
      const target = Math.max(48, freq + slide);
      if (target > 48 && Math.abs(target - startFreq) > 1) {
        osc.frequency.exponentialRampToValueAtTime(target, end);
      }
    }
    const atk = Math.min(attack, dur * 0.25);
    const holdEnd = Math.min(t + Math.max(atk + 0.012, dur * 0.62), end - 0.018);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + atk);
    if (holdEnd > t + atk + 0.004) amp.gain.setValueAtTime(gain, holdEnd);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(amp);
    amp.connect(this.sfxGain);
    osc.start(t);
    osc.stop(end + 0.03);
    voice.stop = () => {
      const at = this.ctx.currentTime;
      try {
        amp.gain.cancelScheduledValues(at);
        amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value), at);
        amp.gain.linearRampToValueAtTime(0.0001, at + 0.02);
        osc.stop(Math.max(at + 0.025, t));
      } catch {
        /* already stopped */
      }
    };
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }

  _noise({ dur = 0.06, gain = 0.05, freq = 700, q = 0.8, delay = 0, priority = 2 }) {
    if (!this.ctx || !this.noise || !(gain > 0)) return;
    const t = this.ctx.currentTime + Math.max(0, delay);
    const end = t + dur;
    const voice = this._claim(t, end, priority);
    if (!voice) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(80, freq), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(70, freq * 0.62), end);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + Math.min(0.008, dur * 0.3));
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.sfxGain);
    const offset = Math.random() * Math.max(0.05, this.noise.duration - dur - 0.05);
    src.start(t, offset, dur + 0.02);
    voice.stop = () => {
      try { src.stop(Math.max(this.ctx.currentTime + 0.02, t)); } catch { /* already stopped */ }
    };
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      amp.disconnect();
    };
  }
}

const SFX = {
  cut(bus) {
    if (!bus._gap('cut', 0.05)) return;
    const vary = 0.9 + Math.random() * 0.2;
    bus._noise({ dur: 0.05, gain: 0.05, freq: 620 * vary, q: 0.85, priority: 2 });
    bus._tone({ freq: 250 * vary, dur: 0.07, type: 'triangle', gain: 0.072, slide: 70, priority: 2 });
  },
  pickup(bus) {
    if (!bus._gap('pickup', 0.07)) return;
    const vary = 0.94 + Math.random() * 0.14;
    bus._tone({ freq: 390 * vary, dur: 0.11, type: 'sine', gain: 0.05, slide: -160, priority: 2 });
    bus._tone({ freq: 520 * vary, dur: 0.08, type: 'sine', gain: 0.032, slide: -60, delay: 0.035, priority: 2 });
  },
  full(bus) {
    if (!bus._gap('full', 0.7)) return;
    bus._duck(0.82, 0.45);
    bus._tone({ freq: 349, dur: 0.18, type: 'sine', gain: 0.062, priority: 4 });
    bus._tone({ freq: 440, dur: 0.2, type: 'sine', gain: 0.055, delay: 0.1, priority: 4 });
    bus._tone({ freq: 523, dur: 0.26, type: 'triangle', gain: 0.046, delay: 0.2, priority: 4 });
  },
  sell(bus) {
    if (!bus._gap('sell', 0.45)) return;
    bus._duck(0.58, 0.75);
    const coins = [494, 587, 659, 698, 784, 659, 587, 698];
    for (let i = 0; i < coins.length; i++) {
      const jitter = 0.985 + Math.random() * 0.03;
      bus._tone({
        freq: coins[i] * jitter,
        dur: 0.09,
        type: 'triangle',
        gain: 0.055,
        delay: i * 0.058,
        attack: 0.004,
        priority: 5,
      });
    }
  },
  buy(bus) {
    if (!bus._gap('buy', 0.28)) return;
    bus._duck(0.74, 0.5);
    const notes = [262, 330, 392, 523];
    for (let i = 0; i < notes.length; i++) {
      bus._tone({ freq: notes[i], dur: 0.16, type: 'sine', gain: 0.06, delay: i * 0.07, priority: 4 });
    }
  },
  deny(bus) {
    if (!bus._gap('deny', 0.24)) return;
    bus._tone({ freq: 233, dur: 0.1, type: 'sine', gain: 0.042, priority: 3 });
    bus._tone({ freq: 175, dur: 0.16, type: 'sine', gain: 0.048, delay: 0.08, priority: 3 });
  },
  zone(bus, opts) {
    if (!bus._gap('zone', 0.95)) return;
    const deeper = opts.deeper !== false;
    bus._duck(0.8, 0.4);
    if (deeper) {
      bus._tone({ freq: 370, dur: 0.32, type: 'sine', gain: 0.05, slide: -130, attack: 0.02, priority: 3 });
      bus._tone({ freq: 277, dur: 0.36, type: 'triangle', gain: 0.036, slide: -60, delay: 0.08, attack: 0.03, priority: 3 });
    } else {
      bus._tone({ freq: 220, dur: 0.28, type: 'sine', gain: 0.048, slide: 110, attack: 0.02, priority: 3 });
      bus._tone({ freq: 330, dur: 0.3, type: 'triangle', gain: 0.034, delay: 0.07, attack: 0.02, priority: 3 });
    }
    bus._noise({ dur: 0.18, gain: 0.02, freq: 360, q: 0.5, priority: 2 });
  },
  ui(bus) {
    if (!bus._gap('ui', 0.045)) return;
    bus._tone({ freq: 560, dur: 0.055, type: 'sine', gain: 0.06, attack: 0.004, priority: 3 });
  },
  clank(bus) {
    if (!bus._gap('clank', 0.16)) return;
    bus._tone({ freq: 168, dur: 0.11, type: 'triangle', gain: 0.095, slide: -48, priority: 3 });
    bus._noise({ dur: 0.07, gain: 0.05, freq: 260, q: 0.7, priority: 2 });
  },
  shatter(bus) {
    if (!bus._gap('shatter', 0.08)) return;
    bus._noise({ dur: 0.14, gain: 0.075, freq: 400, q: 0.7, priority: 3 });
    bus._tone({ freq: 200, dur: 0.14, type: 'triangle', gain: 0.07, slide: -70, priority: 3 });
    bus._tone({ freq: 310, dur: 0.12, type: 'sine', gain: 0.04, delay: 0.04, slide: 30, priority: 3 });
  },
  bigHit(bus) {
    if (!bus._gap('bigHit', 0.09)) return;
    const vary = 0.94 + Math.random() * 0.12;
    bus._duck(0.88, 0.16);
    bus._tone({ freq: 136 * vary, dur: 0.18, type: 'sine', gain: 0.15, slide: -72, attack: 0.004, priority: 4 });
    bus._tone({ freq: 82 * vary, dur: 0.22, type: 'triangle', gain: 0.1, slide: -26, attack: 0.004, priority: 4 });
    bus._noise({ dur: 0.1, gain: 0.065, freq: 180 * vary, q: 0.65, priority: 3 });
  },
  bigBreak(bus) {
    if (!bus._gap('bigBreak', 0.4)) return;
    bus._duck(0.52, 0.85);
    bus._noise({ dur: 0.3, gain: 0.08, freq: 230, q: 0.55, priority: 5 });
    bus._tone({ freq: 92, dur: 0.36, type: 'sine', gain: 0.15, slide: -42, attack: 0.005, priority: 5 });
    bus._tone({ freq: 170, dur: 0.28, type: 'triangle', gain: 0.06, slide: -36, attack: 0.01, priority: 4 });
    const bloom = [349, 440, 523, 659];
    for (let i = 0; i < bloom.length; i++) {
      bus._tone({
        freq: bloom[i],
        dur: 0.22,
        type: 'sine',
        gain: 0.048,
        delay: 0.06 + i * 0.06,
        attack: 0.01,
        priority: 5,
      });
    }
  },
};
