// Порядок объектов: устойчивое перемещение выделения, подложки остаются под рисунком.
// Меняется только z; геометрия, маски и ресурсы объектов сохраняются по ссылке.
import { isLocked, type Obj } from './types.ts';
import type { Edit } from './history.ts';

export type ObjectOrder = 'front'|'back'|'forward'|'backward';

export function reorderObjects(objects:Iterable<Obj>,selected:ReadonlySet<number>,direction:ObjectOrder):Edit {
  const all=[...objects],movable=all.filter(o=>!isLocked(o)&&!(o.kind==='vector'&&o.background)).sort((a,b)=>a.z-b.z);
  const picked=(o:Obj)=>selected.has(o.id);
  let next=[...movable];
  if(direction==='front')next=[...movable.filter(o=>!picked(o)),...movable.filter(picked)];
  else if(direction==='back')next=[...movable.filter(picked),...movable.filter(o=>!picked(o))];
  else if(direction==='forward'){
    for(let i=next.length-2;i>=0;i--)if(picked(next[i])&&!picked(next[i+1]))[next[i],next[i+1]]=[next[i+1],next[i]];
  }else{
    for(let i=1;i<next.length;i++)if(picked(next[i])&&!picked(next[i-1]))[next[i],next[i-1]]=[next[i-1],next[i]];
  }
  const added:Obj[]=[],changed=new Set<number>();
  if(next.every((o,i)=>o===movable[i]))return {added,removed:[]};
  const floor=all.reduce((z,o)=>isLocked(o)||(o.kind==='vector'&&o.background)?Math.max(z,o.z):z,0);
  // Обычно достаточно обменять готовые номера. Фрагменты после ластика имеют одинаковый z:
  // тогда один раз даём рисунку строгий порядок, без дробных номеров и потери точности.
  const unique=movable.every((o,i)=>o.z>(i?movable[i-1].z:floor));
  for(let i=0;i<next.length;i++){
    const o=next[i],z=unique?movable[i].z:floor+i+1;
    if(!unique||o.z!==z){changed.add(o.id);added.push(o.z===z?o:{...o,z});}
  }
  // При нормализации включаем и неизменившиеся номера: Undo вставит все фрагменты
  // с одинаковым z в их прежнем порядке, а не в порядке нового выделения.
  return {added,removed:movable.filter(o=>changed.has(o.id))};
}
