// Отрисовщик: два холста друг над другом.
//   scene — фон, сетка и плитки с готовыми объектами; перерисовывается, только когда что-то изменилось.
//   live  — то, что рисуется прямо сейчас (текущий штрих); его скорость не зависит от числа объектов.
// Всё рисование идёт в одном кадре requestAnimationFrame, поэтому сцена и живой слой меняются синхронно.
import type { Doc } from '../core/doc.ts';
import type { Obj } from '../core/types.ts';
import type { GridSettings } from '../core/settings.ts';
import { drawBackground } from './grid.ts';
import { TileCache } from './tiles.ts';
import type { Viewport } from './viewport.ts';

/** После последнего шага плавного масштабирования ждём столько мс и перерисовываем плитки начисто. */
const SETTLE_MS = 140;
/** Бюджет кадра на плитки, мс: во время штриха, во время движения вида и в покое. */
const BUDGET_BUSY = 1.5;
const BUDGET_MOVING = 7;
const BUDGET_QUIET = 11;
/** Вид считается неподвижным, если не менялся столько мс. */
const QUIET_MS = 80;
/** Если кадр не пришёл за это время (окно скрыто), рисуем по таймеру. */
const WATCHDOG_MS = 250;

export type LiveDraw = (ctx: CanvasRenderingContext2D) => void;

export class Renderer {
  readonly tiles: TileCache;
  grid: GridSettings;
  /** Идёт штрих: плиткам остаётся минимум времени, чтобы перо не отставало. */
  busy = false;
  /** Для отладочной панели: длительность последнего кадра и счётчик кадров. */
  frameMs = 0;
  frames = 0;
  /** Последний кадр по этапам, мс: смена уровня плиток, отрисовка плиток, сцена, живой слой. */
  profile: [number, number, number, number] = [0, 0, 0, 0];

  private view: Viewport;
  private scene: HTMLCanvasElement;
  private live: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private lctx: CanvasRenderingContext2D;
  private raf = 0;
  private watchdog = 0;
  private timer = 0;
  private sceneDirty = true;
  private liveDirty = false;
  private liveUsed = false;
  private liveDraw: LiveDraw | null = null;
  private settleAt = 0;
  private seenVersion = -1;
  private movedAt = 0;

  constructor(scene: HTMLCanvasElement, live: HTMLCanvasElement, doc: Doc, view: Viewport, grid: GridSettings) {
    this.scene = scene;
    this.live = live;
    this.view = view;
    this.grid = grid;
    this.sctx = scene.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    this.lctx = live.getContext('2d') as CanvasRenderingContext2D;
    this.tiles = new TileCache(doc, grid);
    doc.onChange((change) => {
      this.tiles.onChange(change);
      this.sceneDirty = true;
      this.request();
    });
    view.onChange = () => this.request();
  }

  /** Размер холстов в пикселях устройства. */
  setSize(width: number, height: number, dpr: number): void {
    if (this.scene.width !== width || this.scene.height !== height) {
      this.scene.width = this.live.width = width;
      this.scene.height = this.live.height = height;
    }
    this.view.setSize(width, height, dpr);
    this.sceneDirty = true;
    this.liveDirty = true;
    this.liveUsed = false;
    // Сразу, не дожидаясь следующего кадра: иначе холст мигает при изменении размера окна.
    this.frame();
  }

  /** Всё дорисовано: плитки соответствуют виду и недорисованных нет. */
  get idle(): boolean {
    return this.tiles.fit(this.view) === 0 && !this.tiles.pending;
  }

  /** Сообщить, что масштаб меняется плавным жестом: плитки пересоздадим, когда жест закончится. */
  gesture(): void {
    this.settleAt = performance.now() + SETTLE_MS;
  }

  /** Привести плитки к текущему масштабу в ближайшем кадре (перед началом штриха). */
  settle(): void {
    this.settleAt = 0;
  }

  /** Готовить неизменные слои вокруг выбранной линии до начала движения ручки. */
  prepareEdit(o:Obj|null):void {
    if(this.tiles.prepareEdit(o))this.request();
  }

  /** Задать, что рисовать на живом слое; null — очистить. */
  setLive(draw: LiveDraw | null, blend = false): void {
    this.live.style.mixBlendMode = blend ? 'multiply' : 'normal';
    this.liveDraw = draw;
    this.invalidateLive();
  }

  invalidateLive(): void {
    this.liveDirty = true;
    this.request();
  }

  invalidateScene(): void {
    this.sceneDirty = true;
    this.request();
  }

  request(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
    // В скрытом окне кадры не приходят; таймер не даёт отрисовке застрять.
    this.watchdog = window.setTimeout(this.frame, WATCHDOG_MS);
  }

  /** Преобразование для рисования в локальных координатах объекта с началом (ox, oy). */
  place(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const v = this.view;
    const D = v.linear();
    ctx.setTransform(D.a, D.b, D.c, D.d, D.a * ox + D.c * oy + v.tx, D.b * ox + D.d * oy + v.ty);
  }

  private frame = (): void => {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    window.clearTimeout(this.watchdog);
    const t0 = performance.now();
    const v = this.view;
    this.tiles.checkGrid();
    if (v.version !== this.seenVersion) {
      this.seenVersion = v.version;
      this.movedAt = t0;
      this.sceneDirty = true;
      if (this.liveDraw) this.liveDirty = true;
    }
    const fit = this.tiles.fit(v);
    if (fit === 2 || (fit === 1 && t0 >= this.settleAt)) {
      // Плитки не подходят виду (или жест масштабирования закончился): рисуем начисто.
      this.tiles.switchLevel(v);
      this.sceneDirty = true;
    } else if (fit === 1 && !this.timer) {
      // Жест ещё идёт: пока показываем растянутые плитки и ждём, когда он закончится.
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        this.request();
      }, this.settleAt - t0 + 1);
    }
    const t1 = performance.now();
    // Пока перо рисует, плиткам достаётся минимум; пока вид движется — умеренно; в покое — почти весь кадр.
    const budget = this.busy ? BUDGET_BUSY : t0 - this.movedAt < QUIET_MS ? BUDGET_MOVING : BUDGET_QUIET;
    if (this.tiles.work(v, budget, !this.busy)) this.sceneDirty = true;
    const t2 = performance.now();
    if (this.sceneDirty) {
      this.sceneDirty = false;
      drawBackground(this.sctx, v, this.grid);
      this.tiles.compose(this.sctx, v);
    }
    const t3 = performance.now();
    if (this.liveDirty) {
      this.liveDirty = false;
      this.drawLive();
    }
    if (this.tiles.pending) this.request();
    const t4 = performance.now();
    this.frameMs = t4 - t0;
    this.profile = [t1 - t0, t2 - t1, t3 - t2, t4 - t3];
    this.frames++;
  };

  private drawLive(): void {
    const ctx = this.lctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.liveUsed) ctx.clearRect(0, 0, this.live.width, this.live.height);
    this.liveUsed = false;
    if (this.liveDraw) {
      this.liveDraw(ctx);
      this.liveUsed = true;
    }
  }
}
