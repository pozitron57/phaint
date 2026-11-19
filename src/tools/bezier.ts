// Общие ручки Безье для рисования последней фигуры и инструмента M.
import type { App } from '../app.ts';
import { matApply, type Pt } from '../core/geom.ts';
import type { Obj, StrokeObj } from '../core/types.ts';
import { rebuildShape } from '../core/shapes.ts';

export function bendable(o:Obj|undefined|null):o is StrokeObj {
  return o?.kind==='stroke'&&(o.shape?.kind==='line'||o.shape?.kind==='arrow');
}
export function controlScreen(app:App,o:StrokeObj,p:Pt):Pt {
  const q=matApply(o.shape!.frame,p.x,p.y);return app.view.toScreen(o.ox+q.x,o.oy+q.y);
}
/** Удаляем только ближайшую видимую ручку; концы кривой остаются на месте. */
export function withoutControlAt(app:App,o:StrokeObj,point:Pt):StrokeObj|null {
  const controls=o.shape?.controls;if(!controls?.length)return null;
  let index=-1,best=9;
  controls.forEach((p,i)=>{const q=controlScreen(app,o,p),distance=Math.hypot(q.x-point.x,q.y-point.y);if(distance<=best){best=distance;index=i;}});
  if(index<0)return null;
  const remaining=controls.filter((_,i)=>i!==index);
  return rebuildShape(o,{...o.shape!,controls:remaining.length?remaining:undefined});
}
/** Пока точек меньше двух, добавляем следующую; затем перемещаем ближайшую. */
export function nextControlIndex(app:App,o:StrokeObj,point:Pt):number {
  const controls=o.shape!.controls??[];
  if(controls.length<2)return controls.length;
  const distance=(p:Pt)=>{const q=controlScreen(app,o,p);return Math.hypot(q.x-point.x,q.y-point.y);};
  return distance(controls[0])<=distance(controls[1])?0:1;
}
export function drawBezierControls(ctx:CanvasRenderingContext2D,app:App,o:StrokeObj,handles=true):void {
  const s=o.shape;if(!s?.controls?.length)return;
  const points=[{x:0,y:0},...s.controls,{x:s.length,y:s.height}].map(p=>controlScreen(app,o,p));
  const d=app.view.dpr;ctx.save();ctx.setTransform(d,0,0,d,0,0);ctx.lineWidth=1;ctx.strokeStyle='#cf914d';ctx.setLineDash([4,4]);
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.setLineDash([]);
  if(handles)for(const p of points.slice(1,-1)){ctx.fillStyle='#cf914d';ctx.fillRect(p.x-4,p.y-4,8,8);ctx.strokeStyle='#315ca8';ctx.strokeRect(p.x-4,p.y-4,8,8);}
  ctx.restore();
}
