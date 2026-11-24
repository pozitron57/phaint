// Параметрические фигуры и штриховой рисунок. Геометрия общая для Canvas, SVG и ластика.
import { bboxUnion, matApply, matBBox, type Mat, type Pt } from './geom.ts';
import { segmentOutline, strokeOutline, type Loops, type StrokeCap } from './outline.ts';
import { bezierPoints, bezierTangent, headArc, pathLength, trimPath } from './bezier.ts';
import { makeStroke, strokeBBox, type StrokeObj } from './types.ts';
import { withClipBounds } from './clip.ts';

export type ShapeKind = 'line' | 'arrow' | 'coordinates' | 'ellipse' | 'sine' | 'parabola' | 'hyperbola' | 'adiabat';
export const DEFAULT_GAMMA=5/3, MIN_GAMMA=1, MAX_GAMMA=3;
export interface ArrowHeadStyle {
  headLength: number;
  headWidth: number;
  headRound?: number;
  headType: 'open' | 'filled';
}
export const DEFAULT_ARROW_HEAD: Required<ArrowHeadStyle> = {headLength:5, headWidth:3, headRound:.4, headType:'open'};
export interface ShapeData extends ArrowHeadStyle {
  kind: ShapeKind;
  frame: Mat;
  length: number;
  height: number;
  bend: number;
  amplitude: number;
  period: number;
  cycles: number;
  both: boolean;
  /** Одиночный наконечник в точке касания; порядок концов и контрольных точек сохраняется. */
  headAtStart?: boolean;
  /** Линия, у которой цикл временно скрыл головки, хранит их оформление для следующего шага. */
  savedHeadStyle?: boolean;
  /** Оформление другого числа головок у этой фигуры. При скрытых головках both указывает сохранённый режим. */
  otherHead?: ArrowHeadStyle;
  /** Показатель в p·V^γ = const; только у адиабаты. */
  gamma?: number;
  /** Одна точка — квадратичная Безье, две — кубическая; в локальной системе frame. */
  controls?: readonly Pt[];
}
export interface DashStyle { length: number; gap: number; round: boolean; offset?: number; dots?:boolean }
export function inkDash(ink:{dashed:boolean;dotted:boolean;dotSpacing:number;dashLength:number;dashGap:number;round:boolean},width:number):DashStyle|undefined {
  if(!ink.dashed)return;
  return ink.dotted?{length:width,gap:ink.dotSpacing*width,round:true,dots:true}:{length:ink.dashLength*width,gap:ink.dashGap*width,round:ink.round};
}
export const identity = (): Mat => ({a:1,b:0,c:0,d:1,e:0,f:0});
export function shapeData(kind: ShapeKind): ShapeData {
  return {kind,frame:identity(),length:1,height:0,bend:0,amplitude:72,period:192,cycles:1,...DEFAULT_ARROW_HEAD,both:false,...(kind==='adiabat'?{gamma:DEFAULT_GAMMA}:{})};
}
export function arrowHeadStyle({headLength, headWidth, headRound, headType}: ArrowHeadStyle): ArrowHeadStyle {
  return {headLength, headWidth, headRound, headType};
}
/** При первом переходе берём настройки инструмента, при возврате — собственные головки фигуры. */
export function withArrowHeadCount(shape: ShapeData, both: boolean, preset: ArrowHeadStyle): ShapeData {
  const next: ShapeData = {...shape, kind:'arrow', both};
  if (shape.kind === 'line' && !shape.savedHeadStyle) {
    Object.assign(next, arrowHeadStyle(preset));
  } else if (shape.both !== both) {
    Object.assign(next, arrowHeadStyle(shape.otherHead ?? preset));
    next.otherHead = arrowHeadStyle(shape);
  }
  delete next.savedHeadStyle;
  return next;
}
export function shapePoints(s: ShapeData, width: number): Float32Array {
  if((s.kind==='line'||s.kind==='arrow')&&s.controls?.length)return bezierPoints({x:s.length,y:s.height},s.controls,s.frame,width);
  const points:number[]=[];
  const add=(x:number,y:number)=>{const p=matApply(s.frame,x,y);points.push(p.x,p.y,width);};
  if(s.kind==='coordinates') {
    // Ноль, горизонтальный и вертикальный наконечники. Между наконечниками линии нет.
    add(0,0);add(s.length,0);add(0,s.height);
  } else if(s.kind==='ellipse') {
    const n=Math.min(1024,Math.max(64,Math.ceil(Math.max(Math.abs(s.length),Math.abs(s.height))/3)));
    for(let i=0;i<=n;i++){const a=i/n*2*Math.PI;add(Math.cos(a)*s.length,Math.sin(a)*s.height);}
  } else if(s.kind==='sine') {
    const n=Math.min(8192,Math.max(1,Math.ceil(s.cycles*64)));
    for(let i=0;i<=n;i++){const t=i/n;add(s.period*s.cycles*t,-s.amplitude*Math.sin(t*s.cycles*Math.PI*2));}
  } else if(s.kind==='parabola') {
    for(let i=0;i<=96;i++){const t=i/96;add(s.length*t,s.height*t+4*s.bend*t*(1-t));}
  } else if(s.kind==='hyperbola') {
    // Ветвь y=1/x на [1/4,4]: равные масштабы осей, верхний левый конец — (0,0).
    // Логарифмический шаг даёт зеркальные пары отсчётов и уплотняет крутой участок.
    for(let i=0;i<=96;i++){
      const x=.25*16**(i/96);add(s.length*(x-.25)/3.75,s.length*(4-1/x)/3.75);
    }
  } else if(s.kind==='adiabat') {
    // p=V^(-γ) на том же диапазоне V, что у гиперболы. Нормируем рамку,
    // чтобы смена γ сохраняла оба конца, в том числе после поворота/растяжения.
    const gamma=s.gamma??DEFAULT_GAMMA,top=4**gamma,span=top-4**(-gamma);
    for(let i=0;i<=96;i++){
      const x=.25*16**(i/96);add(s.length*(x-.25)/3.75,s.length*(top-x**(-gamma))/span);
    }
  } else {add(0,0);add(s.length,s.height);}
  return Float32Array.from(points);
}
export function rebuildShape(o: StrokeObj, shape=o.shape!): StrokeObj {
  const pts=shapePoints(shape,o.pts[2]);
  return withShapeBounds({...o,...makeStroke(o.id,o.z,o.ox,o.oy,pts,o.color),shape});
}
export function withShapeBounds(o:StrokeObj):StrokeObj {
  if(o.shape?.kind!=='arrow'&&o.shape?.kind!=='coordinates'&&!o.matrix)return withClipBounds(o);
  const b=arrowHeads(o).reduce((box,head)=>bboxUnion(box,strokeBBox(0,0,head)),strokeBBox(0,0,o.pts));
  const m=o.matrix??identity();
  return withClipBounds({...o,bbox:matBBox({...m,e:m.e+o.ox,f:m.f+o.oy},b)});
}
/** Штрихи длиной вдоль осевой линии, независимо от частоты отсчётов пера. */
export function dashedPoints(pts: Float32Array, dash?: DashStyle): Float32Array[] {
  if(!dash || pts.length<6)return [pts];
  if(dash.dots){
    const spacing=Math.max(.1,dash.gap),out:Float32Array[]=[];
    let at=((-(dash.offset??0)%spacing)+spacing)%spacing;
    for(let i=3;i<pts.length;i+=3){
      const x=pts[i-3],y=pts[i-2],w=pts[i-1],dx=pts[i]-x,dy=pts[i+1]-y,dw=pts[i+2]-w,len=Math.hypot(dx,dy);
      if(len<1e-9)continue;
      while(at<=len+1e-8){const t=Math.min(1,at/len);out.push(Float32Array.of(x+dx*t,y+dy*t,w+dw*t));at+=spacing;}
      at-=len;
    }
    return out.length?out:[pts.slice(0,3)];
  }
  const length=Math.max(.1,dash.length),gap=Math.max(.1,dash.gap),period=length+gap;
  let phase=((dash.offset??0)%period+period)%period;
  const out:Float32Array[]=[];let part:number[]=[];
  const flush=()=>{if(part.length>=6)out.push(Float32Array.from(part));part=[];};
  for(let i=3;i<pts.length;i+=3){
    const x=pts[i-3],y=pts[i-2],w=pts[i-1],dx=pts[i]-x,dy=pts[i+1]-y,dw=pts[i+2]-w;
    const len=Math.hypot(dx,dy);if(len<1e-9)continue;
    let at=0;
    while(at<len-1e-8){
      const ink=phase<length-1e-8, boundary=ink?length:period;
      const take=Math.min(len-at,Math.max(1e-8,boundary-phase));
      if(ink){if(!part.length){const t=at/len;part.push(x+dx*t,y+dy*t,w+dw*t);}const t=(at+take)/len;part.push(x+dx*t,y+dy*t,w+dw*t);}
      at+=take;phase+=take;
      if(phase>=length-1e-8&&ink)flush();
      if(phase>=period-1e-8)phase=0;
    }
  }
  flush();return out;
}
function arrowParts(o:StrokeObj) {
  const s=o.shape;
  if(s?.kind!=='arrow')return;
  const p=o.pts, w=p[2], total=pathLength(p);
  if(total<.001)return;
  const start=s.both||!!s.headAtStart, end=s.both||!s.headAtStart;
  const filled=s.headType==='filled', limit=total*(s.both ? .375 : .65);
  const length=Math.min(s.headLength*w,limit), halfWidthRatio=s.headWidth/(2*s.headLength);
  const cut=(fromStart:boolean)=>s.controls?.length?headArc(p,fromStart,length,limit):length;
  const startTrim=filled&&start?cut(true):0, endTrim=filled&&end?cut(false):0;
  const body=filled?trimPath(p,startTrim,endTrim,total):p;
  const head=(atEnd:boolean)=>{
    const tip=atEnd?p.length-3:0, x=p[tip], y=p[tip+1];
    let dx:number, dy:number;
    if(filled){
      // Центр основания лежит на той же линии, что и вершина. Видимая дуга не перестраивается.
      const base=atEnd?body.length-3:0;
      dx=x-body[base];dy=y-body[base+1];
    }else{
      const tangent=bezierTangent({x:s.length,y:s.height},s.controls??[],s.frame,atEnd);
      const signed=atEnd?length:-length;
      dx=signed*tangent.x;dy=signed*tangent.y;
    }
    const bx=x-dx, by=y-dy, nx=-dy*halfWidthRatio, ny=dx*halfWidthRatio;
    return Float32Array.of(bx+nx,by+ny,w,x,y,w,bx-nx,by-ny,w);
  };
  return {body,startTrim,startHead:start?head(false):undefined,endHead:end?head(true):undefined};
}
export function arrowHeads(o: StrokeObj): Float32Array[] {
  if(o.shape?.kind==='coordinates')return coordinateAxes(o).flatMap(arrowHeads);
  const parts=arrowParts(o);
  return [parts?.endHead,parts?.startHead].filter(h=>h!==undefined);
}
export function strokeLoops(o: StrokeObj): Loops {
  if(o.shape?.kind==='coordinates')return coordinateAxes(o).flatMap(strokeLoops);
  const parts=arrowParts(o), body=parts?.body??o.pts;
  const dash=o.dash&&parts?.startTrim?{...o.dash,offset:(o.dash.offset??0)+parts.startTrim}:o.dash;
  const pieces=dashedPoints(body,dash);
  const loops=pieces.flatMap(p=>{
    if(!parts||dash?.dots)return strokeOutline(p);
    // Внутренние концы штрихов сохраняют оформление, даже если перед головкой попал пробел.
    const round=dash?.round??true;
    const first=p[0]===body[0]&&p[1]===body[1]?parts.startHead:undefined;
    const last=p.at(-3)===body.at(-3)&&p.at(-2)===body.at(-2)?parts.endHead:undefined;
    if(!o.shape!.controls?.length)return segmentOutline(p,round&&!first,round&&!last);
    const cap=(head?:Float32Array):StrokeCap=>{
      if(!head)return round;
      if(o.shape!.headType==='open')return false;
      return {x:head[3]-(head[0]+head[6])/2,y:head[4]-(head[1]+head[7])/2};
    };
    return strokeOutline(p,undefined,cap(first),cap(last));
  });
  // Плоские концы штрихов: клип контура плоскостями начала и конца отрезка.
  if(body.length>=6&&o.dash&&!o.dash.round&&o.shape?.kind!=='arrow'){
    loops.length=0;
    for(const p of pieces){
      const n=p.length;let polys=strokeOutline(p);
      for(const [x,y,dx,dy] of [[p[0],p[1],p[3]-p[0],p[4]-p[1]],[p[n-3],p[n-2],p[n-6]-p[n-3],p[n-5]-p[n-2]]]){
        polys=polys.map(poly=>clip(poly,x,y,dx,dy));
      }
      loops.push(...polys);
    }
  }
  if(!parts)return loops;
  for(const p of [parts.endHead,parts.startHead]){
    if(!p)continue;
    if(o.shape!.headType==='filled')loops.push(roundedHead(p,o.shape!.headRound));
    else loops.push(...strokeOutline(p));
  }
  return loops;
}
/** Два независимых пути от общего нуля: общая отрисовка, головки, штрихи и ластик. */
export function coordinateAxes(o:StrokeObj):StrokeObj[] {
  const s=o.shape!;
  return [0,1].map(axis=>{
    const shape:ShapeData={...s,kind:'arrow',length:axis===0?s.length:0,height:axis===1?s.height:0,both:false,controls:undefined};
    return {...o,shape,pts:shapePoints(shape,o.pts[2])};
  });
}
/** Оси остаются перпендикулярными и при растяжении уже повёрнутого объекта. */
export function coordinateFrame(m:Mat):Mat {
  const x=Math.hypot(m.a,m.b),y=Math.hypot(m.c,m.d),sign=m.a*m.d-m.b*m.c<0?-1:1;
  if(x<1e-12)return m;
  return {...m,c:-m.b/x*y*sign,d:m.a/x*y*sign};
}
/** Короткие участки у вершин задают небольшое скругление, одинаковое в Canvas и SVG. */
function roundedHead(p:Float32Array,round?:number):Float32Array {
  const out:number[]=[];
  const side=Math.hypot(p[3]-p[0],p[4]-p[1]),base=Math.hypot(p[6]-p[0],p[7]-p[1]);
  // У старых SVG без параметра оставляем прежнюю геометрию. Новый ползунок задаёт
  // долю стороны, занятую закруглением; при 0 вершины строго острые.
  const cut=round===undefined?Math.min(p[2]*.7,side*.12,base*.2):Math.min(side,base)*.45*round;
  for(let i=0;i<3;i++){
    const k=i*3,prev=((i+2)%3)*3,next=((i+1)%3)*3;
    const x=p[k],y=p[k+1];
    const a=cut/(Math.hypot(p[prev]-x,p[prev+1]-y)||1),b=cut/(Math.hypot(p[next]-x,p[next+1]-y)||1);
    if(round===undefined)out.push(x+(p[prev]-x)*a,y+(p[prev+1]-y)*a,x,y,x+(p[next]-x)*b,y+(p[next+1]-y)*b);
    else if(round===0)out.push(x,y,x,y);
    else{
      const ax=x+(p[prev]-x)*a,ay=y+(p[prev+1]-y)*a,bx=x+(p[next]-x)*b,by=y+(p[next+1]-y)*b;
      for(let j=0;j<=8;j++){const t=j/8,u=1-t;out.push(u*u*ax+2*u*t*x+t*t*bx,u*u*ay+2*u*t*y+t*t*by);}
    }
  }
  return Float32Array.from(out);
}
function clip(poly:Float32Array,x:number,y:number,dx:number,dy:number):Float32Array {
  const out:number[]=[];
  for(let i=0;i<poly.length;i+=2){const j=(i+2)%poly.length,ax=poly[i],ay=poly[i+1],bx=poly[j],by=poly[j+1];
    const a=(ax-x)*dx+(ay-y)*dy,b=(bx-x)*dx+(by-y)*dy;
    if(a>=0)out.push(ax,ay);if((a>=0)!==(b>=0)){const t=a/(a-b);out.push(ax+(bx-ax)*t,ay+(by-ay)*t);}
  }return Float32Array.from(out);
}
