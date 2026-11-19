// Ластик вырезает участки собственных штрихов. Поиск только в рамке движения через R-дерево;
// один контакт пера объединяет все изменения в один шаг истории.
// По флажку маскирует исходный SVG; вставленные картинки не трогает.
import { matInvert } from '../core/geom.ts';
import { objectMatrix } from '../core/transform.ts';
import { coordinateAxes, dashedPoints, arrowHeads, identity, strokeLoops } from '../core/shapes.ts';
import { loopsToSvg } from '../files/codec.ts';
import { drawObj, inheritImage } from '../view/draw.ts';
import type { App } from '../app.ts';
import type { Pt } from '../core/geom.ts';
import { eraseStroke } from '../core/erase.ts';
import { strokeIntersectsSweep } from '../core/hit.ts';
import { withClipBounds } from '../core/clip.ts';
import { makeStroke, isLocked, type Obj, type StrokeObj, type VectorObj } from '../core/types.ts';
import type { PenSample, Tool } from './tool.ts';

export class EraserTool implements Tool {
  readonly id = 'eraser';
  private app: App;
  private previous: Pt | null = null;
  private group: object | null = null;
  private radius = 12;
  private hitCanvas:HTMLCanvasElement|null=null;

  constructor(app: App) { this.app=app; }

  begin(s: PenSample): void {
    this.radius=this.app.settings.eraser.width/2;
    this.group={};
    this.previous=this.app.view.toWorld(s.x,s.y);
    this.app.renderer.settle();
    this.app.renderer.busy=true;
    this.erase(this.previous);
  }

  move(samples: PenSample[]): void {
    for (const s of samples) this.erase(this.app.view.toWorld(s.x,s.y));
  }

  private erase(to: Pt): void {
    const from=this.previous, group=this.group;
    if (!from || !group) return;
    const {doc,history}=this.app, r=this.radius;
    const candidates=doc.query({minX:Math.min(from.x,to.x)-r,minY:Math.min(from.y,to.y)-r,
      maxX:Math.max(from.x,to.x)+r,maxY:Math.max(from.y,to.y)+r});
    const added: Obj[]=[], removed: Obj[]=[];
    for (let o of candidates) {
      if(o.kind==='image'||isLocked(o)) continue;
      const original=o;
      if(o.kind==='stroke'&&(o.shape?.kind==='arrow'||o.shape?.kind==='coordinates')&&o.shape.headType==='filled'){
        // Сохраняем точный закрашенный наконечник при частичном стирании.
        const bounds={minX:o.bbox.minX-o.ox,minY:o.bbox.minY-o.oy,maxX:o.bbox.maxX-o.ox,maxY:o.bbox.maxY-o.oy};
        o={kind:'vector',id:o.id,z:o.z,ox:o.ox,oy:o.oy,matrix:identity(),d:loopsToSvg(strokeLoops(o)),
          fill:o.color,stroke:'none',strokeWidth:0,fillRule:'nonzero',linecap:'round',linejoin:'round',opacity:1,
          bounds,bbox:o.bbox,native:true,...(o.clip?{clip:o.clip}:{})} satisfies VectorObj;
      }
      if(o.kind==='stroke'&&o.marker){
        if(strokeIntersectsSweep(o,from,to,r)&&(!(o.erasures?.length||o.clip)||this.maskedMarkerHit(o,from,to,r)))removed.push(o);
        continue;
      }
      if(o.kind==='svg'||o.kind==='vector') {
        if((!this.app.settings.eraser.original&&!(o.kind==='vector'&&o.native))||(o.kind==='vector'&&o.background)) continue;
        const m=matInvert(objectMatrix(o));
        const next={...o,erasures:[...(o.erasures??[]),[from.x,from.y,to.x,to.y,r,m.a,m.b,m.c,m.d,m.e,m.f]]};
        inheritImage(o,next); removed.push(original);added.push(next);continue;
      }
      const axes=o.shape?.kind==='coordinates'?coordinateAxes(o):[o];
      const pieces=axes.flatMap(axis=>[...dashedPoints(axis.pts,axis.dash),...arrowHeads(axis)]);
      let hit=false;
      const parts=pieces.flatMap(pts=>{const cut=eraseStroke({...o,pts},from,to,r);if(cut)hit=true;return cut??[pts];});
      if (!hit) continue;
      removed.push(o);
      for (const pts of parts){
        const piece=withClipBounds({...makeStroke(doc.nextId(),o.z,o.ox,o.oy,pts,o.color),...(o.clip?{clip:o.clip}:{})});
        if(piece.bbox.maxX>piece.bbox.minX&&piece.bbox.maxY>piece.bbox.minY)added.push(piece);
      }
    }
    history.commit({added,removed},group);
    this.previous=to;
  }

  /** Старые SVG могли содержать частично стёртый маркер: касание его пустой маски не удаляет полосу. */
  private maskedMarkerHit(o:StrokeObj,from:Pt,to:Pt,r:number):boolean {
    const x=Math.max(o.bbox.minX,Math.min(from.x,to.x)-r),y=Math.max(o.bbox.minY,Math.min(from.y,to.y)-r);
    const w=Math.min(o.bbox.maxX,Math.max(from.x,to.x)+r)-x,h=Math.min(o.bbox.maxY,Math.max(from.y,to.y)+r)-y;
    if(w<=0||h<=0)return false;
    const scale=Math.min(2,512/w,512/h),c=this.hitCanvas??=document.createElement('canvas');
    c.width=Math.max(1,Math.ceil(w*scale));c.height=Math.max(1,Math.ceil(h*scale));
    const g=c.getContext('2d',{willReadFrequently:true})!,m={a:scale,b:0,c:0,d:scale,e:0,f:0};
    drawObj(g,o,m,-x*scale,-y*scale);
    g.setTransform(scale,0,0,scale,-x*scale,-y*scale);g.globalCompositeOperation='destination-in';
    g.fillStyle=g.strokeStyle='black';g.lineCap='round';g.lineWidth=2*r;g.beginPath();
    if(from.x===to.x&&from.y===to.y){g.arc(from.x,from.y,r,0,Math.PI*2);g.fill();}
    else{g.moveTo(from.x,from.y);g.lineTo(to.x,to.y);g.stroke();}
    const pixels=g.getImageData(0,0,c.width,c.height).data;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i])return true;
    return false;
  }

  end(): void {
    if (this.group) this.app.history.endGroup(this.group);
    this.reset();
  }

  cancel(): void {
    if (this.group) this.app.history.cancelGroup(this.group);
    this.reset();
  }

  private reset(): void { this.group=null; this.previous=null; this.app.renderer.busy=false; }
}
