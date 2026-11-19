// Контур штриха переменной толщины.
//
// Вход: точки осевой линии тройками x, y, w (w — полная толщина в точке).
// Выход: набор замкнутых петель из контрольных точек. Петля рисуется сглаженно:
// кривая идёт через середины рёбер (квадратичный B-сплайн), см. view/draw.ts.
//
// Как строится:
//   1. В острых углах (поворот круче 100°) линия рвётся на куски — там получается круглое соединение.
//   2. Внутри куска осевая линия на поворотах уплотняется точками гладкой кривой, проходящей
//      через исходные точки (центростремительный сплайн Катмулла — Рома): контур не зависит от
//      того, как редко перо отдавало отсчёты.
//   3. По уплотнённой линии строится «лента»: левая сторона вперёд, правая назад, полукруглые концы.
//   4. Там, где линия закручена круче собственной толщины, добавляются диски.
// Все петли одной ориентации, поэтому при заливке nonzero их объединение никогда не даёт дыр.

export type Loops = Float32Array[];

/** Отрезков в полукруге на конце штриха. */
const CAP_SEGS = 8;
/** B-сплайн проходит чуть внутри многоугольника; множители возвращают радиус на место. */
const CAP_COMP = 1.0195;
const DISC_N = 12;
const DISC_COMP = 1.035;
/** Поворот оси круче этого (100°) считается острым углом. */
const SHARP = (100 * Math.PI) / 180;
/** После уплотнения поворот между соседними точками не больше этого (около 14°). */
const SUB_ANGLE = 0.25;
const MAX_SUB = 8;
const MIN_W = 0.05;

/** Круг радиуса r как петля. Обход в ту же сторону, что и у ленты. */
export function discLoop(cx: number, cy: number, r: number): Float32Array {
  const out = new Float32Array(DISC_N * 2);
  const R = r * DISC_COMP;
  for (let k = 0; k < DISC_N; k++) {
    const a = (-2 * Math.PI * k) / DISC_N;
    out[2 * k] = cx + R * Math.cos(a);
    out[2 * k + 1] = cy + R * Math.sin(a);
  }
  return out;
}

/** Прямой стержень: торцы заданы геометрией, а не обрезанием уже округлённой ленты.
 * Повтор точек стыка не даёт квадратичному сглаживанию искривлять длинные боковые стороны. */
export function segmentOutline(pts:Float32Array,roundStart:boolean,roundEnd:boolean):Loops {
  const dx=pts[3]-pts[0],dy=pts[4]-pts[1],len=Math.hypot(dx,dy);
  if(len<1e-9)return strokeOutline(pts);
  const ux=dx/len,uy=dy/len,r=Math.max(pts[2],MIN_W)/2,nx=-uy*r,ny=ux*r;
  const out=new Float32Array(16+2*(CAP_SEGS-1)*(Number(roundStart)+Number(roundEnd)));
  let at=0;
  const corner=(x:number,y:number)=>{out[at++]=x;out[at++]=y;out[at++]=x;out[at++]=y;};
  corner(pts[0]+nx,pts[1]+ny);corner(pts[3]+nx,pts[4]+ny);
  if(roundEnd){cap(out,at,pts[3],pts[4],r,ux,uy);at+=2*(CAP_SEGS-1);}
  corner(pts[3]-nx,pts[4]-ny);corner(pts[0]-nx,pts[1]-ny);
  if(roundStart)cap(out,at,pts[0],pts[1],r,-ux,-uy);
  return [out];
}

/** Уже уплотнённая Безье: без дополнительного сглаживания оси, с заданными торцами. */
export function curveOutline(pts:Float32Array,roundStart:boolean,roundEnd:boolean):Loops {
  if(pts.length<6)return strokeOutline(pts);
  const loops:Loops=[];piece(loops,Array.from(pts),roundStart,roundEnd);return loops;
}

export function strokeOutline(pts: ArrayLike<number>, count: number = Math.floor(pts.length / 3)): Loops {
  const loops: Loops = [];
  const n = count;
  if (n <= 0) return loops;
  if (n === 1) {
    loops.push(discLoop(pts[0], pts[1], Math.max(pts[2], MIN_W) / 2));
    return loops;
  }

  // Единичные направления отрезков исходной линии.
  const m = n - 1;
  const dir = directions(pts, n);
  if (!dir) {
    // Все точки совпали — это точка.
    let w = MIN_W;
    for (let i = 0; i < n; i++) w = Math.max(w, pts[3 * i + 2]);
    loops.push(discLoop(pts[0], pts[1], w / 2));
    return loops;
  }
  const { dx, dy } = dir;

  // Угол поворота в каждой внутренней точке.
  const turn = new Float64Array(n);
  for (let i = 1; i < m; i++) {
    turn[i] = Math.acos(Math.min(1, Math.max(-1, dx[i - 1] * dx[i] + dy[i - 1] * dy[i])));
  }

  let start = 0;
  for (let i = 1; i < m; i++) {
    if (turn[i] > SHARP) {
      piece(loops, densify(pts, start, i, turn));
      start = i;
    }
  }
  piece(loops, densify(pts, start, m, turn));
  return loops;
}

