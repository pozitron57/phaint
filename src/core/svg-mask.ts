// Векторная маска ластика: исходные пути сохраняются; стёртое прозрачно и в других SVG-редакторах.
export function maskedSvg(source: string, width: number, height: number, marks: readonly (readonly number[])[] = [], id='phaint-mask', x=0, y=0): string {
  if(!marks.length) return source;
  while(source.includes(`id="${id}"`)||source.includes(`id='${id}'`))id+='-outer';
  // Одинаковые преобразования и радиусы пишем один раз на проход. Отдельные
  // подпути сохраняют круглые концы каждой капсулы и их точное объединение.
  const parts:string[]=[];let key='',matrix='',radius=0,path:string[]=[];
  const flush=()=>{if(path.length)parts.push(`<path${matrix?` transform="matrix(${matrix})"`:''} d="${path.join('')}" fill="none" stroke="black" stroke-width="${radius*2}" stroke-linecap="round"/>`);path=[];};
  for(const [x,y,u,v,r,...m] of marks){
    const transform=m.join(' '),next=`${r}:${transform}`;
    if(next!==key){flush();key=next;matrix=transform;radius=r;}
    path.push(`M${x} ${y}L${u} ${v}`);
  }
  flush();const paths=parts.join('');
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}" style="mask-type:luminance"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white"/>${paths}</mask></defs><g mask="url(#${id})">${source}</g>`;
}
