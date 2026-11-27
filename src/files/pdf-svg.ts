// Векторные страницы для SVG: контуры текста переиспользуются через defs/use.
// MuPDF загружается только в Worker при сохранении PDF; оригинал и холст не меняются.
import { t } from '../core/language.ts';
import * as mupdf from 'mupdf';
import { isPdfPage, type SvgObj } from '../core/types.ts';
import { MAX_FILE_BYTES, type DocumentData } from './codec.ts';
import { fromBase64 } from './binary.ts';
import { compactPdfSvg } from './svg-optimize.ts';

/** Идентификаторы вложенных SVG общие для всего файла: страницы не должны
 * подменять друг другу буквы, маски и картинки с одинаковыми исходными id. */
function pageSource(svg:string,width:number,height:number,prefix:string):string {
  const ids=new Map<string,string>();
  for(const [,id] of svg.matchAll(/\bid="([^"]+)"/g))if(!ids.has(id))ids.set(id,prefix+ids.size.toString(36));
  svg=svg.replace(/\bid="([^"]+)"/g,(_,id:string)=>`id="${ids.get(id)}"`)
    .replace(/\bhref="#([^"]+)"/g,(_,id:string)=>`href="#${ids.get(id)??id}"`)
    .replace(/url\(#([^)]+)\)/g,(_,id:string)=>`url(#${ids.get(id)??id})`);
  return svg.replace(/<svg\b([^>]*)>/,(_,attributes:string)=>{
    const rest=attributes.replace(/\s(?:width|height|overflow)="[^"]*"/g,'');
    return `<svg${rest} width="${width}" height="${height}" overflow="hidden"><rect width="100%" height="100%" fill="#fff"/>`;
  });
}

export function pdfVectorPages(data:DocumentData):DocumentData {
  const pages=data.objects.filter(o=>isPdfPage(o)&&o.kind==='image');
  if(!data.pdf||!pages.length)return data;
  const sources=data.objects.flatMap(o=>o.kind==='svg'?[o.source]:[]);
  let prefix='pdf-',attempt=0;
  while(sources.some(source=>source.includes(prefix)))prefix=`pdf${++attempt}-`;
  const pdf=mupdf.Document.openDocument(fromBase64(data.pdf.data),'application/pdf');
  const copies=new Map<number,SvgObj>();let length=0;
  try{
    for(const o of pages){
      if(!isPdfPage(o)||o.pdfPage.index>=pdf.countPages())throw new Error(t('error.pdfMissingPage'));
      const page=pdf.loadPage(o.pdfPage.index),buffer=new mupdf.Buffer();
      let writer:mupdf.DocumentWriter|undefined,device:mupdf.Device|undefined;
      try{
        writer=new mupdf.DocumentWriter(buffer,'svg','text=path');
        device=writer.beginPage(page.getBounds());page.run(device,mupdf.Matrix.identity);
        device.close();writer.endPage();writer.close();
        const source=compactPdfSvg(pageSource(buffer.asString(),o.width,o.height,`${prefix}${o.id}-`));
        length+=source.length;
        if(length>MAX_FILE_BYTES)throw new Error(t('error.svgPageLimit'));
        copies.set(o.id,{...o,kind:'svg',source});
      }finally{device?.destroy();writer?.destroy();buffer.destroy();page.destroy();}
    }
    return {...data,objects:data.objects.map(o=>copies.get(o.id)??o)};
  }finally{pdf.destroy();}
}
