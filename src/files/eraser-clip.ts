// PDF: следы ластика вычитаются из области объекта. SVG mask Chromium печатает
// растром; clipPath остаётся векторным. Рабочие SVG и история не меняются.
import ClipperLib from 'clipper-lib';
import {boxPolygon,intersectClip,polygonArea} from '../core/clip.ts';
import {type BBox,type Pt} from '../core/geom.ts';
import {matrixScale} from './export-options.ts';
import {protectGaps} from './contour-limits.ts';
import {fitContour,curvesSvg} from './contour-fit.ts';

/** Все координаты относительно рамки: точность целочисленной операции не зависит от её сдвига. */
function capsule(mark:readonly number[],bounds:BBox,error:number):Pt[] {
  const [x,y,u,v,r,a=1,b=0,c=0,d=1,e=0,f=0]=mark;
  const width=bounds.maxX-bounds.minX,height=bounds.maxY-bounds.minY;
  const scale=matrixScale({a,b,c,d});if(!scale||r<=0)return [];
  const theta=Math.atan2(v-y,u-x),points:Pt[]=[];
  const arc=(cx:number,cy:number,start:number,end:number):void=>{
    const ox=a*cx+c*cy+e-bounds.minX,oy=b*cx+d*cy+f-bounds.minY;
    const at=(t:number):Pt=>({x:ox+r*(a*Math.cos(t)+c*Math.sin(t)),y:oy+r*(b*Math.cos(t)+d*Math.sin(t))});
    const first=at(start);points.push(first);
    const split=(t0:number,t1:number,p0:Pt,p1:Pt,depth:number):void=>{
      // На огромном ластике не дробим невидимые дуги за пределами рамки.
      const extrema=[p0,p1];
      for(const phase of [Math.atan2(c,a),Math.atan2(d,b)])for(let k=Math.ceil((t0-phase)/Math.PI);phase+k*Math.PI<t1;k++)extrema.push(at(phase+k*Math.PI));
      const outside=extrema.every(p=>p.x<0)||extrema.every(p=>p.x>width)||extrema.every(p=>p.y<0)||extrema.every(p=>p.y>height);
      if(outside||r*scale*2*Math.sin((t1-t0)/4)**2<=error||depth>=40){points.push(p1);return;}
      const t=(t0+t1)/2,p=at(t);split(t0,t,p0,p,depth+1);split(t,t1,p,p1,depth+1);
    };
    split(start,end,first,at(end),0);
  };
  arc(x,y,theta+Math.PI/2,theta+Math.PI*1.5);
  arc(u,v,theta-Math.PI/2,theta+Math.PI/2);
  const clipped=intersectClip(points,boxPolygon({minX:0,minY:0,maxX:width,maxY:height}));
  // Отражение меняет обход: все вырезы должны объединяться, а не взаимно погашаться.
  if(polygonArea(clipped)<0)clipped.reverse();return clipped;
}

export function eraserClipPolygons(bounds:BBox,marks:readonly (readonly number[])[],worldScale=1):number[][] {
  const width=bounds.maxX-bounds.minX,height=bounds.maxY-bounds.minY;
  if(width<=0||height<=0)return [];
  const error=.002/Math.max(worldScale,1e-12),scale=Math.min(1e8,1e13/Math.max(width,height,1));
  const clipper=new ClipperLib.Clipper(),solution:ClipperLib.Paths=[];
  const rectangle=boxPolygon({minX:0,minY:0,maxX:width,maxY:height});
  const integer=(p:Pt[])=>p.map(v=>({X:Math.round(v.x*scale),Y:Math.round(v.y*scale)}));
  clipper.AddPath(integer(rectangle),ClipperLib.PolyType.ptSubject,true);
  for(const mark of marks){const p=capsule(mark,bounds,error);if(p.length>=3)clipper.AddPath(integer(p),ClipperLib.PolyType.ptClip,true);}
  // nonzero сначала объединяет пересечения следов. evenodd здесь восстановил бы стёртое.
  if(!clipper.Execute(ClipperLib.ClipType.ctDifference,solution,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero))throw new Error('Не удалось построить векторное стирание.');
  return solution.filter(p=>p.length>=3).map(p=>p.flatMap(v=>[v.X/scale,v.Y/scale]));
}

export function eraserClipPath(bounds:BBox,marks:readonly (readonly number[])[],worldScale=1):string {
  const polygons=eraserClipPolygons(bounds,marks,worldScale);
  const error=.006/Math.max(worldScale,1e-12);
  return protectGaps(polygons,()=>error).map(points=>{
    const path=curvesSvg(fitContour(points),3);
    // Точная ломаная остаётся запасным вариантом для вырожденных петель.
    return path??`M${points.map(p=>`${p.x} ${p.y}`).join('L')}Z`;
  }).join('');
}
export function vectorErasedSvg(source:string,width:number,height:number,marks:readonly (readonly number[])[]=[],id='phaint-mask',x=0,y=0,worldScale=1):string {
  if(!marks.length)return source;
  while(source.includes(`id="${id}"`)||source.includes(`id='${id}'`))id+='-outer';
  const d=eraserClipPath({minX:x,minY:y,maxX:x+width,maxY:y+height},marks,worldScale);
  if(!d)return '';
  return `<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path transform="translate(${x} ${y})" clip-rule="evenodd" d="${d}"/></clipPath></defs><g clip-path="url(#${id})">${source}</g>`;
}
