// Вид: как мир (единицы холста) отображается на экран.
//   устройство = D · мир + (tx, ty),   D = dpr · масштаб · поворот.
// Сдвиг (tx, ty) всегда целый в пикселях устройства, поэтому готовые плитки
// копируются на экран 1:1, без размытия.
import { type BBox, type Mat, type Pt, matBBox, matInvert } from '../core/geom.ts';
import type { SavedView } from '../files/codec.ts';

/** Шагов поворота на полный оборот: один шаг — 22,5°. */
export const ROT_STEPS = 16;
export const SCALE_MIN = 0.05;
export const SCALE_MAX = 32;
const ZOOM_LEVELS = [0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

export class Viewport {
  scale = 1;
  /** Поворот холста по часовой стрелке в шагах по 22,5°. */
  rotSteps = 0;
  dpr = 1;
  /** Размер холста в пикселях устройства. */
  width = 1;
  height = 1;
  /** Растёт при любом изменении вида. */
  version = 0;
  onChange: (() => void) | null = null;

  /** Точный сдвиг в пикселях устройства; на экран идёт округлённый. */
  private fx = 0;
  private fy = 0;

  get tx(): number {
    return Math.round(this.fx);
  }

  get ty(): number {
    return Math.round(this.fy);
  }

  /** Угол поворота в градусах, 0..360. */
  get angle(): number {
    return (this.rotSteps * 360) / ROT_STEPS;
  }

  /** Линейная часть преобразования мир → устройство (без сдвига). */
  linear(): Mat {
    let c: number;
    let s: number;
    if (this.rotSteps % 4 === 0) {
      const q = this.rotSteps / 4;
      c = q === 0 ? 1 : q === 2 ? -1 : 0;
      s = q === 1 ? 1 : q === 3 ? -1 : 0;
    } else {
      const a = (this.rotSteps * 2 * Math.PI) / ROT_STEPS;
      c = Math.cos(a);
      s = Math.sin(a);
    }
    const k = this.dpr * this.scale;
    return { a: k * c, b: k * s, c: -k * s, d: k * c, e: 0, f: 0 };
  }

  /** Полное преобразование мир → устройство. */
  matrix(): Mat {
    const m = this.linear();
    m.e = this.tx;
    m.f = this.ty;
    return m;
  }

  /** Экранные px (CSS) → мир. Считает от округлённого сдвига: ровно то, что видно на экране. */
  toWorld(sx: number, sy: number): Pt {
    return this.devToWorld(sx * this.dpr, sy * this.dpr, this.tx, this.ty);
  }

  /** Мир → экранные px (CSS). */
  toScreen(wx: number, wy: number): Pt {
    const m = this.linear();
    return { x: (m.a * wx + m.c * wy + this.tx) / this.dpr, y: (m.b * wx + m.d * wy + this.ty) / this.dpr };
  }

  /** Видимая область в мировых координатах. */
  worldBounds(): BBox {
    const inv = matInvert(this.matrix());
    return matBBox(inv, { minX: 0, minY: 0, maxX: this.width, maxY: this.height });
  }

  setSize(width: number, height: number, dpr: number): void {
    if (dpr !== this.dpr) {
      const k = dpr / this.dpr;
      this.fx *= k;
      this.fy *= k;
      this.dpr = dpr;
    }
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.changed();
  }

  /** Сдвинуть холст на экране, CSS px. */
  panBy(dx: number, dy: number): void {
    this.fx += dx * this.dpr;
    this.fy += dy * this.dpr;
    this.changed();
  }

  /** Изменить масштаб в factor раз так, чтобы точка холста под (sx, sy) осталась на месте. */
  zoomAt(sx: number, sy: number, factor: number): void {
    this.setScaleAt(sx * this.dpr, sy * this.dpr, this.scale * factor);
  }

  /** Перейти к соседнему «круглому» масштабу; якорь — центр экрана. */
  zoomStep(dir: 1 | -1): void {
    const s = this.scale;
    let next: number | undefined;
    if (dir > 0) next = ZOOM_LEVELS.find((z) => z > s * 1.001);
    else next = [...ZOOM_LEVELS].reverse().find((z) => z < s * 0.999);
    if (next !== undefined) this.setScaleAt(this.width / 2, this.height / 2, next);
  }

  /** Повернуть холст на steps шагов по часовой стрелке вокруг центра экрана. */
  rotate(steps: number): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const w = this.devToWorld(cx, cy, this.fx, this.fy);
    this.rotSteps = (((this.rotSteps + steps) % ROT_STEPS) + ROT_STEPS) % ROT_STEPS;
    this.anchor(w, cx, cy);
  }

  /** Масштаб 100 %, без поворота; точка в центре экрана остаётся в центре. */
  reset(): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const w = this.devToWorld(cx, cy, this.fx, this.fy);
    this.scale = 1;
    this.rotSteps = 0;
    this.anchor(w, cx, cy);
  }

  /** Восстановление вида не зависит от плотности пикселей и размера окна. */
  restore(view: SavedView): void {
    this.scale = view.scale;
    this.rotSteps = view.rotSteps;
    this.anchor({ x: view.x, y: view.y }, this.width / 2, this.height / 2);
  }

  private setScaleAt(cx: number, cy: number, scale: number): void {
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
    if (next === this.scale) return;
    const w = this.devToWorld(cx, cy, this.fx, this.fy);
    this.scale = next;
    this.anchor(w, cx, cy);
  }

  /** Подобрать сдвиг так, чтобы мировая точка w оказалась в точке устройства (cx, cy). */
  private anchor(w: Pt, cx: number, cy: number): void {
    const m = this.linear();
    this.fx = cx - (m.a * w.x + m.c * w.y);
    this.fy = cy - (m.b * w.x + m.d * w.y);
    this.changed();
  }

  private devToWorld(dx: number, dy: number, tx: number, ty: number): Pt {
    const m = this.linear();
    const det = m.a * m.d - m.b * m.c;
    const x = dx - tx;
    const y = dy - ty;
    return { x: (m.d * x - m.c * y) / det, y: (-m.b * x + m.a * y) / det };
  }

  private changed(): void {
    this.version++;
    this.onChange?.();
  }
}
