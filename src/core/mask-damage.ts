// Область изменений при добавлении/отмене маски. Геометрия и оформление должны остаться прежними.
// Это позволяет перерисовать маленький участок плитки, не трогая остальной большой SVG-контур.
import { bboxUnion, matBBox, matMul, type BBox } from './geom.ts';
import { objectMatrix } from './transform.ts';
import type { Obj } from './types.ts';

export function maskDamage(added:readonly Obj[],removed:readonly Obj[]):BBox|undefined {
  if(!added.length||added.length!==removed.length)return;
  const previous=new Map(removed.map(o=>[o.id,o]));let bounds:BBox|undefined;
  for(const o of added){
    const old=previous.get(o.id);if(!old||old.kind==='image'||o.kind==='image')return;
    const a=old as unknown as Record<string,unknown>,b=o as unknown as Record<string,unknown>;
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))if(key!=='erasures'&&a[key]!==b[key])return;
    const before=old.erasures??[],after=o.erasures??[];
    const short=before.length<after.length?before:after,long=short===before?after:before;
    if(short.length===long.length||short.some((mark,i)=>mark!==long[i]))return;
    for(const [x,y,u,v,r,...basis] of long.slice(short.length)){
      const matrix=objectMatrix(o),m=basis.length===6?matMul(matrix,{a:basis[0],b:basis[1],c:basis[2],d:basis[3],e:basis[4],f:basis[5]}):matrix;
      const box=matBBox(m,{minX:Math.min(x,u)-r,minY:Math.min(y,v)-r,maxX:Math.max(x,u)+r,maxY:Math.max(y,v)+r});
      bounds=bounds?bboxUnion(bounds,box):box;
    }
  }
  return bounds;
}
