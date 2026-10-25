import { clamp } from './math.js';

const KEY_CODES = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

export class Input {
  constructor() {
    this.enabled = false;
    this.keys = new Set();
    this.pointer = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.onKeyDown = (e) => {
      this.unlock?.();
      if (KEY_CODES.includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => {
      this.keys.clear();
      this.pointer.active = false;
    };
    this.onDown = (e) => {
      if (!this.enabled) return;
      if (e.target instanceof Element && e.target.closest('.interactive')) return;
      if (e.button !== undefined && e.button !== 0) return;
      this.unlock?.();
      this.pointer.active = true;
      this.pointer.id = e.pointerId;
      this.pointer.ox = e.clientX;
      this.pointer.oy = e.clientY;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    };
    this.onMove = (e) => {
      if (!this.pointer.active || e.pointerId !== this.pointer.id) return;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    };
    this.onUp = (e) => {
      if (e.pointerId !== this.pointer.id) return;
      this.pointer.active = false;
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  /**
   * Screen-space stick. x is right, y is down. Null when idle.
   * Partial drag scales speed; keys are full tilt.
   */
  axis() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len, source: 'key' };
    }
    if (!this.pointer.active) return null;
    const max = 78;
    let jx = clamp((this.pointer.x - this.pointer.ox) / max, -1, 1);
    let jy = clamp((this.pointer.y - this.pointer.oy) / max, -1, 1);
    const mag = Math.hypot(jx, jy);
    if (mag < 0.14) return { x: 0, y: 0, source: 'stick' };
    const scaled = Math.min(1, (mag - 0.14) / 0.86);
    return { x: (jx / mag) * scaled, y: (jy / mag) * scaled, source: 'stick' };
  }
}
