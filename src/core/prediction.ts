// Ограничение прогноза пера: только ближайшие 20 мс и не больше 12 экранных пикселей.
// Выбросы не заменяют настоящие отсчёты и никогда не попадают в документ.
import type { PenSample } from '../tools/tool.ts';
export function safePredictions(last:PenSample,previous:PenSample|undefined,predicted:PenSample[]):PenSample[] {
  const dt=previous?last.t-previous.t:0;
  const speed=previous&&dt>0?Math.hypot(last.x-previous.x,last.y-previous.y)/dt:0;
  const max=Math.min(12,Math.max(2,speed*20));
  const out:PenSample[]=[];let time=last.t;
  for(const p of predicted){
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.t)||p.t<=time||p.t>last.t+20||Math.hypot(p.x-last.x,p.y-last.y)>max)break;
    out.push(p);time=p.t;
  }return out;
}
