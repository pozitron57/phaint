// Фон: белый лист в клетку. Линии сетки всегда толщиной в один пиксель устройства.
import type { GridSettings } from '../core/settings.ts';
import type { Viewport } from './viewport.ts';

export const BACKGROUND = '#ffffff';
const LINE = '#c9d5e6';
/** Клетка мельче FADE_TO px на экране не рисуется, от FADE_FROM px — в полную силу. */
const FADE_FROM = 9;
const FADE_TO = 4;

export function drawBackground(ctx: CanvasRenderingContext2D, view: Pick<Viewport, 'width' | 'height' | 'scale' | 'dpr' | 'rotSteps' | 'matrix' | 'worldBounds'>, grid: GridSettings): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, view.width, view.height);
  if (!grid.enabled || !(grid.step > 0)) return;

  const cell = grid.step * view.scale;
  const alpha = cell >= FADE_FROM ? 1 : (cell - FADE_TO) / (FADE_FROM - FADE_TO);
  if (alpha <= 0) return;

  const step = grid.step;
  const b = view.worldBounds();
  const i0 = Math.ceil(b.minX / step);
  const i1 = Math.floor(b.maxX / step);
  const j0 = Math.ceil(b.minY / step);
  const j1 = Math.floor(b.maxY / step);
  const m = view.matrix();
  ctx.globalAlpha = alpha;

  if (view.rotSteps % 4 === 0) {
    // Сетка параллельна экрану: линии — прямоугольники по целым пикселям, без размытия.
    ctx.fillStyle = LINE;
    const line = (alongX: boolean, pos: number): void => {
      const p = Math.round(pos);
      if (alongX) ctx.fillRect(0, p, view.width, 1);
      else ctx.fillRect(p, 0, 1, view.height);
    };
    for (let i = i0; i <= i1; i++) {
      // Мировая вертикаль x = i·step на экране вертикальна при 0° и 180°, иначе горизонтальна.
      if (m.a !== 0) line(false, m.a * i * step + m.e);
      else line(true, m.b * i * step + m.f);
    }
    for (let j = j0; j <= j1; j++) {
      if (m.d !== 0) line(true, m.d * j * step + m.f);
      else line(false, m.c * j * step + m.e);
    }
  } else {
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1 / (view.scale * view.dpr);
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      ctx.moveTo(i * step, b.minY);
      ctx.lineTo(i * step, b.maxY);
    }
    for (let j = j0; j <= j1; j++) {
      ctx.moveTo(b.minX, j * step);
      ctx.lineTo(b.maxX, j * step);
    }
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.globalAlpha = 1;
}
