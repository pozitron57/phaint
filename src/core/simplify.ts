// Упрощение штриха: алгоритм Рамера — Дугласа — Пекера по тройкам x, y, w.
// Толщина участвует в расстоянии наравне с координатами, поэтому перепады нажатия сохраняются.

/** Возвращает новые тройки; tol — допустимое отклонение в единицах холста. */
export function simplify(pts: ArrayLike<number>, tol: number): Float32Array {
  const n = Math.floor(pts.length / 3);
  if (n <= 2 || !(tol > 0)) return Float32Array.from(pts as ArrayLike<number>);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const tol2 = tol * tol;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const b = stack.pop() as number;
    const a = stack.pop() as number;
    if (b - a < 2) continue;
    const ax = pts[3 * a];
    const ay = pts[3 * a + 1];
    const aw = pts[3 * a + 2];
    const ux = pts[3 * b] - ax;
    const uy = pts[3 * b + 1] - ay;
    const uw = pts[3 * b + 2] - aw;
    const uu = ux * ux + uy * uy + uw * uw;
    let worst = -1;
    let worstD = tol2;
    for (let i = a + 1; i < b; i++) {
      const px = pts[3 * i] - ax;
      const py = pts[3 * i + 1] - ay;
      const pw = pts[3 * i + 2] - aw;
      let t = uu > 0 ? (px * ux + py * uy + pw * uw) / uu : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * ux;
      const ey = py - t * uy;
      const ew = pw - t * uw;
      const d = ex * ex + ey * ey + ew * ew;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push(a, worst, worst, b);
    }
  }
  let m = 0;
  for (let i = 0; i < n; i++) m += keep[i];
  const out = new Float32Array(m * 3);
  let o = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    out[o++] = pts[3 * i];
    out[o++] = pts[3 * i + 1];
    out[o++] = pts[3 * i + 2];
  }
  return out;
}
