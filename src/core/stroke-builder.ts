// Сборка штриха из отсчётов пера: сглаживание траектории, прореживание точек,
// толщина по нажатию. Касание с дрожью — точка без сужения, не тоньше базовой кисти.
// Не знает про DOM и холст — только числа.
import { type PenSettings, widthFactor } from './brush.ts';
import { PointFilter } from './filter.ts';
import type { Pt } from './geom.ts';
import { type Loops, strokeOutline } from './outline.ts';
import { simplify } from './simplify.ts';

/** Минимальное расстояние между принятыми точками, экранные px. */
const MIN_STEP = 0.6;
/** Допуск упрощения готового штриха, экранные px. */
const SIMPLIFY_TOL = 0.1;
/** Длина сужения конца при taper = 1, в толщинах линии. */
const TAPER_LEN = 10;
/** Допуск дрожи при касании: не больше 4 экранных px, для тонкой кисти меньше. */
const MAX_TAP_DRIFT = 4;

function taperScale(u: number): number {
  return u >= 1 ? 1 : 0.25 + 0.75 * Math.sqrt(Math.max(0, u));
}

export class StrokeBuilder {
  /** Начало локальных координат штриха в мире. */
  readonly ox: number;
  readonly oy: number;
  /** Принятые точки: тройки x, y, w в локальных координатах. */
  readonly data: number[] = [];

  private pen: PenSettings;
  private toWorld: (sx: number, sy: number) => Pt;
  private scale: number;
  private filter = new PointFilter();
  private started = false;
  private pressure = 0;
  private lastSX = 0;
  private lastSY = 0;
  private length = 0;
  private taperLen: number;
  private tipX = 0;
  private tipY = 0;
  private tipW = 0;
  private tapping = true;
  private tapRadius2: number;
  private peakPressure = 0;

  /**
   * toWorld переводит экранные px в мировые координаты; scale — масштаб вида (экранных px на единицу холста);
   * (sx, sy) — первая точка касания.
   */
  constructor(pen: PenSettings, toWorld: (sx: number, sy: number) => Pt, scale: number, sx: number, sy: number) {
    this.pen = pen;
    this.toWorld = toWorld;
    this.scale = scale;
    const o = toWorld(sx, sy);
    this.ox = o.x;
    this.oy = o.y;
    this.filter.configure(pen.smoothing);
    this.taperLen = pen.taper * TAPER_LEN * pen.width;
    const tapRadius = Math.max(MIN_STEP * 2, Math.min(MAX_TAP_DRIFT, pen.width * scale * 1.25)) / scale;
    this.tapRadius2 = tapRadius * tapRadius;
  }

  get count(): number {
    return this.data.length / 3;
  }

  /** Очередной отсчёт пера: экранные координаты, нажатие 0..1, время в мс. */
  add(sx: number, sy: number, pressure: number, t: number): void {
    const f = this.filter.filter(sx, sy, t);
    this.pressure = this.started ? this.pressure + 0.5 * (pressure - this.pressure) : pressure;
    const w = this.pen.width * widthFactor(this.pen, this.pressure, this.filter.speed);

    // Кончик штриха — несглаженное положение пера: линия на экране не отстаёт от курсора.
    const tip = this.toWorld(sx, sy);
    this.tipX = tip.x - this.ox;
    this.tipY = tip.y - this.oy;
    this.tipW = w;
    // Считаем удаление от касания, а не длину дрожащей траектории. После явного
    // движения точкой уже не становимся, даже если перо вернулось в начало.
    if (this.tapping) {
      this.tapping = this.tipX * this.tipX + this.tipY * this.tipY <= this.tapRadius2;
      this.peakPressure = Math.max(this.peakPressure, pressure);
    }

    if (!this.started || Math.hypot(f.x - this.lastSX, f.y - this.lastSY) >= MIN_STEP) {
      const q = this.toWorld(f.x, f.y);
      this.push(q.x - this.ox, q.y - this.oy, w);
      this.lastSX = f.x;
      this.lastSY = f.y;
      this.started = true;
    } else {
      // Перо почти стоит: точку не добавляем, но нажим учитываем — иначе точки выходят тонкими.
      const i = this.data.length - 1;
      const tw = w * this.startTaper(this.length);
      if (tw > this.data[i]) this.data[i] = tw;
    }
  }

  /**
   * Контур для показа во время рисования: принятые точки, затем кончик под пером
   * и, если есть, предсказанные точки (extra — тройки x, y, w в локальных координатах).
   */
  previewLoops(extra?: ArrayLike<number>): Loops {
    const keep = this.data.length;
    this.pushTip();
    if (extra) for (let i = 0; i < extra.length; i++) this.data.push(extra[i]);
    const loops = strokeOutline(this.data);
    this.data.length = keep;
    return loops;
  }

  /** Копия предпросмотра для штрихового режима и маркера; данные строителя не меняются. */
  previewPoints(extra?:ArrayLike<number>):Float32Array {
    const keep=this.data.length;this.pushTip();
    if(extra)for(let i=0;i<extra.length;i++)this.data.push(extra[i]);
    const points=Float32Array.from(this.data);this.data.length=keep;return points;
  }

  /** Толщина линии под пером сейчас (для предсказанных точек). */
  get tipWidth(): number {
    return this.tipW;
  }

  /** Завершить штрих. Возвращает точки готового объекта или null, если рисовать нечего. */
  finish(): Float32Array | null {
    if (!this.started) return null;
    if (this.tapping) {
      // Короткий пик реального нажима может увеличить точку. Сужение концов,
      // скорость дрожи и слабое касание не уменьшают её ниже выбранной толщины.
      const w = this.pen.width * Math.max(1, widthFactor(this.pen, this.peakPressure, 0));
      return Float32Array.of(this.data[0], this.data[1], w);
    }
    this.pushTip();
    if (this.taperLen > 0) this.taperEnd();
    return simplify(this.data, SIMPLIFY_TOL / this.scale);
  }

  private push(x: number, y: number, w: number): void {
    const n = this.data.length;
    if (n > 0) this.length += Math.hypot(x - this.data[n - 3], y - this.data[n - 2]);
    this.data.push(x, y, w * this.startTaper(this.length));
  }

  /** Довести линию до пера, если оно ушло от последней принятой точки. */
  private pushTip(): void {
    const n = this.data.length;
    if (n === 0) return;
    const d = Math.hypot(this.tipX - this.data[n - 3], this.tipY - this.data[n - 2]);
    if (d * this.scale < 0.05) return;
    const w = this.tipW * this.startTaper(this.length + d);
    this.data.push(this.tipX, this.tipY, w);
  }

  private startTaper(dist: number): number {
    return this.taperLen > 0 ? taperScale(dist / this.taperLen) : 1;
  }

  private taperEnd(): void {
    const d = this.data;
    let dist = 0;
    for (let i = d.length - 3; i >= 0; i -= 3) {
      if (i < d.length - 3) dist += Math.hypot(d[i + 3] - d[i], d[i + 4] - d[i + 1]);
      if (dist >= this.taperLen) break;
      d[i + 2] *= taperScale(dist / this.taperLen);
    }
  }
}
