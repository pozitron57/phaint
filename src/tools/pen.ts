// Ручка и маркер. Контур одного прохода заливается один раз: самопересечения не темнеют.
import { safePredictions } from '../core/prediction.ts';
import type { App } from '../app.ts';
import { StrokeBuilder } from '../core/stroke-builder.ts';
import { makeStroke, type StrokeObj } from '../core/types.ts';
import { objPath } from '../view/draw.ts';
import type { PenSample, Tool } from './tool.ts';
import type { InkSettings } from '../core/settings.ts';
import { inkDash } from '../core/shapes.ts';

export class PenTool implements Tool {
  readonly id:'pen'|'marker';
  private app:App;
  private builder:StrokeBuilder|null=null;
  private samples:PenSample[]=[];
  private style:InkSettings|null=null;
  private predicted:number[]=[];
  private opacity=1;
  private predictionTimer=0;
  private ctrl=false;
  constructor(app:App,id:'pen'|'marker'='pen'){this.app=app;this.id=id;}
  begin(s:PenSample):void {
    this.ctrl=this.app.input.held('gesture.marker',s);
    const {settings,view,renderer}=this.app;
    this.style={...settings[this.id]};this.opacity=this.id==='marker'?settings.marker.opacity:1;
    const pen=this.id==='marker'?{...settings.pen,...this.style,pressure:0,speed:0,taper:0}:settings.pen;
    this.builder=new StrokeBuilder({...pen},(x,y)=>view.toWorld(x,y),view.scale,s.x,s.y);
    this.builder.add(s.x,s.y,s.pressure,s.t);this.samples=[s];this.predicted=[];
    renderer.settle();renderer.busy=true;renderer.setLive(this.draw,this.id==='marker');
  }
  move(samples:PenSample[],predicted:PenSample[]=[]):void {
    if(!this.builder)return;
    if(samples.length)this.ctrl=this.app.input.held('gesture.marker',samples.at(-1));
    for(const s of samples){this.samples.push(s);this.builder.add(s.x,s.y,s.pressure,s.t);}
    if(this.samples.length>3)this.samples.splice(1,this.samples.length-3);
    this.predicted=[];window.clearTimeout(this.predictionTimer);
    if(this.id==='pen'&&this.app.settings.input.predict)for(const s of safePredictions(this.samples.at(-1)!,this.samples.at(-2),predicted)){const p=this.app.view.toWorld(s.x,s.y);this.predicted.push(p.x-this.builder.ox,p.y-this.builder.oy,this.builder.tipWidth);}
    if(this.predicted.length)this.predictionTimer=window.setTimeout(()=>{this.predicted=[];this.app.renderer.invalidateLive();},40);
    this.app.renderer.invalidateLive();
  }
  modifiersChanged():void {this.ctrl=this.app.input.held('gesture.marker');if(this.builder)this.app.renderer.invalidateLive();}
  settingsChanged():void {if(this.id==='marker'&&this.builder){this.style={...this.app.settings.marker};this.opacity=this.app.settings.marker.opacity;this.app.renderer.invalidateLive();}}
  private object(pts:Float32Array,id=0,z=0):StrokeObj {
    const b=this.builder!,s=this.style!;
    if(this.id==='marker'){pts=pts.slice();for(let i=2;i<pts.length;i+=3)pts[i]=s.width;}
    return {...makeStroke(id,z,b.ox,b.oy,pts,s.color),...(s.dashed&&this.id!=='marker'?{dash:inkDash(s,s.width)}:{}),
      ...(this.id==='marker'?{marker:true,opacity:this.opacity}:{})};
  }
  private straight():Float32Array|null {
    if(this.id!=='marker'||!this.ctrl||!this.builder)return null;
    const a=this.samples[0],b=this.samples.at(-1)!,p=this.app.view.toWorld(a.x,a.y),q=this.app.view.toWorld(b.x,b.y),w=this.style!.width;
    const dx=q.x-p.x,dy=q.y-p.y,l=Math.hypot(dx,dy),angle=Math.round(Math.atan2(dy,dx)/(Math.PI/12))*Math.PI/12;
    return Float32Array.of(p.x-this.builder.ox,p.y-this.builder.oy,w,p.x-this.builder.ox+Math.cos(angle)*l,p.y-this.builder.oy+Math.sin(angle)*l,w);
  }
  end():void {
    const b=this.builder;if(!b)return;const pts=this.straight()??b.finish();
    if(pts){const {doc,history}=this.app;history.commit({added:[this.object(pts,doc.nextId(),doc.topZ())],removed:[]});}this.cancel();
  }
  cancel():void{window.clearTimeout(this.predictionTimer);this.builder=null;this.samples=[];this.predicted=[];this.app.renderer.busy=false;this.app.renderer.setLive(null);}
  private draw=(ctx:CanvasRenderingContext2D):void=>{
    const b=this.builder;if(!b)return;
    const pts=this.straight()??b.previewPoints(this.predicted);
    const o=this.object(pts);this.app.renderer.place(ctx,o.ox,o.oy);ctx.save();ctx.fillStyle=o.color;ctx.globalAlpha=o.opacity??1;ctx.fill(objPath(o));ctx.restore();
  };
}
