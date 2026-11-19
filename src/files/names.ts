// Имена одинаковы в Electron и браузере. Новый рисунок — текущая местная дата YYYY-MM-DD.
import type { ExportFormat } from './api.ts';

function dateName():string {
  const now=new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

export function workingName(name=`${dateName()}.svg`):string {
  return /\.svg$/i.test(name)?name:name.replace(/\.[^.]+$/,'')+'p.svg';
}
export function exportName(name:string|undefined,format:ExportFormat,selection=false):string {
  if(name===undefined)return `${dateName()}${selection?'-part':''}.${format}`;
  const original=name,base=original.replace(/\.[^.]+$/,'');
  const short=/p\.svg$/i.test(original)?base.slice(0,-1):base;
  const same=original.toLowerCase()===`${short}.${format}`.toLowerCase();
  return `${short}${selection?'-part':same?(format==='pdf'?' — пометки':' — копия'):''}.${format}`;
}
export function preferredExport(name:string|undefined,current:ExportFormat):ExportFormat {
  if(name&&/p\.svg$/i.test(name))return 'svg';
  return name&&/\.pdf$/i.test(name)?'pdf':current;
}
