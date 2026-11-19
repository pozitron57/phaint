// Частичный векторный ластик: пересечения осевой линии с непрерывным следом круглого ластика.
// Возвращает оставшиеся куски с исходными нажимом и цветом. Учитывает толщину линии,
// разреженные отсчёты и касания-точки; быстрый проход не оставляет промежутков между событиями.
import type { Pt } from './geom.ts';
import type { StrokeObj } from './types.ts';

type Interval = [number, number];
const EPS = 1e-9;

function distance2(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx-ax, dy = by-ay, len = dx*dx+dy*dy;
  const t = len ? Math.max(0, Math.min(1, ((x-ax)*dx+(y-ay)*dy)/len)) : 0;
  return (x-ax-t*dx)**2 + (y-ay-t*dy)**2;
}

/** Части отрезка внутри капсулы. Радиус расширен на линейно меняющуюся полутолщину штриха. */
function cuts(x: number, y: number, dx: number, dy: number, w: number, dw: number,
  ax: number, ay: number, bx: number, by: number, radius: number): Interval[] {
  const pad = radius + Math.max(w, w+dw)/2;
  if (Math.max(x,x+dx)+pad < Math.min(ax,bx) || Math.min(x,x+dx)-pad > Math.max(ax,bx)
    || Math.max(y,y+dy)+pad < Math.min(ay,by) || Math.min(y,y+dy)-pad > Math.max(ay,by)) return [];
  const ux=bx-ax, uy=by-ay, length2=ux*ux+uy*uy;
  const qx=x-ax, qy=y-ay;
  const s0=length2 ? (qx*ux+qy*uy)/length2 : 0;
  const sd=length2 ? (dx*ux+dy*uy)/length2 : 0;
  const spans=[0,1];
  if (Math.abs(sd)>EPS) for (const s of [0,1]) {
    const t=(s-s0)/sd;
    if (t>0 && t<1) spans.push(t);
  }
  spans.sort((a,b)=>a-b);
  const out: Interval[]=[];
  for (let i=1;i<spans.length;i++) {
    const lo=spans[i-1], hi=spans[i], s=s0+sd*(lo+hi)/2;
    let ex=qx, ey=qy, vx=dx, vy=dy;
    if (s>=1) { ex-=ux; ey-=uy; }
    else if (s>0) { ex-=ux*s0; ey-=uy*s0; vx-=ux*sd; vy-=uy*sd; }
    const r=radius+w/2, dr=dw/2;
    const a=vx*vx+vy*vy-dr*dr, b=2*(ex*vx+ey*vy-r*dr), c=ex*ex+ey*ey-r*r;
    const points=[lo,hi];
    const root=(t: number): void => { if (t>lo && t<hi) points.push(t); };
    if (Math.abs(a)<EPS) { if (Math.abs(b)>EPS) root(-c/b); }
    else {
      const disc=b*b-4*a*c;
      if (disc>=0) {
        // Устойчивая форма корней, в том числе для очень короткого конца длинного штриха.
        const q=-0.5*(b+(b<0 ? -1 : 1)*Math.sqrt(disc));
        root(q/a); if (q) root(c/q);
      }
    }
    points.sort((a,b)=>a-b);
    for (let j=1;j<points.length;j++) {
      const start=points[j-1], end=points[j], t=(start+end)/2;
      if (end-start<=EPS || (a*t+b)*t+c>0) continue;
      const last=out.at(-1);
      if (last && start-last[1]<EPS) last[1]=end;
      else out.push([start,end]);
    }
  }
  return out;
}

/** null — ластик не задел штрих; [] — стёр целиком; иначе оставшиеся фрагменты. */
export function eraseStroke(stroke: StrokeObj, from: Pt, to: Pt, radius: number): Float32Array[] | null {
  const p=stroke.pts;
  const ax=from.x-stroke.ox, ay=from.y-stroke.oy, bx=to.x-stroke.ox, by=to.y-stroke.oy;
  if (p.length===3) return distance2(p[0],p[1],ax,ay,bx,by)<=(radius+p[2]/2)**2 ? [] : null;
  const pieces: Float32Array[]=[];
  let part: number[]=[], changed=false;
  const flush=(): void => { if (part.length) pieces.push(Float32Array.from(part)); part=[]; };
  for (let i=3;i<p.length;i+=3) {
    const x=p[i-3], y=p[i-2], w=p[i-1], dx=p[i]-x, dy=p[i+1]-y, dw=p[i+2]-w;
    const removed=cuts(x,y,dx,dy,w,dw,ax,ay,bx,by,radius);
    const append=(t: number): void => {
      const px=x+dx*t, py=y+dy*t, pw=w+dw*t, n=part.length;
      if (n && Math.abs(part[n-3]-px)<EPS && Math.abs(part[n-2]-py)<EPS && Math.abs(part[n-1]-pw)<EPS) return;
      part.push(px,py,pw);
    };
    let start=0;
    for (const [lo,hi] of removed) {
      changed=true;
      if (lo-start>EPS) { append(start); append(lo); }
      flush(); start=hi;
    }
    if (1-start>EPS) { append(start); append(1); }
  }
  flush();
  return changed ? pieces : null;
}
