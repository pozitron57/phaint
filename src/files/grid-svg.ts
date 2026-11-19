// SVG хранит компактный шаблон. Для PDF — явные пути: Chromium растеризует pattern.
import type { BBox } from '../core/geom.ts';
export function gridSvg(b:BBox,step:number,id:string,paths=false):string {
  // Граница лежит на крайних линиях сетки. Внешняя половина обводки обрезается
  // краем SVG: внутри остаётся 0,75 вместо 0,5 у обычных линий.
  const frame=`<rect data-phaint-grid="true" x="${b.minX}" y="${b.minY}" width="${b.maxX-b.minX}" height="${b.maxY-b.minY}" fill="none" stroke="#9eafc9" stroke-width="1.5"/>`;
  if(paths){
    const x0=Math.ceil((b.minX-.25)/step),x1=Math.floor((b.maxX+.25)/step),y0=Math.ceil((b.minY-.25)/step),y1=Math.floor((b.maxY+.25)/step);
    if(![step,b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite)||step<=0||x1-x0+y1-y0>100000)throw new Error('Слишком мелкая сетка для этой области PDF. Увеличьте шаг сетки или экспортируйте меньшую область.');
    const lines:string[]=[];
    for(let i=x0;i<=x1;i++)lines.push(`M${i*step} ${b.minY}V${b.maxY}`);
    for(let i=y0;i<=y1;i++)lines.push(`M${b.minX} ${i*step}H${b.maxX}`);
    return `<defs><clipPath id="${id}-clip"><rect x="${b.minX}" y="${b.minY}" width="${b.maxX-b.minX}" height="${b.maxY-b.minY}"/></clipPath></defs><path data-phaint-grid="true" clip-path="url(#${id}-clip)" d="${lines.join('')}" fill="none" stroke="#c9d5e6" stroke-width="0.5"/>${frame}`;
  }
  return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${step}" height="${step}"><path d="M0 0H${step}V${step}H0Z" fill="none" stroke="#c9d5e6" stroke-width="0.5"/></pattern></defs><rect data-phaint-grid="true" x="${b.minX}" y="${b.minY}" width="${b.maxX-b.minX}" height="${b.maxY-b.minY}" fill="url(#${id})"/>${frame}`;
}
