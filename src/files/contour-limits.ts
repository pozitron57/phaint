// Местная защита толщины и просветов при экспорте. R-деревья не дают длинным штрихам
// превратиться в попарный перебор всех рёбер. detailLoss 0–1,1 ослабляет защиту на краю
// шкалы с потерями. После экспорта индексы освобождаются.
import RBush from 'rbush';
import type {ContourPoint} from './contour-fit.ts';
interface Edge {minX:number;minY:number;maxX:number;maxY:number;ax:number;ay:number;bx:number;by:number;index:number;loop:number;at:number;length:number;wa:number;wb:number}
function projection(x:number,y:number,e:Edge):{t:number;distance:number} {
  const dx=e.bx-e.ax,dy=e.by-e.ay,t=Math.max(0,Math.min(1,((x-e.ax)*dx+(y-e.ay)*dy)/(dx*dx+dy*dy||1)));
  return {t,distance:Math.hypot(x-e.ax-t*dx,y-e.ay-t*dy)};
}
function edge(ax:number,ay:number,bx:number,by:number):Edge {
  return {minX:Math.min(ax,bx),minY:Math.min(ay,by),maxX:Math.max(ax,bx),maxY:Math.max(ay,by),ax,ay,bx,by,index:0,loop:0,at:0,length:Math.hypot(bx-ax,by-ay),wa:0,wb:0};
}
export function widthLimit(pts:Float32Array|undefined,tolerance:number,compactThin=false,detailLoss=0):(x:number,y:number)=>number {
  const fraction=compactThin ? .2+.35*detailLoss : .1+.25*detailLoss;
  if(!pts?.length)return ()=>tolerance;
  if(pts.length===3)return ()=>Math.min(tolerance,Math.max(.05,pts[2])*fraction);
  const edges:Edge[]=[];
  for(let i=3;i<pts.length;i+=3){
    const e=edge(pts[i-3],pts[i-2],pts[i],pts[i+1]);e.wa=Math.max(.05,pts[i-1]);e.wb=Math.max(.05,pts[i+2]);
    const reach=Math.max(e.wa,e.wb);e.minX-=reach;e.minY-=reach;e.maxX+=reach;e.maxY+=reach;edges.push(e);
  }
  const tree=edges.length>32?new RBush<Edge>().load(edges):null;
  return (x,y)=>{
    let candidates=tree?.search({minX:x,minY:y,maxX:x,maxY:y})??edges;
    // Головки стрелок и изгибы между редкими отсчётами могут выходить за полосу оси.
    if(!candidates.length)candidates=edges;
    let nearest=Infinity,width=Infinity;
    for(const e of candidates){const p=projection(x,y,e);if(p.distance<nearest){nearest=p.distance;width=e.wa+(e.wb-e.wa)*p.t;}}
    return Math.min(tolerance,width*fraction);
  };
}
export function protectGaps(polygons:number[][],limit:(x:number,y:number)=>number,detailLoss=0):ContourPoint[][] {
  // Даже край шкалы оставляет запас между двумя сближающимися сторонами.
  const gapFraction=.2+.25*detailLoss,extentFraction=.05+.2*detailLoss;
  const edges:Edge[]=[],perimeters:number[]=[],positions:number[][]=[];
  for(let loop=0;loop<polygons.length;loop++){
    const p=polygons[loop],at:number[]=[];let length=0;
    for(let i=0;i<p.length;i+=2){
      const j=(i+2)%p.length,e=edge(p[i],p[i+1],p[j],p[j+1]);e.loop=loop;e.index=i/2;e.at=length;edges.push(e);at.push(length);length+=e.length;
    }
    perimeters.push(length);positions.push(at);
  }
  const tree=new RBush<Edge>().load(edges);
  return polygons.map((p,loop)=>{
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(let i=0;i<p.length;i+=2){minX=Math.min(minX,p[i]);maxX=Math.max(maxX,p[i]);minY=Math.min(minY,p[i+1]);maxY=Math.max(maxY,p[i+1]);}
    const extent=Math.min(maxX-minX,maxY-minY)*extentFraction,points:ContourPoint[]=[];
    for(let i=0;i<p.length;i+=2){
      const x=p[i],y=p[i+1],index=i/2;let tolerance=Math.min(limit(x,y),extent),radius=tolerance*(1/gapFraction);
      for(const e of tree.search({minX:x-radius,minY:y-radius,maxX:x+radius,maxY:y+radius})){
        if(e.loop===loop&&(e.index===index||(e.index+1)%positions[loop].length===index))continue;
        const q=projection(x,y,e);
        if(e.loop===loop){
          const distance=Math.abs(positions[loop][index]-e.at-q.t*e.length),along=Math.min(distance,perimeters[loop]-distance);
          if(along<=q.distance*3)continue; // Соседние участки той же стороны, а не узкий просвет.
        }
        tolerance=Math.min(tolerance,q.distance*gapFraction);
      }
      points.push({x,y,tolerance:Math.max(1e-7,tolerance)});
    }
    return points;
  });
}
