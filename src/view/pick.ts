// Расстояние до видимой части объекта для выбора кликом; допуск задаётся в экранных px.
import type { Obj } from '../core/types.ts';
import { isLocked } from '../core/types.ts';
import type { Pt } from '../core/geom.ts';
import { objectMatrix } from '../core/transform.ts';
import { drawObj, objPath, vectorPath } from './draw.ts';

export const PICK_RADIUS=24;

export class ObjectPicker {
  private ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true})!;

  nearest(objects:Obj[],point:Pt,scale:number):Obj|null {
    const radius=PICK_RADIUS/scale;
    let found:Obj|null=null,best=Infinity;
    // При равном расстоянии, в том числе при прямом попадании, выбираем верхний слой.
    for(const o of objects.sort((a,b)=>b.z-a.z)){
      if(isLocked(o)||(o.kind==='vector'&&o.background))continue;
      const b=o.bbox,lower=Math.hypot(Math.max(b.minX-point.x,0,point.x-b.maxX),Math.max(b.minY-point.y,0,point.y-b.maxY));
      if(lower>Math.min(radius,best))continue;
      const distance=this.distance(o,point,scale);
      if(distance<best){best=distance;found=o;if(best===0)break;}
    }
    return found;
  }

  private distance(o:Obj,p:Pt,scale:number):number {
    if((o.kind==='stroke'||o.kind==='vector')&&o.opacity===0)return Infinity;
    // У собственных штрихов измеряем готовый контур с толщиной, точками и головками.
    // Преобразуем сам путь: растяжение маркера не должно растягивать допуск клика.
    let source:Path2D|undefined;
    if(!o.clip&&!(o.kind!=='image'&&o.erasures?.length)){
      if(o.kind==='stroke')source=objPath(o);
      else if(o.kind==='vector'&&o.fill!=='none'&&(o.stroke==='none'||o.strokeWidth===0))source=vectorPath(o);
      else if(o.kind==='image'){source=new Path2D();source.rect(0,0,o.width,o.height);}
    }
    if(!source)return this.pixelDistance(o,p,scale);
    // Центрируем около клика до записи в Path2D, чтобы большие мировые координаты
    // не отнимали точность у тонких линий. Дальше все расстояния — экранные.
    const m=objectMatrix(o),path=new Path2D();
    path.addPath(source,{a:m.a*scale,b:m.b*scale,c:m.c*scale,d:m.d*scale,e:(m.e-p.x)*scale,f:(m.f-p.y)*scale});
    const ctx=this.ctx;ctx.resetTransform();
    if(ctx.isPointInPath(path,0,0,o.kind==='vector'?o.fillRule:'nonzero'))return 0;
    ctx.lineJoin=ctx.lineCap='round';ctx.lineWidth=2*PICK_RADIUS;
    if(!ctx.isPointInStroke(path,0,0))return Infinity;
    // Расширение границы круглым пером даёт расстояние до контура, а не до его рамки.
    let low=0,high=PICK_RADIUS;
    while(high-low>.01){const mid=(low+high)/2;ctx.lineWidth=2*mid;if(ctx.isPointInStroke(path,0,0))high=mid;else low=mid;}
    return high/scale;
  }

  private pixelDistance(o:Obj,p:Pt,scale:number):number {
    // SVG, внешние обводки и маски измеряем по той же картинке, что видит пользователь.
    // Маленький участок с шагом 1/2 экранного px рисуется только при клике.
    const density=2,size=2*PICK_RADIUS*density+1,center=size/2,k=scale*density,ctx=this.ctx,canvas=ctx.canvas;
    if(canvas.width!==size||canvas.height!==size)canvas.width=canvas.height=size;
    else{ctx.resetTransform();ctx.clearRect(0,0,size,size);}
    if(o.kind==='image'){
      // PNG выбирается как целая картинка, включая её прозрачные поля.
      const m=objectMatrix(o);ctx.setTransform(k*m.a,k*m.b,k*m.c,k*m.d,center+k*(m.e-p.x),center+k*(m.f-p.y));ctx.save();
      if(o.clip){ctx.beginPath();o.clip.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.clip();}
      ctx.fillStyle='#000';ctx.fillRect(0,0,o.width,o.height);ctx.restore();
    }else drawObj(ctx,o,{a:k,b:0,c:0,d:k,e:0,f:0},center-p.x*k,center-p.y*k);
    const pixels=ctx.getImageData(0,0,size,size).data;ctx.resetTransform();
    let best=Infinity;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(pixels[(y*size+x)*4+3]){
      const distance=Math.hypot(x+.5-center,y+.5-center)/density;
      if(distance<=PICK_RADIUS)best=Math.min(best,distance/scale);
    }
    return best;
  }
}
