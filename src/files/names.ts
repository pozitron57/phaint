// Имена одинаковы в Electron и браузере. Новый рисунок — текущая местная дата YYYY-MM-DD.
import { t } from '../core/language.ts';
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
  return `${short}${selection?'-part':same?(format==='pdf'?t('file.notesSuffix'):t('file.copySuffix')):''}.${format}`;
}
export function exportFormat(name: string | null): ExportFormat | undefined {
  return name?.match(/\.(svg|pdf|png|jpg)$/i)?.[1].toLowerCase() as ExportFormat | undefined;
}

export function repeatExportName(name: string, format: ExportFormat): string {
  return exportFormat(name) === format ? name : name.replace(/\.[^.]+$/, '.' + format);
}

export function preferredExport(name:string|undefined,current:ExportFormat):ExportFormat {
  if(name&&/p\.svg$/i.test(name))return 'svg';
  return name&&/\.pdf$/i.test(name)?'pdf':current;
}
