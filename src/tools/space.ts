// Раздвижение: фиксируем горизонталь документа и состав нижних объектов при касании.
// Перенос вдоль Y учитывает прокрутку; локальная геометрия и порядок слоёв неизменны.
import type { App } from '../app.ts';
import { isLocked, type Obj } from '../core/types.ts';
import { transformObject } from '../core/transform.ts';
import { inheritImage } from '../view/draw.ts';
import type { PenSample, Tool } from './tool.ts';

export class SpaceTool implements Tool {
  readonly id='space';
  readonly scrollDuringDrag=true;
  private app:App;
  private active=false;
  private startY=0;
  private offset=0;
  private last={x:0,y:0};
  private originals:Obj[]=[];
  private current:Obj[]=[];

  constructor(app:App){this.app=app;}

  begin(s:PenSample):void {
    this.startY=this.app.view.toWorld(s.x,s.y).y;this.last={x:s.x,y:s.y};
    this.originals=[...this.app.doc.values()].filter(o=>!isLocked(o)&&!(o.kind==='vector'&&o.background)&&o.bbox.minY>=this.startY);
    this.current=this.originals;this.offset=0;this.active=true;
    this.app.renderer.setLive(this.draw);
  }

  move(samples:PenSample[]):void {
    const s=samples.at(-1);if(!this.active||!s)return;
    this.last={x:s.x,y:s.y};this.viewChanged();
  }

  viewChanged():void {
    if(!this.active)return;
    const dy=this.app.view.toWorld(this.last.x,this.last.y).y-this.startY;
    if(Math.abs(dy-this.offset)<1e-9)return;
    this.offset=Math.abs(dy)<1e-9?0:dy;
    const next=this.offset===0?this.originals:this.originals.map(o=>{
      const n=transformObject(o,{a:1,b:0,c:0,d:1,e:0,f:this.offset},true);
      inheritImage(o,n);return n;
    });
    // Предпросмотр не пересчитывает память истории для тысяч объектов на каждом отсчёте.
    // Сохранение/смена инструмента сначала завершают контакт; резервная копия ждёт отрыва.
    if(next.length)this.app.doc.apply(next,this.current);
    this.current=next;this.app.renderer.invalidateLive();
  }

  end():void {
    if(!this.active)return;
    // Doc заменяет объекты по id, поэтому окончательный снимок можно записать поверх
    // предпросмотра. Возврат к исходной линии сохраняет историю и прежний Redo.
    if(this.offset!==0&&this.current.length)this.app.history.commit({added:this.current,removed:this.originals});
    this.clear();
  }

  cancel():void {
    if(this.active&&this.offset!==0&&this.current.length)this.app.doc.apply(this.originals,this.current);
    this.clear();
  }

  private clear():void {
    this.active=false;this.originals=[];this.current=[];this.app.renderer.setLive(null);
  }

  private draw=(ctx:CanvasRenderingContext2D):void=>{
    const view=this.app.view,d=view.dpr,b=view.worldBounds();
    ctx.setTransform(d,0,0,d,0,0);ctx.lineWidth=1;
    const line=(y:number,color:string,dash:number[])=>{
      const a=view.toScreen(b.minX,y),z=view.toScreen(b.maxX,y);
      ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(z.x,z.y);ctx.stroke();
    };
    line(this.startY,'#637083',[5,4]);
    if(this.offset!==0)line(this.startY+this.offset,'#315ca8',[]);
    ctx.setLineDash([]);
  };
}
