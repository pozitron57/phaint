// Настройки ручки и перевод нажатия в толщину линии.

export interface PenSettings {
  /** Базовая толщина в единицах холста (пиксели при масштабе 100 %). */
  width: number;
  color: string;
  /** 0..1 — насколько нажатие меняет толщину. 0 — линия постоянной толщины. */
  pressure: number;
  /** -1..1 — отклик на нажатие: меньше нуля мягче (толще при слабом нажиме), больше — жёстче. */
  curve: number;
  /** 0..1 — сглаживание траектории. */
  smoothing: number;
  /** 0..1 — сужение концов штриха. */
  taper: number;
  /** 0..1 — быстрый штрих тоньше. */
  speed: number;
}

export const WIDTH_MIN = 0.3;
export const WIDTH_MAX = 60;

/** Множитель толщины от нажатия p (0..1) и скорости v (экранные px/с). При среднем нажатии равен 1. */
export function widthFactor(s: PenSettings, p: number, v: number): number {
  const gamma = Math.pow(3, s.curve);
  const pc = Math.pow(Math.min(1, Math.max(0, p)), gamma);
  let f = 1 - s.pressure + 2 * s.pressure * pc;
  if (s.speed > 0) f *= 1 - 0.6 * s.speed * Math.min(1, v / 1500);
  return Math.max(0.12, f);
}

/** Следующая толщина для клавиш «тоньше» / «толще»: шаг около 10 %. */
export function stepWidth(w: number, dir: 1 | -1): number {
  const next = dir > 0 ? w * 1.1 : w / 1.1;
  const rounded = Math.round(next * 20) / 20;
  const moved = rounded === w ? w + dir * 0.05 : rounded;
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(moved * 100) / 100));
}
