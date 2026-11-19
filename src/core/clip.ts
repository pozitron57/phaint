// Выпуклая область обрезки в локальных координатах объекта. Двигается вместе с ним.
import { matApply, type BBox, type Pt } from './geom.ts';
import type { Obj } from './types.ts';

export function boxPolygon(b:BBox):Pt[]{
  return [{x:b.minX,y:b.minY},{x:b.maxX,y:b.minY},{x:b.maxX,y:b.maxY},{x:b.minX,y:b.maxY}];
}
export function polygonBounds(points:readonly Pt[]):BBox {
  return {minX:Math.min(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxX:Math.max(...points.map(p=>p.x)),maxY:Math.max(...points.map(p=>p.y))};
}
const cross=(a:Pt,b:Pt,p:Pt)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
export function polygonArea(points:readonly Pt[]):number {
  if(points.length<3)return 0;
  return points.reduce((sum,a,i)=>sum+cross(points[0],a,points[(i+1)%points.length]),0)/2;
}
export function insideClip(points:readonly Pt[],p:Pt):boolean {
  const sign=Math.sign(polygonArea(points));
  return !!sign&&points.every((a,i)=>sign*cross(a,points[(i+1)%points.length],p)>=-1e-7);
}
export function intersectClip(subject:readonly Pt[],clip:readonly Pt[]):Pt[]{
  let result=[...subject];const sign=Math.sign(polygonArea(clip));
  if(!sign)return [];
  for(let i=0;i<clip.length&&result.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],input=result;result=[];
    let before=input.at(-1)!,d0=sign*cross(a,b,before);
    for(const point of input){
      const d1=sign*cross(a,b,point);
      if((d0>=0)!==(d1>=0)){
        const t=d0/(d0-d1);result.push({x:before.x+t*(point.x-before.x),y:before.y+t*(point.y-before.y)});
      }
      if(d1>=0)result.push(point);
      before=point;d0=d1;
    }
  }
  return result.filter((p,i)=>{const q=result[(i+1)%result.length];return Math.hypot(p.x-q.x,p.y-q.y)>1e-8;});
}
export function withClipBounds<T extends Obj>(o:T):T {
  if(!o.clip)return o;
  const points=o.clip.map(p=>{const q=o.matrix?matApply(o.matrix,p.x,p.y):p;return {x:q.x+o.ox,y:q.y+o.oy};});
  const visible=intersectClip(boxPolygon(o.bbox),points);
  const bbox=visible.length?polygonBounds(visible):{minX:points[0].x,minY:points[0].y,maxX:points[0].x,maxY:points[0].y};
  return {...o,bbox};
}