/** Единичные направления отрезков ломаной; нулевые отрезки наследуют соседнее. null — все точки совпали. */
function directions(pts: ArrayLike<number>, n: number): { dx: Float64Array; dy: Float64Array; len: Float64Array } | null {
  const m = n - 1;
  const dx = new Float64Array(m);
  const dy = new Float64Array(m);
  const len = new Float64Array(m);
  let ux = 1;
  let uy = 0;
  let known = false;
  for (let i = 0; i < m; i++) {
    const ax = pts[3 * i + 3] - pts[3 * i];
    const ay = pts[3 * i + 4] - pts[3 * i + 1];
    const l = Math.hypot(ax, ay);
    if (l > 1e-9) {
      ux = ax / l;
      uy = ay / l;
      if (!known) {
        for (let k = 0; k < i; k++) {
          dx[k] = ux;
          dy[k] = uy;
        }
        known = true;
      }
    }
    dx[i] = ux;
    dy[i] = uy;
    len[i] = l;
  }
  return known ? { dx, dy, len } : null;
}

/**
 * Точки куска a..b исходной линии, уплотнённые на поворотах гладкой кривой через исходные точки.
 * Возвращает тройки x, y, w.
 */
function densify(pts: ArrayLike<number>, a: number, b: number, turn: Float64Array): number[] {
  const out: number[] = [];
  const px = (i: number): number => (i < a ? 2 * pts[3 * a] - pts[3 * a + 3] : i > b ? 2 * pts[3 * b] - pts[3 * b - 3] : pts[3 * i]);
  const py = (i: number): number => (i < a ? 2 * pts[3 * a + 1] - pts[3 * a + 4] : i > b ? 2 * pts[3 * b + 1] - pts[3 * b - 2] : pts[3 * i + 1]);
  for (let i = a; i < b; i++) {
    const w0 = pts[3 * i + 2];
    const w1 = pts[3 * i + 5];
    out.push(pts[3 * i], pts[3 * i + 1], w0);
    const bend = Math.max(i === a ? 0 : turn[i], i + 1 === b ? 0 : turn[i + 1]);
    const steps = Math.min(MAX_SUB, 1 + Math.floor(bend / SUB_ANGLE));
    if (steps < 2) continue;

    // Центростремительный сплайн Катмулла — Рома по точкам i-1, i, i+1, i+2 (на краях куска — отражение).
    const x0 = px(i - 1);
    const y0 = py(i - 1);
    const x1 = pts[3 * i];
    const y1 = pts[3 * i + 1];
    const x2 = pts[3 * i + 3];
    const y2 = pts[3 * i + 4];
    const x3 = px(i + 2);
    const y3 = py(i + 2);
    const k01 = Math.max(1e-4, Math.sqrt(Math.hypot(x1 - x0, y1 - y0)));
    const k12 = Math.max(1e-4, Math.sqrt(Math.hypot(x2 - x1, y2 - y1)));
    const k23 = Math.max(1e-4, Math.sqrt(Math.hypot(x3 - x2, y3 - y2)));
    const t1 = k01;
    const t2 = t1 + k12;
    const t3 = t2 + k23;
    for (let s = 1; s < steps; s++) {
      const u = s / steps;
      const t = t1 + u * k12;
      const a1 = (t1 - t) / t1;
      const b1 = t / t1;
      const a2 = (t2 - t) / k12;
      const b2 = (t - t1) / k12;
      const a3 = (t3 - t) / k23;
      const b3 = (t - t2) / k23;
      const A1x = a1 * x0 + b1 * x1;
      const A1y = a1 * y0 + b1 * y1;
      const A2x = a2 * x1 + b2 * x2;
      const A2y = a2 * y1 + b2 * y2;
      const A3x = a3 * x2 + b3 * x3;
      const A3y = a3 * y2 + b3 * y3;
      const c1 = (t2 - t) / t2;
      const d1 = t / t2;
      const c2 = (t3 - t) / (t3 - t1);
      const d2 = (t - t1) / (t3 - t1);
      const B1x = c1 * A1x + d1 * A2x;
      const B1y = c1 * A1y + d1 * A2y;
      const B2x = c2 * A2x + d2 * A3x;
      const B2y = c2 * A2y + d2 * A3y;
      out.push(a2 * B1x + b2 * B2x, a2 * B1y + b2 * B2y, w0 + (w1 - w0) * u);
    }
  }
  out.push(pts[3 * b], pts[3 * b + 1], pts[3 * b + 2]);
  return out;
}

