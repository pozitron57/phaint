// Опорная точка для переноса в M. Выбирается по первому касанию и сохраняется на весь жест.
import { boxPolygon, insideClip } from '../core/clip.ts';
import { matApply, matInvert, matMul, type Mat, type Pt } from '../core/geom.ts';
import { objectMatrix } from '../core/transform.ts';
import type { Obj } from '../core/types.ts';

function ellipseAnchors(frame: Mat, rx: number, ry: number): Pt[] {
  const center = {x:frame.e,y:frame.f}, points = [center];
  // Крайние точки вдоль осей холста, в том числе у повёрнутого или растянутого эллипса.
  const u = {x:frame.a*rx,y:frame.b*rx}, v = {x:frame.c*ry,y:frame.d*ry};
  for (const axis of ['x','y'] as const) {
    const radius = Math.hypot(u[axis],v[axis]);
    if (!radius) continue;
    const cos = u[axis]/radius, sin = v[axis]/radius;
    const dx = u.x*cos + v.x*sin, dy = u.y*cos + v.y*sin;
    points.push({x:center.x+dx,y:center.y+dy}, {x:center.x-dx,y:center.y-dy});
  }
  return points;
}

function anchors(o: Obj): Pt[] {
  let points: Pt[] = [];
  const m = objectMatrix(o);
  if (o.kind === 'stroke') {
    if (o.shape?.kind === 'ellipse') {
      points = ellipseAnchors(matMul(m,o.shape.frame),o.shape.length,o.shape.height);
    } else if (o.pts.length >= 3) {
      const point = (i: number) => matApply(m,o.pts[i],o.pts[i+1]);
      points.push(point(0));
      if (o.shape?.kind === 'coordinates') points.push(point(3));
      if (o.pts.length > 3) points.push(point(o.pts.length-3));
    }
  } else if (o.kind === 'vector' && !/[zZ]/.test(o.d) && o.d.match(/[mM]/g)?.length === 1) {
    // У простого внешнего пути берём настоящие концы кривой, в том числе у относительных команд.
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',o.d);
    const length = path.getTotalLength();
    if (length > 0) {
      const from = path.getPointAtLength(0), to = path.getPointAtLength(length);
      points = [matApply(m,from.x,from.y),matApply(m,to.x,to.y)];
    }
  }
  if (o.clip && points.length) {
    const inverse = matInvert(m), clip = o.clip;
    points = points.filter(p => insideClip(clip,matApply(inverse,p.x,p.y)));
  }
  return points.length ? points : boxPolygon(o.bbox);
}

export function selectionMoveAnchor(objects: readonly Obj[], grab: Pt): Pt {
  let best = grab, distance = Infinity;
  for (const o of objects) {
    const b = o.bbox;
    const dx = Math.max(0,b.minX-grab.x,grab.x-b.maxX), dy = Math.max(0,b.minY-grab.y,grab.y-b.maxY);
    if (dx*dx + dy*dy >= distance) continue;
    for (const p of anchors(o)) {
      const d = (p.x-grab.x)**2 + (p.y-grab.y)**2;
      if (d < distance) { best = p; distance = d; }
    }
  }
  return best;
}
