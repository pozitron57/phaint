// Сглаживание траектории пера: двумерный фильтр One Euro.
// Медленное движение сглаживается сильно (гасит дрожь руки), быстрое — слабо
// (линия не отстаёт от пера). Работает в экранных пикселях, поэтому не зависит от масштаба.
import type { Pt } from './geom.ts';

/** Частота среза для оценки скорости, Гц. Высокая, чтобы короткие штрихи не «залипали» в начале. */
const SPEED_CUTOFF = 12;

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return dt / (dt + tau);
}

export class PointFilter {
  /** Сглаженная скорость, px/с. */
  speed = 0;
  private on = false;
  private minCutoff = 1;
  private beta = 0;
  private started = false;
  private x = 0;
  private y = 0;
  private rawX = 0;
  private rawY = 0;
  private vx = 0;
  private vy = 0;
  private t = 0;

  /** smoothing: 0 — выключено, 1 — сильная стабилизация. */
  configure(smoothing: number): void {
    const s = Math.min(1, Math.max(0, smoothing));
    this.on = s > 0.001;
    // Наибольшее отставание линии от пера при быстром движении, px.
    const lag = 0.3 + 24 * Math.pow(s, 2.5);
    this.beta = 1 / (2 * Math.PI * lag);
    this.minCutoff = Math.min(12, Math.max(0.3, 5 / lag));
  }

  reset(): void {
    this.started = false;
    this.speed = 0;
  }

  /** t — время в миллисекундах. */
  filter(x: number, y: number, t: number): Pt {
    if (!this.started) {
      this.started = true;
      this.x = this.rawX = x;
      this.y = this.rawY = y;
      this.vx = this.vy = 0;
      this.t = t;
      this.speed = 0;
      return { x, y };
    }
    let dt = (t - this.t) / 1000;
    if (!(dt > 0.0005)) dt = 0.004;
    else if (dt > 0.05) dt = 0.05;
    this.t = t;

    const a = alpha(SPEED_CUTOFF, dt);
    this.vx += a * ((x - this.rawX) / dt - this.vx);
    this.vy += a * ((y - this.rawY) / dt - this.vy);
    this.rawX = x;
    this.rawY = y;
    this.speed = Math.hypot(this.vx, this.vy);

    if (!this.on) {
      this.x = x;
      this.y = y;
    } else {
      const k = alpha(this.minCutoff + this.beta * this.speed, dt);
      this.x += k * (x - this.x);
      this.y += k * (y - this.y);
    }
    return { x: this.x, y: this.y };
  }
}
