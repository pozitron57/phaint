// Отладка и проверка: генератор штрихов для нагрузочных тестов и window.__phaint —
// доступ к приложению из консоли и из сценариев (`electron . --run=файл.js`, см. electron/main.ts).
import type { App } from './app.ts';
import { type Obj, makeStroke } from './core/types.ts';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CELL_W = 34;
const CELL_H = 56;
const COLS = 110;

/** Добавить count штрихов, похожих на рукописные буквы, строками по COLS штук. Отменяется одним шагом. */
export function generateStrokes(app: App, count: number, seed = 1): void {
  const rnd = mulberry32(seed + app.doc.size);
  const palette = app.settings.palette;
  const base = app.doc.size;
  const objs: Obj[] = [];
  let z = app.doc.topZ();
  for (let k = 0; k < count; k++) {
    const idx = base + k;
    const ox = (idx % COLS) * CELL_W + rnd() * 5;
    const oy = Math.floor(idx / COLS) * CELL_H + rnd() * 5;
    const n = 14 + Math.floor(rnd() * 30);
    const pts = new Float32Array(n * 3);
    let x = 5 + rnd() * 10;
    let y = 10 + rnd() * 30;
    let ang = rnd() * Math.PI * 2;
    const curl = (rnd() - 0.5) * 0.9;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      pts[3 * i] = x;
      pts[3 * i + 1] = y;
      pts[3 * i + 2] = 2.4 * (0.45 + 0.75 * Math.sin(Math.PI * Math.min(1, 0.05 + u * 0.95)));
      ang += curl + (rnd() - 0.5) * 0.5;
      if (rnd() < 0.06) ang += 2.2;
      const step = 1.6 + rnd() * 1.6;
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
      if (x < 2 || x > CELL_W - 6) {
        ang = Math.PI - ang;
        x = Math.min(CELL_W - 6, Math.max(2, x));
      }
      if (y < 2 || y > CELL_H - 8) {
        ang = -ang;
        y = Math.min(CELL_H - 8, Math.max(2, y));
      }
    }
    const color = rnd() < 0.85 ? palette[0] : palette[1 + Math.floor(rnd() * 3)];
    objs.push(makeStroke(app.doc.nextId(), z++, ox, oy, pts, color));
  }
  app.history.commit({ added: objs, removed: [] });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame(): Promise<void> {
  // В скрытом окне requestAnimationFrame может не сработать — подстраховка таймером.
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 300);
    requestAnimationFrame(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

type Rect = { x: number; y: number; width: number; height: number };

export function installDebug(app: App): void {
  const live = document.getElementById('live') as HTMLElement;
  const native = (window as unknown as { phaintNative?: { shot(name: string, rect?: Rect): Promise<string | null> } }).phaintNative;

  /** Помощники для сценариев: действуют настоящими событиями DOM, как перо, клавиатура и трекпад. */
  const test = {
    sleep,
    async frames(n = 1): Promise<void> {
      for (let i = 0; i < n; i++) await nextFrame();
    },
    /** Дождаться, пока закончится жест масштабирования и дорисуются все плитки. */
    async idle(): Promise<void> {
      await nextFrame();
      for (let i = 0; i < 3000 && !app.renderer.idle; i++) await nextFrame();
      await nextFrame();
      await nextFrame();
    },
    pointer(type: string, x: number, y: number, pressure: number, kind = 'pen', mods:PointerEventInit = {}): void {
      live.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 5,
          pointerType: kind,
          clientX: x,
          clientY: y,
          pressure,
          bubbles: true,
          cancelable: true,
          isPrimary: true,
          button: type === 'pointermove' ? -1 : 0,
          buttons: type === 'pointerup' ? 0 : 1,
          ...mods,
        }),
      );
    },
    /** Провести штрих: pts — тройки [x, y, нажатие] в экранных px, dt — пауза между отсчётами в мс. */
    async pen(pts: Array<[number, number, number]>, dt = 7, kind = 'pen'): Promise<void> {
      test.pointer('pointerdown', pts[0][0], pts[0][1], pts[0][2], kind);
      for (let i = 1; i < pts.length; i++) {
        await sleep(dt);
        test.pointer('pointermove', pts[i][0], pts[i][1], pts[i][2], kind);
      }
      await sleep(dt);
      const last = pts[pts.length - 1];
      test.pointer('pointerup', last[0], last[1], 0, kind);
      await nextFrame();
    },
    key(code: string, mods: KeyboardEventInit = {}): void {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...mods }));
    },
    wheel(x: number, y: number, dx: number, dy: number, ctrl = false): void {
      live.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, ctrlKey: ctrl, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    /** Снимок окна или его части в файл (только в режиме проверки Electron). */
    async shot(name: string, rect?: Rect): Promise<string | null> {
      await nextFrame();
      await nextFrame();
      return native ? native.shot(name, rect) : null;
    },
  };

  const api = {
    app,
    test,
    generate: (count: number, seed = 1) => generateStrokes(app, count, seed),
    stats: () => ({
      objects: app.doc.size,
      tiles: app.renderer.tiles.stats(),
      frameMs: app.renderer.frameMs,
      scale: app.view.scale,
      angle: app.view.angle,
      dpr: app.view.dpr,
      native: app.platform.native,
    }),
    /** Самопроверка (`npm run smoke`): штрих пером, пачка штрихов, отрисовка. */
    async selfTest() {
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i <= 80; i++) pts.push([160 + i * 6, 220 + Math.sin(i / 7) * 70, 0.15 + 0.75 * Math.abs(Math.sin(i / 13))]);
      await test.pen(pts, 4);
      generateStrokes(app, 400);
      await test.idle();
      return { ...api.stats(), userAgent: navigator.userAgent };
    },
  };
  (window as unknown as { __phaint: typeof api }).__phaint = api;
}
