// Геометрия: рамки (BBox) и аффинные матрицы в раскладке Canvas:
//   x' = a·x + c·y + e,   y' = b·x + d·y + f.

export interface Pt {
  x: number;
  y: number;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function bboxPad(b: BBox, d: number): BBox {
  return { minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d };
}

export function bboxUnion(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function matApply(m: Mat, x: number, y: number): Pt {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** Произведение m·n: сначала действует n, затем m. */
export function matMul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function matInvert(m: Mat): Mat {
  const det = m.a * m.d - m.b * m.c;
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}

/** Рамка образа прямоугольника b под действием m. */
export function matBBox(m: Mat, b: BBox): BBox {
  const xs = [m.a * b.minX, m.a * b.maxX];
  const ys = [m.c * b.minY, m.c * b.maxY];
  const us = [m.b * b.minX, m.b * b.maxX];
  const vs = [m.d * b.minY, m.d * b.maxY];
  return {
    minX: Math.min(xs[0], xs[1]) + Math.min(ys[0], ys[1]) + m.e,
    maxX: Math.max(xs[0], xs[1]) + Math.max(ys[0], ys[1]) + m.e,
    minY: Math.min(us[0], us[1]) + Math.min(vs[0], vs[1]) + m.f,
    maxY: Math.max(us[0], us[1]) + Math.max(vs[0], vs[1]) + m.f,
  };
}
