// Преобразования выделения. Штрихи сохраняют толщину; контуры SVG и картинки меняются целиком.
import { matApply, matBBox, matMul, type Mat, type BBox, type Pt } from './geom.ts';
import { coordinateFrame, identity, rebuildShape, withShapeBounds } from './shapes.ts';
import { makeStroke, type Obj } from './types.ts';
import { withClipBounds } from './clip.ts';
export function objectMatrix(o: Obj): Mat {
  const m=o.matrix??identity();
  return {...m,e:m.e+o.ox,f:m.f+o.oy};
}
export function localBounds(o: Exclude<Obj,{kind:'stroke'}>): BBox {
  return o.kind==='vector'?o.bounds:{minX:0,minY:0,maxX:o.width,maxY:o.height};
}
export function transformObject(o:Obj,m:Mat,keepWidth:boolean):Obj {
  const origin=matApply(m,o.ox,o.oy),linear={...m,e:0,f:0};
  if(o.kind==='stroke') {
    if(o.marker)return withShapeBounds({...o,ox:origin.x,oy:origin.y,matrix:matMul(linear,o.matrix??identity())});
    const scale=keepWidth&&!o.marker?1:Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));
    const pts=new Float32Array(o.pts.length);
    for(let i=0;i<pts.length;i+=3){const p=matApply(linear,o.pts[i],o.pts[i+1]);pts[i]=p.x;pts[i+1]=p.y;pts[i+2]=o.pts[i+2]*scale;}
    const next={...o,...makeStroke(o.id,o.z,origin.x,origin.y,pts,o.color),...(o.clip?{clip:o.clip.map(p=>matApply(linear,p.x,p.y))}:{}),...(o.dash?{dash:{...o.dash,length:o.dash.length*scale,gap:o.dash.gap*scale}}:{})};
    if(!o.shape)return withClipBounds(next);
    const frame=matMul(linear,o.shape.frame);
    return rebuildShape(next,{...o.shape,frame:o.shape.kind==='coordinates'?coordinateFrame(frame):frame});
  }
  const matrix=matMul(linear,o.matrix??identity());
  const next={...o,ox:origin.x,oy:origin.y,matrix};
  return withClipBounds({...next,bbox:matBBox(objectMatrix(next),localBounds(next))});
}
export function around(center:Pt,m:Mat):Mat {
  return {...m,e:center.x-m.a*center.x-m.c*center.y,f:center.y-m.b*center.x-m.d*center.y};
}
export function rotation(center:Pt,angle:number):Mat {
  const c=Math.cos(angle),s=Math.sin(angle);return around(center,{a:c,b:s,c:-s,d:c,e:0,f:0});
}