/** Лента и, если нужно, диски для одного куска линии (тройки x, y, w; не меньше двух точек). */
function piece(loops: Loops, d: number[], roundStart=true, roundEnd=true): void {
  const cnt = d.length / 3;
  const dir = directions(d, cnt);
  if (!dir) {
    loops.push(discLoop(d[0], d[1], Math.max(d[2], MIN_W) / 2));
    return;
  }
  const { dx, dy, len } = dir;
  const last = cnt - 1;
  const startCap=roundStart?CAP_SEGS-1:2,endCap=roundEnd?CAP_SEGS-1:2;
  const out = new Float32Array((2 * cnt + startCap + endCap) * 2);
  const rightBase = cnt + endCap;

  for (let i = 0; i <= last; i++) {
    let tx: number;
    let ty: number;
    if (i === 0) {
      tx = dx[0];
      ty = dy[0];
    } else if (i === last) {
      tx = dx[last - 1];
      ty = dy[last - 1];
    } else {
      // Нормаль к биссектрисе соседних отрезков.
      tx = dx[i - 1] + dx[i];
      ty = dy[i - 1] + dy[i];
      const tl = Math.hypot(tx, ty);
      if (tl > 1e-6) {
        tx /= tl;
        ty /= tl;
      } else {
        tx = dx[i];
        ty = dy[i];
      }
      // Радиус изгиба меньше ~0.6 толщины: внутренняя сторона ленты выворачивается
      // и может дать дыру — закрываем диском.
      const theta = Math.acos(Math.min(1, Math.max(-1, dx[i - 1] * dx[i] + dy[i - 1] * dy[i])));
      const w = d[3 * i + 2];
      if (theta > 1e-3 && (len[i - 1] + len[i]) / 2 < theta * 0.6 * w) {
        loops.push(discLoop(d[3 * i], d[3 * i + 1], Math.max(w, MIN_W) / 2));
      }
    }
    const h = Math.max(d[3 * i + 2], MIN_W) / 2;
    const nx = -ty * h;
    const ny = tx * h;
    const x = d[3 * i];
    const y = d[3 * i + 1];
    out[2 * i] = x + nx;
    out[2 * i + 1] = y + ny;
    const ri = (rightBase + (last - i)) * 2;
    out[ri] = x - nx;
    out[ri + 1] = y - ny;
  }

  // Полукруг на конце: от левой стороны через направление движения к правой.
  if(roundEnd)cap(out, cnt * 2, d[3 * last], d[3 * last + 1], Math.max(d[3 * last + 2], MIN_W) / 2, dx[last - 1], dy[last - 1]);
  else out.set([out[2*last],out[2*last+1],out[2*rightBase],out[2*rightBase+1]],cnt*2);
  // Полукруг в начале: от правой стороны через «назад» к левой.
  const tail=(2*cnt+endCap)*2;
  if(roundStart)cap(out,tail,d[0],d[1],Math.max(d[2],MIN_W)/2,-dx[0],-dy[0]);
  else out.set([out[tail-2],out[tail-1],out[0],out[1]],tail);
  loops.push(out);
}

/** Пишет внутренние точки полукруга вокруг (cx, cy), выпуклого в направлении (fx, fy). */
function cap(out: Float32Array, at: number, cx: number, cy: number, r: number, fx: number, fy: number): void {
  const R = r * CAP_COMP;
  // Нормаль «слева» от направления: (-fy, fx).
  for (let j = 1; j < CAP_SEGS; j++) {
    const phi = (j * Math.PI) / CAP_SEGS;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    out[at++] = cx + (-fy * c + fx * s) * R;
    out[at++] = cy + (fx * c + fy * s) * R;
  }
}

/** Ориентированная площадь петли (для тестов): у всех петель знак должен совпадать. */
export function loopArea(p: ArrayLike<number>): number {
  const n = p.length >> 1;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  return s / 2;
}
