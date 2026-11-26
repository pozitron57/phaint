// Фигуры: параметры остаются редактируемыми после фиксации и открытия SVG.
// Парабола задаётся двумя жестами: концы, затем точка изгиба; Esc отменяет оба этапа.
import { translate } from '../core/menu-text.ts';
import type { App } from '../app.ts';
import { arrowHeadStyle, inkDash, rebuildShape, shapeData, shapePoints, withShapeBounds, type ShapeKind, type ShapeData } from '../core/shapes.ts';
import { makeStroke, type StrokeObj } from '../core/types.ts';
import { objPath } from '../view/draw.ts';
import { matApply, matInvert, type Pt } from '../core/geom.ts';
import type { DocChange } from '../core/doc.ts';
import { bendable, nextControlIndex, drawBezierControls, withoutControlAt } from './bezier.ts';
import type { PenSample, Tool } from './tool.ts';
import { gridSnap, snapPoint, snapSegment } from '../core/snap.ts';

export class ShapeTool implements Tool {
  readonly id: ShapeKind;
  private app:App;
  private start:Pt|null=null;
  private tip:Pt|null=null;
  private stage=0;
  private ctrl=false;
  private alt=false;
  private origin:Pt|null=null;
  private parabolaEnd:Pt|null=null;
  private shape:ShapeData;
  private lastId:number|null=null;
  private curveOriginal:StrokeObj|null=null;
  private curveIndex=0;
  private curveGroup:object={};
  private showControls=false;
  constructor(app:App,id:ShapeKind){this.app=app;this.id=id;this.shape=shapeData(id);}
  get pending():boolean{return this.start!==null;}
  begin(s:PenSample):void {
    const last=this.lastId===null?undefined:this.app.doc.get(this.lastId);
    if(this.app.input.held('gesture.bezier',s)&&(this.id==='line'||this.id==='arrow')&&bendable(last)){
      this.curveOriginal=last;this.curveGroup={};
      this.curveIndex=nextControlIndex(this.app,last,s);
      this.showControls=true;this.app.renderer.settle();this.app.renderer.busy=true;this.app.renderer.setLive(this.draw);this.move([s]);return;
    }
    this.showControls=false;
    this.readModifiers(s);
    if(this.id==='parabola'&&this.stage===1){this.stage=2;this.move([s]);return;}
    this.start=this.app.view.toWorld(s.x,s.y);this.tip=this.start;this.stage=0;this.parabolaEnd=null;
    // Начало фиксируется один раз. У кривых и окружности остальные точки свободные;
    // у прямой/стрелки/координат поздний Alt обращает привязку только конца.
    this.origin=gridSnap(this.app.settings.snapToGrid,this.alt)?snapPoint(this.start,this.app.settings.grid.step):this.start;
    if(this.id!=='line'&&this.id!=='arrow'&&this.id!=='coordinates')this.tip=this.origin;
    this.shape=shapeData(this.id,this.app.settings.grid.step);this.app.renderer.settle();this.app.renderer.busy=true;this.update();
    this.app.renderer.setLive(this.draw);
  }
  move(samples:PenSample[]):void {
    const s=samples.at(-1);if(!s)return;
    if(this.curveOriginal){
      const o=this.curveOriginal,shape={...o.shape!},p=this.app.view.toWorld(s.x,s.y);
      const controls=[...(shape.controls??[])];controls[this.curveIndex]=matApply(matInvert(shape.frame),p.x-o.ox,p.y-o.oy);shape.controls=controls;
      const current=this.app.doc.get(o.id);if(!current)return;
      if(current.kind==='stroke'&&JSON.stringify(current.shape?.controls)===JSON.stringify(controls))return;
      this.app.history.commit({added:[rebuildShape(o,shape)],removed:[current]},this.curveGroup);return;
    }
    if(!this.start)return;
    this.readModifiers(s);
    this.tip=this.app.view.toWorld(s.x,s.y);this.update();
  }
  private readModifiers(s?:PenSample):void {
    this.ctrl=this.app.input.held(this.id==='ellipse'?'gesture.ellipse':this.id==='parabola'?'gesture.parabola':'gesture.angle',s);
    this.alt=this.app.input.held('gesture.grid',s);
  }
  modifiersChanged():void{this.readModifiers();this.update();}
  secondary(s:PenSample):void {
    if(!this.showControls||this.start||this.curveOriginal||this.lastId===null)return;
    const o=this.app.doc.get(this.lastId);if(!bendable(o))return;
    const next=withoutControlAt(this.app,o,s);if(next)this.app.history.commit({added:[next],removed:[o]});
  }
  settingsChanged():void{this.update();}
  private update():void {
    if(!this.start||!this.tip)return;
    const dx=this.tip.x-this.origin!.x,dy=this.tip.y-this.origin!.y,s=this.shape;
    const snap=gridSnap(this.app.settings.snapToGrid,this.alt);
    if(this.id==='parabola'&&this.stage>0){
      s.length=this.parabolaEnd!.x;s.height=this.ctrl?0:this.parabolaEnd!.y;
      const t=Math.max(.1,Math.min(.9,Math.abs(s.length)>.01?dx/s.length:.5));
      if(this.stage===2)s.bend=(dy-s.height*t)/(4*t*(1-t));
    } else if(this.id==='ellipse'){
      const x=this.tip.x-this.origin!.x,y=this.tip.y-this.origin!.y,r=Math.hypot(x,y);
      s.length=this.ctrl?Math.abs(x):r;s.height=this.ctrl?Math.abs(y):r;
    } else if(this.id==='sine'){
      s.period=this.app.settings.sine.period;s.amplitude=this.app.settings.sine.amplitude;
      s.cycles=Math.min(1000,Math.abs(dx)/s.period);s.frame.a=dx<0?-1:1;
    } else if(this.id==='parabola'){
      s.length=dx;s.height=this.ctrl?0:dy;s.bend=-Math.hypot(s.length,s.height)*.3;
    } else if(this.id==='hyperbola'||this.id==='adiabat'){
      s.length=s.height=Math.max(Math.abs(dx),Math.abs(dy));
      s.frame.a=dx<0?-1:1;s.frame.d=dy<0?-1:1;
      if(this.id==='adiabat')s.gamma=this.app.settings.hyperbola.gamma;
    } else if(this.id==='coordinates'){
      // Касание — вертикальный наконечник; движущийся конец — горизонтальный.
      // Ноль имеет x первой точки и y второй, поэтому направление жеста задаёт четверть.
      const end=snap?snapPoint(this.tip,this.app.settings.grid.step):this.tip;
      s.length=end.x-this.origin!.x;s.height=this.origin!.y-end.y;
    } else {
      const ends=snapSegment(this.start,this.tip,this.app.settings.grid.step,snap,this.ctrl,this.origin!);
      s.length=ends.end.x-ends.start.x;s.height=ends.end.y-ends.start.y;
    }
    if(this.id==='arrow'||this.id==='coordinates'){
      s.both=this.id==='arrow'&&this.app.settings.arrow.both;
      Object.assign(s,arrowHeadStyle(this.app.arrowHeadSettings(this.id,s.both)));
    }
    this.app.renderer.invalidateLive();
  }
  private object(id:number,z:number):StrokeObj {
    const b=this.app.ink,s={...this.shape,frame:{...this.shape.frame}},pts=shapePoints(s,b.width);
    const oy=this.origin!.y-(this.id==='coordinates'?s.height:0);
    return withShapeBounds({...makeStroke(id,z,this.origin!.x,oy,pts,b.color),shape:s,
      ...(b.dashed?{dash:inkDash(b,b.width)}:{})});
  }
  end():void {
    if(this.curveOriginal){this.app.history.endGroup(this.curveGroup);this.curveOriginal=null;this.app.renderer.busy=false;this.app.renderer.invalidateLive();return;}
    if(!this.start)return;
    if(this.id==='parabola'&&this.stage===0){this.parabolaEnd={x:this.shape.length,y:this.shape.height};this.stage=1;this.app.renderer.busy=false;this.app.hud.toast(`${translate('Парабола · потяните изгиб')}${this.app.actions.hint('gesture.parabola')?' · '+this.app.actions.hint('gesture.parabola')+translate(' — концы на одном уровне'):''}`);return;}
    this.finishPending();
  }
  finishPending():void {
    if(!this.start)return;
    const {doc,history}=this.app,o=this.object(doc.nextId(),doc.topZ());history.commit({added:[o],removed:[]});this.cancel();this.lastId=o.id;
    if(this.id==='arrow'||this.id==='coordinates')this.app.recentArrow=o;
  }
  cancel():void{
    if(this.curveOriginal)this.app.history.cancelGroup(this.curveGroup);
    this.curveOriginal=null;this.showControls=false;this.start=this.tip=this.parabolaEnd=this.origin=null;this.stage=0;this.app.renderer.busy=false;this.app.renderer.setLive(null);
  }
  changed(change:DocChange):void {
    if(change.reset){this.lastId=null;this.showControls=false;this.app.renderer.setLive(null);}
    else if(this.showControls)this.app.renderer.invalidateLive();
  }
  private draw=(ctx:CanvasRenderingContext2D):void=>{
    if(this.showControls&&this.lastId!==null){const o=this.app.doc.get(this.lastId);if(bendable(o))drawBezierControls(ctx,this.app,o);return;}
    if(!this.start)return;const o=this.object(0,0);this.app.renderer.place(ctx,o.ox,o.oy);ctx.fillStyle=o.color;ctx.fill(objPath(o));
  };
}
