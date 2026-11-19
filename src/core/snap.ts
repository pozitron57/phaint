// Общий режим сетки: Alt временно обращает настройку; начало/центр фиксируются при касании.
import type { Pt } from './geom.ts';

export function gridSnap(defaultOn:boolean,alt:boolean):boolean {return defaultOn!==alt;}

export function snapPoint(p:Pt,step:number):Pt {
  return {x:Math.round(p.x/step)*step||0,y:Math.round(p.y/step)*step||0};
}

/** start — исходное касание; anchor — уже зафиксированное начало, которое Alt не меняет. */
export function snapSegment(start:Pt,end:Pt,step:number,grid:boolean,angle:boolean,anchor:Pt=start):{start:Pt;end:Pt} {
  if(!angle)return {start:anchor,end:grid?snapPoint(end,step):end};
  // Направление берём от исходного касания: Alt не переключает уже выбранный угол.
  const dx=end.x-start.x,dy=end.y-start.y,theta=Math.round(Math.atan2(dy,dx)/(Math.PI/12))*Math.PI/12;
  const length=Math.hypot(dx,dy),r=grid?Math.round(length/step)*step:length;
  return {start:anchor,end:{x:anchor.x+Math.cos(theta)*r,y:anchor.y+Math.sin(theta)*r}};
}
