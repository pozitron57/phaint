// M: временная группа, рамка, перенос, размер, отражение, поворот, порядок и ручки фигур.
import type { App } from '../app.ts';
import type { Obj, StrokeObj } from '../core/types.ts';
import { makeStroke, isLocked, strokeBBox } from '../core/types.ts';
import { bboxUnion, matApply, matBBox, matInvert, matMul, type BBox, type Pt } from '../core/geom.ts';
import { around, rotation, transformObject } from '../core/transform.ts';
import { identity, rebuildShape, withShapeBounds } from '../core/shapes.ts';
import { inheritImage } from '../view/draw.ts';
import { ObjectPicker, PICK_RADIUS } from '../view/pick.ts';
import type { DocChange } from '../core/doc.ts';
import type { PenSample, Tool } from './tool.ts';
import { bendable, nextControlIndex, drawBezierControls, withoutControlAt } from './bezier.ts';
import type { KeyLike } from '../core/actions.ts';
import { reorderObjects, type ObjectOrder } from '../core/order.ts';

type Mode = 'none'|'box'|'move'|'resize'|'rotate'|'pivot'|'amplitude'|'period'|'length'|'bend'|'endpoint'|'control1'|'control2'|'curve'|'axisX'|'axisY';
type Handle = {name:Mode;point:Pt;corner?:number;anchor?:Pt};
export class SelectTool implements Tool {
  readonly id='select';
  objects:Obj[]=[];
  private moveStarted=false;
  get selected():Obj|null{return this.objects[0]??null;}
  private app:App;
  private mode:Mode='none';
  private start:Pt={x:0,y:0};
  private last:Pt={x:0,y:0};
  private originals:Obj[]=[];
  private box:BBox|null=null;
  private corner=0;
  private group:object={};
  private keyMove:{code:string;group:object}|null=null;
  private add=false;
  private pivot:Pt|null=null;
  private initialPivot:Pt|null=null;
  private initialManualPivot=false;
  private pivotOffset:Pt={x:0,y:0};
  private pivotSnap:Pt|null=null;
  private pivotSnapped=false;
  private replacing=false;
  private curveIndex=0;
  private picker=new ObjectPicker();
  constructor(app:App){this.app=app;}
  show(o:Obj|null):void{this.set(o?[o]:[]);}
  showObjects(objects:Obj[]):void{this.set(objects);}
  selectAll():void{this.set([...this.app.doc.values()].filter(o=>!isLocked(o)&&(o.kind!=='vector'||!o.background)));}
  private set(objects:Obj[],resetPivot=true):void{
    if(resetPivot)this.finishNudge();
    objects=objects.filter(o=>!isLocked(o));this.objects=objects;if(resetPivot){this.pivot=null;this.pivotSnap=null;this.pivotSnapped=false;}
    const o=objects.length===1?objects[0]:null;
    this.app.renderer.prepareEdit(o?.kind==='stroke'&&o.shape&&!o.marker?o:null);
    this.app.renderer.setLive(objects.length||this.mode==='box'?this.draw:null);this.app.toolbar.update();
    this.app.panels.brush.sync();
  }
  changed(change:DocChange):void {
    if(!this.replacing)this.finishNudge();
    if(change.reset){this.mode='none';this.set([]);return;}
    if(!this.objects.length)return;
    if(!this.replacing)this.pivot=null;
    const added=new Map(change.added.map(o=>[o.id,o])),removed=new Set(change.removed.map(o=>o.id));
    this.set(this.objects.flatMap(o=>added.has(o.id)?[added.get(o.id)!]:removed.has(o.id)?[]:[o]),false);
  }
  private screenBox(objects=this.objects):BBox|null {
    if(!objects.length)return null;
    const m=this.app.view.matrix(),d=this.app.view.dpr;
    const b=objects.map(o=>matBBox(m,o.bbox)).reduce(bboxUnion);
    return {minX:b.minX/d,minY:b.minY/d,maxX:b.maxX/d,maxY:b.maxY/d};
  }
  private center():Pt {
    if(this.pivot)return this.pivot;
    const o=this.selected;
    if(this.objects.length===1&&o?.kind==='stroke'&&o.shape?.kind==='coordinates'){
      const p=matApply(o.shape.frame,0,0);return {x:o.ox+p.x,y:o.oy+p.y};
    }
    const b=this.screenBox()!;return this.app.view.toWorld((b.minX+b.maxX)/2,(b.minY+b.maxY)/2);
  }
  private handles():Handle[]{
    const b=this.screenBox();if(!b)return [];
    const out:Handle[]=[
      {name:'resize',point:{x:b.minX,y:b.minY},corner:0},{name:'resize',point:{x:b.maxX,y:b.minY},corner:1},
      {name:'resize',point:{x:b.maxX,y:b.maxY},corner:2},{name:'resize',point:{x:b.minX,y:b.maxY},corner:3},
      {name:'rotate',point:{x:(b.minX+b.maxX)/2,y:b.minY-25}}];
    if(this.objects.length===1&&this.selected?.kind==='stroke'&&this.selected.shape){
      const o=this.selected,s=o.shape!;
      const add=(name:Mode,x:number,y:number)=>{const p=matApply(s.frame,x,y);out.unshift({name,point:this.app.view.toScreen(o.ox+p.x,o.oy+p.y)});};
      if(s.kind==='arrow'||(s.kind==='line'&&s.controls?.length))add('endpoint',s.length,s.height);
      if(s.kind==='coordinates'){add('axisX',s.length,0);add('axisY',0,s.height);}
      s.controls?.forEach((p,i)=>add(i===0?'control1':'control2',p.x,p.y));
      if(s.kind==='sine'){
        add('amplitude',s.period/4,-s.amplitude);add('period',s.period,0);add('length',s.period*s.cycles,0);
        // У одного периода ручки длины и периода совпадали. Разносим их на экране.
        out[0].point.y+=18;
      }
      if(s.kind==='parabola')add('bend',s.length/2,s.height/2+s.bend);
    }
    const anchor=this.app.view.toScreen(this.center().x,this.center().y);
    let point=anchor;
    // Центр, поставленный на угол, не закрывает ручку размера. Крестик выносится наружу,
    // короткая соединительная линия указывает точное положение оси вращения.
    if(this.mode!=='pivot'&&out.some(h=>Math.hypot(h.point.x-anchor.x,h.point.y-anchor.y)<14)){
      point={x:anchor.x+(anchor.x<=(b.minX+b.maxX)/2?-16:16),y:anchor.y+(anchor.y<=(b.minY+b.maxY)/2?-16:16)};
    }
    out.push({name:'pivot',point,anchor});return out;
  }
  begin(s:PenSample,additiveOverride?:boolean):void {
    this.finishNudge();
    const additive=additiveOverride??this.app.input.held('gesture.addSelection',s);
    this.moveStarted=false;
    this.initialManualPivot=this.pivot!==null;
    this.start=this.last={x:s.x,y:s.y};this.group={};this.add=additive;this.originals=[...this.objects];this.box=this.screenBox();this.initialPivot=this.objects.length?this.center():null;
    const distance=(h:Handle)=>Math.hypot(h.point.x-s.x,h.point.y-s.y);
    const handle=this.handles().filter(h=>(!additive||(h.name==='resize'&&this.app.input.held('gesture.resizeFree',s)))&&distance(h)<(h.name==='pivot'?5:9)).sort((a,b)=>distance(a)-distance(b))[0];
    if(handle){
      this.mode=handle.name;this.corner=handle.corner??0;
      if(handle.name!=='pivot'&&this.editingShape())this.app.renderer.busy=true;
      if(handle.name==='pivot'){
        this.pivotOffset={x:s.x-handle.anchor!.x,y:s.y-handle.anchor!.y};this.pivotSnap=null;this.pivotSnapped=false;
      }
      return;
    }
    // Существующие ручки имеют приоритет: Ctrl у угла растягивает от центра,
    // а в остальном месте добавляет/двигает точку Безье.
    if(!additive&&this.app.input.held('gesture.bezier',s)&&this.objects.length===1&&bendable(this.selected)){
      this.app.renderer.busy=true;
      this.mode='curve';this.curveIndex=nextControlIndex(this.app,this.selected,s);this.move([s]);return;
    }
    const b=this.box;
    if(!additive&&b&&s.x>=b.minX&&s.x<=b.maxX&&s.y>=b.minY&&s.y<=b.maxY){this.mode='move';return;}
    const p=this.app.view.toWorld(s.x,s.y),pad=PICK_RADIUS/this.app.view.scale;
    const candidates=this.app.doc.query({minX:p.x-pad,minY:p.y-pad,maxX:p.x+pad,maxY:p.y+pad});
    const found=this.picker.nearest(candidates,p,this.app.view.scale);
    if(found){
      if(additive){this.set(this.objects.some(o=>o.id===found.id)?this.objects.filter(o=>o.id!==found.id):[...this.objects,found]);this.mode='none';}
      else{this.set([found]);this.mode='move';this.originals=[found];this.box=this.screenBox();this.initialPivot=this.center();}
    }else{this.mode='box';if(!additive)this.set([]);this.app.renderer.setLive(this.draw);}
  }
  secondary(s:PenSample):void {
    if(this.mode!=='none'||this.objects.length!==1||!bendable(this.selected))return;
    const next=withoutControlAt(this.app,this.selected,s);if(next)this.replace([next]);
  }
  move(samples:PenSample[]):void {
    const s=samples.at(-1);if(!s)return;this.last={x:s.x,y:s.y};
    if(this.mode==='box'){this.app.renderer.invalidateLive();return;}
    if(this.mode==='none'||!this.originals.length)return;
    // Выбор происходит при касании, перенос — только после осмысленного движения.
    // Порог экранный, поэтому одинаков при любом масштабе и на Retina.
    if(this.mode==='move'&&!this.moveStarted){
      if(Math.hypot(s.x-this.start.x,s.y-this.start.y)<5)return;
      this.moveStarted=true;if(this.editingShape())this.app.renderer.busy=true;
    }
    const view=this.app.view,p=view.toWorld(s.x,s.y),a=view.toWorld(this.start.x,this.start.y);
    if(this.mode==='pivot'){
      const target=this.snapPivot({x:s.x-this.pivotOffset.x,y:s.y-this.pivotOffset.y},this.app.input.held('gesture.pivotFree',s));
      this.pivot=view.toWorld(target.x,target.y);this.app.renderer.invalidateLive();return;
    }
    let m=identity(),unchanged=Math.abs(s.x-this.start.x)+Math.abs(s.y-this.start.y)<.01;
    if(this.mode==='move'){m.e=p.x-a.x;m.f=p.y-a.y;}
    else if(this.mode==='rotate'){
      const c=this.initialPivot!;let angle=Math.atan2(p.y-c.y,p.x-c.x)-Math.atan2(a.y-c.y,a.x-c.x);
      if(this.app.input.held('gesture.rotate',s))angle=Math.round(angle/(Math.PI/12))*Math.PI/12;m=rotation(c,angle);
    }else if(this.mode==='resize'){
      const b=this.box!,left=this.corner===0||this.corner===3,top=this.corner<2;
      const centerResize=this.app.input.held('gesture.resizeCenter',s);
      const cx=centerResize?(b.minX+b.maxX)/2:left?b.maxX:b.minX,cy=centerResize?(b.minY+b.maxY)/2:top?b.maxY:b.minY;
      const bx=left?b.minX:b.maxX,by=top?b.minY:b.maxY;
      let sx=(s.x-cx)/(bx-cx||1),sy=(s.y-cy)/(by-cy||1);
      // Размер ведёт горизонтальная координата угла: короткая высота не усиливает движение пера.
      // Знак по Y сохраняет отражение при переходе через противоположную сторону.
      if(!this.app.input.held('gesture.resizeFree',s))sy=Math.sign(sy||1)*Math.abs(sx);
      sx=Math.abs(sx)<.0001?(sx<0?-.0001:.0001):sx;sy=Math.abs(sy)<.0001?(sy<0?-.0001:.0001):sy;
      unchanged ||= sx===1&&sy===1;
      const v={...view.matrix()};for(const k of ['a','b','c','d','e','f'] as const)v[k]/=view.dpr;
      m=matMul(matInvert(v),matMul(around({x:cx,y:cy},{a:sx,b:0,c:0,d:sy,e:0,f:0}),v));
    }else{
      const o=this.originals[0];if(o.kind!=='stroke'||!o.shape)return;
      const shape={...o.shape},local=matApply(matInvert(shape.frame),p.x-o.ox,p.y-o.oy);
      if(this.mode==='amplitude'){
        shape.amplitude=Math.abs(local.y);
        // Переход через ось отражает волну и ручку, не делая матрицу вырожденной в нуле.
        if(local.y>0)shape.frame={...shape.frame,c:-shape.frame.c,d:-shape.frame.d};
      }
      if(this.mode==='period')shape.period=Math.max(12,Math.abs(local.x));
      if(this.mode==='length')shape.cycles=Math.min(1000,Math.max(0,local.x/shape.period));
      if(this.mode==='bend')shape.bend=local.y-shape.height/2;
      if(this.mode==='axisX'||this.mode==='axisY'){
        // Сохраняем точку захвата, меняем только одну длину вдоль собственной оси.
        const before=matApply(matInvert(shape.frame),a.x-o.ox,a.y-o.oy);
        if(this.mode==='axisX')shape.length+=local.x-before.x;else shape.height+=local.y-before.y;
      }
      if(this.mode==='curve'){
        const controls=[...(shape.controls??[])];controls[this.curveIndex]=local;shape.controls=controls;
      }
      if(this.mode==='control1'||this.mode==='control2'){
        const index=this.mode==='control1'?0:1,controls=[...shape.controls!],old=matApply(shape.frame,controls[index].x,controls[index].y);
        controls[index]=matApply(matInvert(shape.frame),old.x+p.x-a.x,old.y+p.y-a.y);shape.controls=controls;
      }
      if(this.mode==='endpoint'){
        // Смещение от точки захвата сохраняет начало и не даёт скачка при касании края ручки.
        const n=o.pts.length;let dx=o.pts[n-3]-o.pts[0]+p.x-a.x,dy=o.pts[n-2]-o.pts[1]+p.y-a.y;
        if(this.app.input.held('gesture.angle',s)){const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/12))*Math.PI/12,len=Math.hypot(dx,dy);dx=Math.cos(angle)*len;dy=Math.sin(angle)*len;}
        const end=matApply(matInvert(shape.frame),o.pts[0]+dx,o.pts[1]+dy);
        shape.length=end.x;shape.height=end.y;
      }
      const current=this.selected?.kind==='stroke'?this.selected.shape:undefined;
      if(current&&(['amplitude','period','cycles','bend','length','height'] as const).every(key=>shape[key]===current[key])&&JSON.stringify(shape.frame)===JSON.stringify(current.frame)&&JSON.stringify(shape.controls)===JSON.stringify(current.controls))return;
      this.replace([rebuildShape(o,shape)],this.group);return;
    }
    if(unchanged){
      this.pivot=this.initialManualPivot?this.initialPivot:null;this.replace(this.originals,this.group);return;
    }
    const next=this.originals.map(o=>{const n=transformObject(o,m,this.app.settings.selection.keepWidth);inheritImage(o,n);return n;});
    this.pivot=this.initialManualPivot&&this.initialPivot?matApply(m,this.initialPivot.x,this.initialPivot.y):null;
    this.replace(next,this.group);
  }
  modifiersChanged():void{if(this.mode!=='none')this.move([{...this.last,pressure:.5,t:performance.now(),ctrl:this.app.input.ctrl,shift:this.app.input.shift,alt:this.app.input.alt,meta:this.app.input.meta}]);}
  private editingShape():boolean {
    return this.objects.length===1&&this.selected?.kind==='stroke'&&!!this.selected.shape&&!this.selected.marker;
  }
  private snapPivot(p:Pt,free:boolean):Pt {
    this.pivotSnapped=false;
    if(free||!this.box){this.pivotSnap=null;return p;}
    // Порог в экранных пикселях одинаков при любом масштабе. Выход из точки чуть шире входа.
    if(this.pivotSnap&&Math.hypot(p.x-this.pivotSnap.x,p.y-this.pivotSnap.y)<=14){this.pivotSnapped=true;return this.pivotSnap;}
    this.pivotSnap=null;
    const b=this.box,xs=[b.minX,(b.minX+b.maxX)/2,b.maxX],ys=[b.minY,(b.minY+b.maxY)/2,b.maxY];
    const anchors=xs.flatMap(x=>ys.map(y=>({x,y}))).sort((a,b)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(p.x-b.x,p.y-b.y));
    if(Math.hypot(p.x-anchors[0].x,p.y-anchors[0].y)<=10){this.pivotSnapped=true;return this.pivotSnap=anchors[0];}
    const q={...p};
    if(p.y>=b.minY&&p.y<=b.maxY)for(const x of [b.minX,b.maxX])if(Math.abs(p.x-x)<=8){q.x=x;this.pivotSnapped=true;break;}
    if(p.x>=b.minX&&p.x<=b.maxX)for(const y of [b.minY,b.maxY])if(Math.abs(p.y-y)<=8){q.y=y;this.pivotSnapped=true;break;}
    return q;
  }
  end():void {
    if(this.mode==='box'){
      const b={minX:Math.min(this.start.x,this.last.x),minY:Math.min(this.start.y,this.last.y),maxX:Math.max(this.start.x,this.last.x),maxY:Math.max(this.start.y,this.last.y)};
      const found=[...this.app.doc.values()].filter(o=>{
        if(isLocked(o)||(o.kind==='vector'&&o.background))return false;const r=this.screenBox([o])!;
        return r.minX>=b.minX&&r.maxX<=b.maxX&&r.minY>=b.minY&&r.maxY<=b.maxY;
      });
      this.mode='none';this.set([...new Map([...(this.add?this.originals:[]),...found].map(o=>[o.id,o])).values()]);
    }
    this.app.history.endGroup(this.group);this.mode='none';this.originals=[];this.pivotSnapped=false;this.pivotSnap=null;this.app.renderer.busy=false;this.app.renderer.invalidateLive();
  }
  cancel():void{this.app.history.cancelGroup(this.group);this.mode='none';this.originals=[];this.app.renderer.busy=false;this.set([]);}
  private replace(next:Obj[],group?:object):void {
    if(this.keyMove&&this.keyMove.group!==group)this.finishNudge();
    if(next.every((o,i)=>o===this.objects[i]))return;
    const old=[...this.objects];this.replacing=true;
    try{this.app.history.commit({added:next,removed:old},group);}finally{this.replacing=false;}
    this.set(next,false);
  }
  remove():void {if(this.objects.length&&!this.app.input.drawing){this.app.history.commit({added:[],removed:this.objects});this.set([]);}}
  /** Стрелки сдвигают всю группу в экранном направлении, независимо от масштаба/поворота. */
  nudge(dx:number,dy:number,key?:KeyLike):void {
    if(!this.objects.length||this.app.input.drawing||this.app.input.blocked)return;
    if(!key?.repeat||this.keyMove?.code!==key.code)this.finishNudge();
    const group=key?(this.keyMove??={code:key.code,group:{}}).group:undefined;
    const a=this.app.view.toWorld(0,0),b=this.app.view.toWorld(dx,dy),x=b.x-a.x,y=b.y-a.y;
    if(this.pivot)this.pivot={x:this.pivot.x+x,y:this.pivot.y+y};
    // Чистый перенос не меняет точки/матрицы/маски: сохраняем их и кэши контуров.
    this.replace(this.objects.map(o=>{
      const next={...o,ox:o.ox+x,oy:o.oy+y,bbox:{minX:o.bbox.minX+x,minY:o.bbox.minY+y,maxX:o.bbox.maxX+x,maxY:o.bbox.maxY+y}};
      inheritImage(o,next);return next;
    }),group);
  }
  finishNudge(code?:string):void {
    if(!this.keyMove||(code!==undefined&&code!==this.keyMove.code))return;
    this.app.history.endGroup(this.keyMove.group);this.keyMove=null;
  }
  reorder(direction:ObjectOrder):void {
    if(!this.objects.length||this.app.input.drawing||this.app.input.blocked)return;
    this.finishNudge();
    const edit=reorderObjects(this.app.doc.values(),new Set(this.objects.map(o=>o.id)),direction);
    if(!edit.added.length)return;
    const previous=new Map(edit.removed.map(o=>[o.id,o]));
    for(const o of edit.added)inheritImage(previous.get(o.id)!,o);
    // Правка затрагивает также соседей, но состав выделения и центр вращения сохраняются.
    this.replacing=true;
    try{this.app.history.commit(edit);}finally{this.replacing=false;}
  }
  rotate(degrees:number):void {
    if(!this.objects.length||this.app.input.drawing)return;
    const m=rotation(this.center(),degrees*Math.PI/180);this.replace(this.objects.map(o=>{const n=transformObject(o,m,true);inheritImage(o,n);return n;}));
  }
  recolor(color:string):void {
    this.replace(this.objects.map(o=>o.kind==='stroke'?{...o,color}:o.kind==='vector'?{...o,fill:o.fill==='none'?'none':color,stroke:o.stroke==='none'?'none':color}:o));
  }
  width(factor:number):void {
    this.replace(this.objects.map(o=>{
      if(o.kind!=='stroke')return o;const pts=o.pts.slice();for(let i=2;i<pts.length;i+=3)pts[i]=Math.max(.3,Math.min(240,pts[i]*factor));
      const n={...o,...makeStroke(o.id,o.z,o.ox,o.oy,pts,o.color),...(o.dash?{dash:{...o.dash,length:o.dash.length*factor,gap:o.dash.gap*factor}}:{})};return o.shape?rebuildShape(n):withShapeBounds(n);
    }));
  }
  editShapes(edit:(o:StrokeObj)=>StrokeObj,group?:object):void {
    this.replace(this.objects.map(o=>o.kind==='stroke'?edit(o):o),group);
  }
  /** В M команды инструментов меняют одну выбранную фигуру, сохраняя порядок концов. */
  setLineHeads(mode:'line'|'end'|'both'|'reverse'):boolean {
    const o=this.selected;
    if(this.objects.length!==1||!bendable(o))return false;
    const shape=o.shape!;
    if(mode==='line'&&shape.kind==='line')return false;
    if(this.app.input.blocked||this.app.input.drawing)return true;
    if(mode==='reverse'&&shape.kind==='arrow'&&shape.both)return true;

    const kind=mode==='line'?'line':'arrow', both=mode==='both';
    const atStart=mode==='reverse'&&!shape.headAtStart;
    if(shape.kind===kind&&shape.both===both&&!!shape.headAtStart===atStart)return true;
    const next:typeof shape={...shape,kind,both};
    if(atStart)next.headAtStart=true;
    else delete next.headAtStart;
    if(shape.kind==='line'){
      const {headLength,headWidth,headType,headRound}=this.app.settings.arrow;
      Object.assign(next,{headLength,headWidth,headType,headRound});
    }
    const bbox=kind==='line'?strokeBBox(o.ox,o.oy,o.pts):o.bbox;
    this.replace([withShapeBounds({...o,shape:next,bbox})]);
    return true;
  }
  private draw=(ctx:CanvasRenderingContext2D):void=>{
    if(this.objects.length===1&&bendable(this.selected))drawBezierControls(ctx,this.app,this.selected,false);
    const d=this.app.view.dpr;ctx.setTransform(d,0,0,d,0,0);ctx.lineWidth=1;ctx.strokeStyle='#315ca8';ctx.setLineDash([5,3]);
    const b=this.mode==='box'?{minX:Math.min(this.start.x,this.last.x),minY:Math.min(this.start.y,this.last.y),maxX:Math.max(this.start.x,this.last.x),maxY:Math.max(this.start.y,this.last.y)}:this.screenBox();
    if(!b)return;ctx.strokeRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);ctx.setLineDash([]);
    if(this.mode==='box')return;
    ctx.beginPath();ctx.moveTo((b.minX+b.maxX)/2,b.minY);ctx.lineTo((b.minX+b.maxX)/2,b.minY-25);ctx.stroke();
    for(const h of this.handles()){
      ctx.fillStyle=['amplitude','period','length','bend','endpoint','control1','control2','axisX','axisY'].includes(h.name)?'#cf914d':'white';
      if(h.name==='pivot'){
        ctx.save();if(this.pivotSnapped)ctx.strokeStyle='#cf914d';
        if(h.anchor&&(h.anchor.x!==h.point.x||h.anchor.y!==h.point.y)){
          ctx.beginPath();ctx.moveTo(h.point.x,h.point.y);ctx.lineTo(h.anchor.x,h.anchor.y);ctx.stroke();
          ctx.beginPath();ctx.arc(h.anchor.x,h.anchor.y,2,0,Math.PI*2);ctx.fillStyle=ctx.strokeStyle;ctx.fill();
        }
        ctx.beginPath();ctx.arc(h.point.x,h.point.y,6,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.9)';ctx.fill();
        ctx.beginPath();ctx.moveTo(h.point.x-5,h.point.y);ctx.lineTo(h.point.x+5,h.point.y);ctx.moveTo(h.point.x,h.point.y-5);ctx.lineTo(h.point.x,h.point.y+5);ctx.stroke();ctx.restore();
      }
      else{ctx.beginPath();if(h.name==='rotate')ctx.arc(h.point.x,h.point.y,5,0,Math.PI*2);else ctx.rect(h.point.x-4,h.point.y-4,8,8);ctx.fill();ctx.stroke();}
    }
  };
}
