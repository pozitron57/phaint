// Размер последней успешной записи. Резервные копии и отменённые диалоги его не меняют.
import { language, t } from '../core/language.ts';
export interface SvgProcessing {
  name:'SVGO'; before:number; after:number|null; used:boolean; error?:string;
}
export interface FileWriteStats { bytes:number; processing?:SvgProcessing }
export interface SvgResult { text:string; processing?:SvgProcessing }
export interface SvgFileResult { text:string; stats:FileWriteStats }
export interface LastFileWrite extends FileWriteStats { name:string; action:'save'|'export' }

/** Считаем UTF-8 без дополнительной копии всего SVG в памяти. */
export function utf8Size(text:string):number {
  let bytes=0;
  for(let i=0;i<text.length;i++){
    const c=text.charCodeAt(i);
    if(c<0x80)bytes++;
    else if(c<0x800)bytes+=2;
    else if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}
    else bytes+=3;
  }
  return bytes;
}
export function formatFileBytes(bytes:number):string {
  if(bytes<1000)return `${bytes} ${t('байт','bytes')}`;
  const unit=bytes<1e6?1000:1e6,label=unit===1000?t('КБ','kB'):t('МБ','MB');
  return `${(bytes/unit).toFixed(1).replace('.',language==='ru'?',':'.')} ${label} (${bytes} ${t('байт','bytes')})`;
}
