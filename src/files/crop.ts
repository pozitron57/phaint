// Снимок области M: только пересекающиеся объекты, с локальной обрезкой и точной рамкой SVG.
import { boxPolygon, insideClip, intersectClip, polygonArea, polygonBounds, withClipBounds } from '../core/clip.ts';
import { bboxIntersects, matApply, matInvert, type Pt, type Mat } from '../core/geom.ts';
import { objectMatrix } from '../core/transform.ts';
import type { DocumentData } from './codec.ts';

export interface ExportArea { corners:readonly Pt[] }
export function cropDocument(data:DocumentData,area:ExportArea):DocumentData {
  const corners=area.corners,bounds=polygonBounds(corners);
  const [a,b,,d]=corners,width=Math.hypot(b.x-a.x,b.y-a.y),height=Math.hypot(d.x-a.x,d.y-a.y);
  if(width<1e-6||height<1e-6)throw new Error('Область сохранения слишком мала.');
  const matrix:Mat={a:(b.x-a.x)/width,b:(d.x-a.x)/height,c:(b.y-a.y)/width,d:(d.y-a.y)/height,e:0,f:0};
  matrix.e=-matrix.a*a.x-matrix.c*a.y;matrix.f=-matrix.b*a.x-matrix.d*a.y;
  const objects=data.objects.flatMap(o=>{
    if(!bboxIntersects(o.bbox,bounds))return [];
    const box=boxPolygon(o.bbox);
    if(box.every(p=>insideClip(corners,p)))return [o];
    const intersection=intersectClip(box,corners);
    if(intersection.length<3||Math.abs(polygonArea(intersection))<1e-8)return [];
    const inverse=matInvert(objectMatrix(o));
    const local=corners.map(p=>matApply(inverse,p.x,p.y));
    const clip=o.clip?intersectClip(o.clip,local):local;
    return clip.length<3||Math.abs(polygonArea(clip))<1e-8?[]:[withClipBounds({...o,clip})];
  });
  return {...data,objects,emptyBounds:bounds,view:{...data.view,x:(a.x+corners[2].x)/2,y:(a.y+corners[2].y)/2},exportArea:{bounds,matrix,width,height}};
}
