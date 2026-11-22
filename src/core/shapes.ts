// Параметрические фигуры и штриховой рисунок. Геометрия общая для Canvas, SVG и ластика.
import { bboxUnion, matApply, matBBox, type Mat, type Pt } from './geom.ts';
import { curveOutline, segmentOutline, strokeOutline, type Loops } from './outline.ts';
import { bezierPoints, bezierTangent, flattenBezier, pathLength, trimPath } from './bezier.ts';
import { makeStroke, strokeBBox, type StrokeObj } from './types.ts';
import { withClipBounds } from './clip.ts';

export type ShapeKind = 'line' | 'arrow' | 'coordinates' | 'ellipse' | 'sine' | 'parabola' | 'hyperbola' | 'adiabat';
export const DEFAULT_GAMMA=5/3, MIN_GAMMA=1, MAX_GAMMA=3;
export interface ShapeData {
  kind: ShapeKind;
  frame: Mat;
  length: number;
  height: number;
  bend: number;
  amplitude: number;
  period: number;
  cycles: number;
  headLength: number;
  headWidth: number;
  headRound?: number;
  headType: 'open' | 'filled';
  both: boolean;
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
  return {kind,frame:identity(),length:1,height:0,bend:0,amplitude:72,period:192,cycles:1,headLength:5,headWidth:3,headRound:.4,headType:'open',both:false,...(kind==='adiabat'?{gamma:DEFAULT_GAMMA}:{})};
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
  const heads=arrowHeads(o);
  const axes=[o.pts,...heads];
  if(heads.length&&o.shape?.controls?.length&&o.shape.headType==='filled')axes.push(curvedShaft(o.pts,heads));
  const b=axes.map(p=>strokeBBox(0,0,p)).reduce(bboxUnion);
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
export function arrowHeads(o: StrokeObj): Float32Array[] {
  if(o.shape?.kind==='coordinates')return coordinateAxes(o).flatMap(arrowHeads);
  const s=o.shape;if(s?.kind!=='arrow')return [];
  const p=o.pts,w=p[2],len=pathLength(p),n=p.length;if(len<.001)return [];
  const end={x:s.length,y:s.height};
  const tip=bezierTangent(end,s.controls??[],s.frame,true),tail=bezierTangent(end,s.controls??[],s.frame,false);
  // На короткой стрелке уменьшаем обе стороны с одним коэффициентом, сохраняя пропорции.
  const scale=Math.min(1,len*(s.both?.375:.65)/(s.headLength*w));
  const l=s.headLength*w*scale,h=s.headWidth*w/2*scale;
  const head=(x:number,y:number,dx:number,dy:number)=>Float32Array.of(x-dx*l-dy*h,y-dy*l+dx*h,w,x,y,w,x-dx*l+dy*h,y-dy*l-dx*h,w);
  const heads=[head(p[n-3],p[n-2],tip.x,tip.y)];if(s.both)heads.push(head(p[0],p[1],-tail.x,-tail.y));return heads;
}
export function strokeLoops(o: StrokeObj): Loops {
  if(o.shape?.kind==='coordinates')return coordinateAxes(o).flatMap(strokeLoops);
  let body=o.pts;
  const arrow=o.shape?.kind==='arrow',filled=arrow&&o.shape!.headType==='filled';
  const heads=arrowHeads(o);
  if(filled){
    if(heads.length){
      if(o.shape?.controls?.length)body=curvedShaft(o.pts,heads);
      else{
        body=o.pts.slice();const end=heads[0];body[3]=(end[0]+end[6])/2;body[4]=(end[1]+end[7])/2;
        if(heads[1]){body[0]=(heads[1][0]+heads[1][6])/2;body[1]=(heads[1][1]+heads[1][7])/2;}
      }
    }
  }
  const pieces=dashedPoints(body,o.dash);
  // Последний торец всегда плоский; у двух головок — оба внешних торца.
  // Внутренние концы штрихов сохраняют выбранное оформление.
  const round=o.dash?.round??true;
  const outline=o.shape?.controls?.length?curveOutline:segmentOutline;
  const loops=arrow&&!o.dash?.dots?pieces.flatMap((p,i)=>outline(p,round&&!(o.shape!.both&&i===0),round&&i<pieces.length-1))
    :pieces.flatMap(p=>strokeOutline(p));
  // Плоские концы штрихов: клип контура плоскостями начала и конца отрезка.
  if(o.dash&&!o.dash.round&&!arrow){
    loops.length=0;
    for(const p of pieces){
      const n=p.length;let polys=strokeOutline(p);
      for(const [x,y,dx,dy] of [[p[0],p[1],p[3]-p[0],p[4]-p[1]],[p[n-3],p[n-2],p[n-6]-p[n-3],p[n-5]-p[n-2]]]){
        polys=polys.map(poly=>clip(poly,x,y,dx,dy));
      }
      loops.push(...polys);
    }
  }
  for(const p of heads){
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
/** Сохраняем середину исходной дуги. У каждой головки кубическая Безье
 * сопрягает её касательную с осью головки, заканчиваясь в центре основания. */
function curvedShaft(p:Float32Array,heads:Float32Array[]):Float32Array {
  const headLength=(h:Float32Array)=>Math.hypot(h[3]-(h[0]+h[6])/2,h[4]-(h[1]+h[7])/2);
  const end=headLength(heads[0]),start=heads[1]?headLength(heads[1]):0;
  const available=pathLength(p)-start-end;
  const middle=trimPath(p,start+Math.min(start,available/3),end+Math.min(end,available/3));
  if(middle.length<6)return middle;
  const out:number[]=[];
  const join=(head:Float32Array,first:boolean)=>{
    const i=first?0:middle.length-3,j=first?3:i-3;
    const a={x:middle[i],y:middle[i+1]},base={x:(head[0]+head[6])/2,y:(head[1]+head[7])/2};
    const dx=head[3]-base.x,dy=head[4]-base.y,len=Math.hypot(dx,dy)||1;
    const ux=dx/len,uy=dy/len;
    const distance=Math.hypot(base.x-a.x,base.y-a.y);
    const flat=Math.min(p[2]/2,distance/8);
    const b={x:base.x-flat*ux,y:base.y-flat*uy};
    const arm=Math.hypot(b.x-a.x,b.y-a.y)/3;
    const vx=a.x-middle[j],vy=a.y-middle[j+1],vlen=Math.hypot(vx,vy)||1;
    const curve=flattenBezier([a,{x:a.x+arm*vx/vlen,y:a.y+arm*vy/vlen},
      {x:b.x-arm*ux,y:b.y-arm*uy},b],p[2]);
    // Точку a уже содержит середина. Короткий прямой конец даёт точный плоский торец.
    if(first)out.push(base.x,base.y,p[2]);
    for(let k=3;k<curve.length;k+=3){
      const index=first?curve.length-k:k;
      out.push(curve[index],curve[index+1],p[2]);
    }
    if(!first)out.push(base.x,base.y,p[2]);
  };
  if(heads[1])join(heads[1],true);
  for(const value of middle)out.push(value);
  join(heads[0],false);
  return Float32Array.from(out);
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
