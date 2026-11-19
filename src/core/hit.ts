// Пересечение видимого контура с непрерывным следом ластика, в том числе после растяжения.
// Аппроксимация тех же квадратичных кривых, что рисует Canvas. Кэш живёт вместе с объектом.
import { matApply, type Pt } from './geom.ts';
import { objectMatrix } from './transform.ts';
import { strokeLoops } from './shapes.ts';
import type { StrokeObj } from './types.ts';

const contours=new WeakMap<StrokeObj,Float64Array[]>();

function polygons(o:StrokeObj):Float64Array[] {
  const cached=contours.get(o);if(cached)return cached;
  const m=objectMatrix(o);
  const result=strokeLoops(o).map(loop=>{
    const points:Pt[]=[];
    for(let i=0;i<loop.length;i+=2)points.push(matApply(m,loop[i],loop[i+1]));
    const out:number[]=[];
    const curve=(a:Pt,c:Pt,b:Pt,depth:number):void=>{
      if(depth>=12||distance2(c.x,c.y,a.x,a.y,b.x,b.y)<=.0016){out.push(b.x,b.y);return;}
      const ac={x:(a.x+c.x)/2,y:(a.y+c.y)/2},cb={x:(c.x+b.x)/2,y:(c.y+b.y)/2},mid={x:(ac.x+cb.x)/2,y:(ac.y+cb.y)/2};
      curve(a,ac,mid,depth+1);curve(mid,cb,b,depth+1);
    };
    for(let i=0;i<points.length;i++){
      const a=points[(i+points.length-1)%points.length],c=points[i],b=points[(i+1)%points.length];
      curve({x:(a.x+c.x)/2,y:(a.y+c.y)/2},c,{x:(b.x+c.x)/2,y:(b.y+c.y)/2},0);
    }
    return Float64Array.from(out);
  });
  contours.set(o,result);return result;
}

function distance2(x:number,y:number,ax:number,ay:number,bx:number,by:number):number {
  const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
  return (x-ax-t*dx)**2+(y-ay-t*dy)**2;
}

/** Без масок старых файлов: проверяем весь путь между событиями, а не только его концы. */
export function strokeIntersectsSweep(o:StrokeObj,from:Pt,to:Pt,radius:number):boolean {
  const minX=Math.min(from.x,to.x)-radius,maxX=Math.max(from.x,to.x)+radius;
  const minY=Math.min(from.y,to.y)-radius,maxY=Math.max(from.y,to.y)+radius,r2=radius*radius;
  const dx=to.x-from.x,dy=to.y-from.y;
  let winding=0;
  for(const p of polygons(o))for(let i=0;i<p.length;i+=2){
    const j=(i+2)%p.length,ax=p[i],ay=p[i+1],bx=p[j],by=p[j+1],ex=bx-ax,ey=by-ay;
    const cross=ex*(from.y-ay)-ey*(from.x-ax);
    if(ay<=from.y&&by>from.y&&cross>0)winding++;
    if(ay>from.y&&by<=from.y&&cross<0)winding--;
    if(Math.max(ax,bx)<minX||Math.min(ax,bx)>maxX||Math.max(ay,by)<minY||Math.min(ay,by)>maxY)continue;
    if(distance2(ax,ay,from.x,from.y,to.x,to.y)<=r2||distance2(bx,by,from.x,from.y,to.x,to.y)<=r2
      ||distance2(from.x,from.y,ax,ay,bx,by)<=r2||distance2(to.x,to.y,ax,ay,bx,by)<=r2)return true;
    const det=dx*ey-dy*ex;
    if(Math.abs(det)>1e-12){
      const t=((ax-from.x)*ey-(ay-from.y)*ex)/det,u=((ax-from.x)*dy-(ay-from.y)*dx)/det;
      if(t>=0&&t<=1&&u>=0&&u<=1)return true;
    }
  }
  return winding!==0;
}
