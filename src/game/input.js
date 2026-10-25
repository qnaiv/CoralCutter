import { clamp } from './math.js';

const KEY_CODES = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

function isScrollUi(target) {
  return target instanceof Element && !!target.closest('#upgrade, button, a, input, textarea');
}

export class Input {
  constructor() {
    this.enabled = false;
    this.keys = new Set();
    this.pointer = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.points = new Map();
    this.pinchDist = 0;
    this.onKeyDown = (e) => {
      this.unlock?.();
      if (KEY_CODES.includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => {
      this.keys.clear();
      this.pointer.active = false;
      this.points.clear();
      this.pinchDist = 0;
    };
    this.onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this.unlock?.();
      const blocked = e.target instanceof Element && !!e.target.closest('.interactive');
      this.points.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        ui: isScrollUi(e.target),
        blocked,
      });
      if (this._pinchPoints().length >= 2) {
        this.pointer.active = false;
        this.pinchDist = this._span();
        return;
      }
      if (!this.enabled || blocked || this.points.size > 1) return;
      this.pointer.active = true;
      this.pointer.id = e.pointerId;
      this.pointer.ox = e.clientX;
      this.pointer.oy = e.clientY;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    };
    this.onMove = (e) => {
      const point = this.points.get(e.pointerId);
      if (point) {
        point.x = e.clientX;
        point.y = e.clientY;
      }
      const span = this._span();
      if (this.pinchDist > 0 && span > 0) {
        const ratio = span / this.pinchDist;
        this.pinchDist = span;
        this.pointer.active = false;
        if (Math.abs(ratio - 1) > 0.002) this.onZoom?.(1 / ratio);
        return;
      }
      if (!this.pointer.active || e.pointerId !== this.pointer.id) return;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    };
    this.onUp = (e) => {
      const wasPinch = this.pinchDist > 0;
      this.points.delete(e.pointerId);
      if (this._pinchPoints().length < 2) {
        this.pinchDist = 0;
        if (wasPinch) this.onZoomEnd?.();
      }
      if (e.pointerId === this.pointer.id) this.pointer.active = false;
    };
    this.onWheel = (e) => {
      const scrolling = isScrollUi(e.target);
      if (scrolling && !e.ctrlKey) return;
      e.preventDefault();
      if (scrolling) return;
      const unit = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 120 : e.deltaY;
      const step = clamp(unit * 0.0008, -0.12, 0.12);
      if (step === 0) return;
      this.unlock?.();
      this.onZoom?.(Math.exp(step));
    };
    this.onGesture = (e) => e.preventDefault();
    this.onTouchMove = (e) => {
      if (e.touches.length < 2) return;
      if (isScrollUi(e.target)) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('gesturestart', this.onGesture, { passive: false });
    window.addEventListener('gesturechange', this.onGesture, { passive: false });
  }

  _pinchPoints() {
    const pts = [];
    for (const point of this.points.values()) {
      if (!point.ui) pts.push(point);
    }
    return pts;
  }

  _span() {
    const pts = this._pinchPoints();
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
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
    if (!this.pointer.active || this.pinchDist > 0) return null;
    const max = 78;
    const jx = clamp((this.pointer.x - this.pointer.ox) / max, -1, 1);
    const jy = clamp((this.pointer.y - this.pointer.oy) / max, -1, 1);
    const mag = Math.hypot(jx, jy);
    if (mag < 0.14) return { x: 0, y: 0, source: 'stick' };
    const scaled = Math.min(1, (mag - 0.14) / 0.86);
    return { x: (jx / mag) * scaled, y: (jy / mag) * scaled, source: 'stick' };
  }
}
