// Экспортная аппроксимация замкнутого B-сплайна. Исходные отсчёты/контуры не меняются.
// Дуги → точная вспомогательная ломаная → объединение перекрытий → короткие Безье.
// Ширина пера и близкие границы ограничивают ошибку только в своём участке;
// выше 3 px их защита ослабляется постепенно, только в экспортной копии.
import type { Loops } from '../core/outline.ts';
import ClipperLib from 'clipper-lib';
import {fitContour,curvesSvg,type Curve} from './contour-fit.ts';
import {widthLimit,protectGaps} from './contour-limits.ts';
import {contourDetailLoss} from './export-options.ts';

function distance2(x:number,y:number,ax:number,ay:number,bx:number,by:number):number {
  const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
  return (x-ax-t*dx)**2+(y-ay-t*dy)**2;
}
function flattenContour(loop:Float32Array,limit:(x:number,y:number)=>number):number[] {
  const n=loop.length/2;if(n<3)return [];
  let x=(loop[0]+loop[loop.length-2])/2,y=(loop[1]+loop[loop.length-1])/2;
  const points:number[]=[x,y];
  const flatten=(ax:number,ay:number,cx:number,cy:number,bx:number,by:number,depth=0):void=>{
    const allowed=Math.min(.005,limit(ax,ay)*.06,limit(cx,cy)*.06,limit(bx,by)*.06);
    // Выпуклость расстояния до отрезка даёт предел 2t(1−t)·distance(control, chord).
    const error=Math.sqrt(distance2(cx,cy,ax,ay,bx,by))/2;
    if(depth>=18||error<=allowed){
      if(Math.hypot(bx-points.at(-2)!,by-points.at(-1)!)>1e-10)points.push(bx,by);return;
    }
    const ux=(ax+cx)/2,uy=(ay+cy)/2,vx=(cx+bx)/2,vy=(cy+by)/2,mx=(ux+vx)/2,my=(uy+vy)/2;
    flatten(ax,ay,ux,uy,mx,my,depth+1);flatten(mx,my,vx,vy,bx,by,depth+1);
  };
  for(let i=0;i<n;i++){
    const j=(i+1)%n,cx=loop[2*i],cy=loop[2*i+1],bx=(cx+loop[2*j])/2,by=(cy+loop[2*j+1])/2;
    flatten(x,y,cx,cy,bx,by);x=bx;y=by;
  }
  if(Math.hypot(points[0]-points.at(-2)!,points[1]-points.at(-1)!)<1e-9)points.splice(-2);
  return points;
}
export function contourCurves(loops:Loops,tolerance:number,pts?:Float32Array,compactThin=false,detailLoss=contourDetailLoss(tolerance)):Curve[][] {
  const limit=widthLimit(pts,tolerance,compactThin,detailLoss),polygons=loops.map(loop=>flattenContour(loop,limit)).filter(p=>p.length>=6);
  // Ручка закрывает тесные завитки перекрывающимися дисками. Их внутренние границы
  // не видны: объединение внутри одного штриха убирает большую часть записи.
  let max=1;for(const p of polygons)for(const v of p)max=Math.max(max,Math.abs(v));
  const scale=Math.min(1000000,1e13/max);
  let merged=polygons;
  if(polygons.length&&scale*tolerance>100){
    const clipper=new ClipperLib.Clipper(),solution:ClipperLib.Paths=[];
    clipper.AddPaths(polygons.map(p=>Array.from({length:p.length/2},(_,i)=>({X:Math.round(p[2*i]*scale),Y:Math.round(p[2*i+1]*scale)}))),ClipperLib.PolyType.ptSubject,true);
    if(clipper.Execute(ClipperLib.ClipType.ctUnion,solution,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero)&&solution.length)
      merged=solution.filter(p=>p.length>=3).map(p=>p.flatMap(v=>[v.X/scale,v.Y/scale]));
  }
  return protectGaps(merged,limit,detailLoss).map(fitContour);
}
export function compactContours(loops:Loops,tolerance:number,precision:number,fallback:(loops:Loops,precision:number)=>string,pts?:Float32Array,compactThin=false,detailLoss=contourDetailLoss(tolerance)):string {
  if(tolerance<=0)return fallback(loops,precision);
  // Чрезвычайно малый ручной допуск: точная запись дешевле поиска миллионов дуг.
  if(tolerance<.0001)return fallback(loops,Math.max(precision,8));
  const curves=contourCurves(loops,tolerance,pts,compactThin,detailLoss),parts=curves.map(p=>curvesSvg(p,precision));
  let safePrecision=Math.max(precision,3);
  for(const loop of curves)for(const c of loop)safePrecision=Math.min(8,Math.max(safePrecision,Math.ceil(-Math.log10(Math.max(c.tolerance,1e-8)*.12))));
  const original=fallback(loops,safePrecision);
  if(!parts.length||parts.some(p=>p===null))return original;
  const compact=parts.join('');
  return compact.length<original.length?compact:original;
}
