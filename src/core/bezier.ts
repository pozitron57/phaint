// Квадратичная/кубическая Безье: адаптивная ось и точные касательные в координатах фигуры.
import { matApply, type Mat, type Pt } from './geom.ts';

export function bezierPoints(end:Pt,controls:readonly Pt[],frame:Mat,width:number):Float32Array {
  const curve=[{x:0,y:0},...controls,end].map(p=>matApply(frame,p.x,p.y));
  const out=[curve[0].x,curve[0].y,width];
  const middle=(a:Pt,b:Pt):Pt=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const flat=(p:Pt,a:Pt,b:Pt):boolean=>{
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=.04;
  };
  const split=(p:Pt[],depth:number):void=>{
    const a=p[0],b=p.at(-1)!;
    if(depth>=12||p.slice(1,-1).every(c=>flat(c,a,b))){out.push(b.x,b.y,width);return;}
    const left=[a],right=[b];let row=p;
    while(row.length>1){row=row.slice(1).map((v,i)=>middle(row[i],v));left.push(row[0]);right.unshift(row.at(-1)!);}
    split(left,depth+1);split(right,depth+1);
  };
  split(curve,0);return Float32Array.from(out);
}

/** Совпавшая с концом контрольная точка наследует первое ненулевое направление. */
export function bezierTangent(end:Pt,controls:readonly Pt[],frame:Mat,atEnd:boolean):Pt {
  const anchor=atEnd?end:{x:0,y:0},candidates=atEnd?[...controls].reverse().concat({x:0,y:0}):[...controls,end];
  for(const p of candidates){
    const dx=(p.x-anchor.x)*(atEnd?-1:1),dy=(p.y-anchor.y)*(atEnd?-1:1);
    const x=frame.a*dx+frame.c*dy,y=frame.b*dx+frame.d*dy,len=Math.hypot(x,y);
    if(len>1e-9)return {x:x/len,y:y/len};
  }
  return {x:1,y:0};
}

export function pathLength(p:Float32Array):number {
  let length=0;for(let i=3;i<p.length;i+=3)length+=Math.hypot(p[i]-p[i-3],p[i+1]-p[i-2]);return length;
}

/** Отрезает ось по длине дуги; используется только под головками кривой стрелки. */
export function trimPath(p:Float32Array,start:number,end:number):Float32Array {
  const stop=pathLength(p)-end,out:number[]=[];let at=0;
  for(let i=3;i<p.length;i+=3){
    const x=p[i-3],y=p[i-2],dx=p[i]-x,dy=p[i+1]-y,len=Math.hypot(dx,dy),next=at+len;
    if(len>1e-9&&next>start&&at<stop){
      const lo=Math.max(0,(start-at)/len),hi=Math.min(1,(stop-at)/len);
      if(!out.length)out.push(x+dx*lo,y+dy*lo,p[i-1]);
      out.push(x+dx*hi,y+dy*hi,p[i+2]);
    }
    at=next;if(at>=stop)break;
  }
  return Float32Array.from(out);
}
