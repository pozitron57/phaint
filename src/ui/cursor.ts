// Системный курсор размером с кисть и её цветом: ОС двигает его без задержки пера.
// Светлые цвета получают тонкую нейтральную обводку, остальные — только светлый ореол.
// Ободок показывает сплошную/четыре штриха/точки; метка — прямую, стрелку или угол координат.
// Кэш учитывает размер, DPR, цвет, рисунок ободка и метку; кадров холста не добавляет.

const cache = new Map<string, string>();
const CACHE_LIMIT = 256;

interface CursorStyle {
  pattern?: 'solid' | 'dash' | 'dots';
  mark?: 'none' | 'line' | 'arrow' | 'arrowBoth' | 'coordinates';
}

/** CSS-курсор диаметром diameter экранных px; без color — нейтральный ластик. */
export function brushCursor(diameter: number, dpr: number, color?: string, style: CursorStyle = {}): string {
  // Не меньше 6 px: кружок тоньше почти не видно, когда целишься пером.
  const d = Math.max(6, Math.min(100, Math.round(diameter)));
  const { pattern = 'solid', mark = 'none' } = style;
  const key = `${d}@${dpr}@${color ?? 'eraser'}@${pattern}@${mark}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = d + (mark === 'none' ? 8 : 16);
  const mid = size / 2;
  const radius = d / 2 + .5;
  const ink = color ?? '#191c24';
  const lineWidth = color ? 1.6 : 1;
  const rgb = Number.parseInt(ink.slice(1), 16);
  const lightness = ((rgb >> 16) * .2126 + ((rgb >> 8) & 255) * .7152 + (rgb & 255) * .0722) / 255;
  // У цветов обычной палитры тёмной каймы нет. Она плавно усиливается к белому.
  const edgeAlpha = .6 * Math.max(0, Math.min(1, (lightness - .7) / .3));
  const ring = new Path2D();
  if (pattern === 'dots') {
    // Круглые отдельные точки с одинаковым шагом по всей окружности, без шва.
    const dotRadius = 1.2;
    const count = Math.max(6, Math.round(2 * Math.PI * radius / 5.5));
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 4 + i * 2 * Math.PI / count;
      const x = mid + radius * Math.cos(angle), y = mid + radius * Math.sin(angle);
      ring.moveTo(x + dotRadius, y);
      ring.arc(x, y, dotRadius, 0, 2 * Math.PI);
      ring.closePath();
    }
  } else if (pattern === 'dash') {
    // Ровно четыре дуги при любом диаметре и любых настройках длины штрихов.
    for (let i = 0; i < 4; i++) {
      const angle = -Math.PI / 4 + i * Math.PI / 2;
      const start = angle - Math.PI / 6;
      ring.moveTo(mid + radius * Math.cos(start), mid + radius * Math.sin(start));
      ring.arc(mid, mid, radius, start, angle + Math.PI / 6);
    }
  } else {
    ring.arc(mid, mid, radius, 0, Math.PI * 2);
  }
  const badge = new Path2D();
  if (mark === 'coordinates') {
    // Два перпендикулярных отрезка из центра, без наконечников.
    badge.moveTo(mid, mid - radius - 3);
    badge.lineTo(mid, mid);
    badge.lineTo(mid + radius + 3, mid);
  } else if (mark !== 'none') {
    // У прямой выступы по 3 px; у стрелки сохраняется прежний конец с головкой.
    const unit = Math.SQRT1_2;
    const tail = (radius + (mark === 'arrowBoth' ? 5 : 3)) * unit;
    const tip = (radius + (mark === 'line' ? 3 : 5)) * unit;
    const tipX = mid + tip, tipY = mid - tip;
    badge.moveTo(mid - tail, mid + tail);
    badge.lineTo(tipX, tipY);
    if (mark === 'arrow' || mark === 'arrowBoth') {
      badge.moveTo(tipX - 5 * unit, tipY + unit);
      badge.lineTo(tipX, tipY);
      badge.lineTo(tipX - unit, tipY + 5 * unit);
      if (mark === 'arrowBoth') {
        const tailX = mid - tail, tailY = mid + tail;
        badge.moveTo(tailX + 5 * unit, tailY - unit);
        badge.lineTo(tailX, tailY);
        badge.lineTo(tailX + unit, tailY - 5 * unit);
      }
    }
  }
  const draw = (scale: number): string => {
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(size * scale);
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.scale(scale, scale);
    const paint = (color: string, extra: number): void => {
      g.fillStyle = g.strokeStyle = color;
      g.lineCap = 'butt';
      if (pattern === 'dots') {
        if (extra > 0) { g.lineWidth = extra; g.stroke(ring); }
        g.fill(ring);
      } else {
        g.lineWidth = lineWidth + extra;
        g.stroke(ring);
      }
      g.lineWidth = lineWidth + extra;
      g.lineCap = g.lineJoin = 'round';
      g.stroke(badge);
    };
    // Ореол и кайма повторяют разрывы ободка и метку инструмента.
    paint('rgba(255,255,255,0.9)', 1.4);
    if (edgeAlpha > 0) paint(`rgba(25,28,36,${edgeAlpha})`, 1.2);
    paint(ink, 0);
    return c.toDataURL();
  };
  const spot = `${Math.round(mid)} ${Math.round(mid)}`;
  const css =
    dpr > 1
      ? `image-set(url(${draw(dpr)}) ${dpr}x) ${spot}, crosshair`
      : `url(${draw(1)}) ${spot}, crosshair`;
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, css);
  return css;
}

/** Запасной вариант, если браузер не принял image-set в cursor. */
export function fallbackCursor(): string {
  return 'crosshair';
}
