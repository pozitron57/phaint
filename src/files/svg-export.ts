// Общий путь SVG для записи, буфера и экспорта. SVGO получает только обычные контуры.
import { encodeSvg, type DocumentData } from './codec.ts';
import { prepareExportImages } from './export-images.ts';
import { vectorOptions } from './export-options.ts';
import { utf8Size, type SvgResult } from './file-stats.ts';
import { isPdfPage } from '../core/types.ts';

export async function serializeSvg(data:DocumentData,editable:boolean):Promise<SvgResult> {
  // editable обозначает запись SVG-файла, даже если флажок metadata затем снят.
  // Растровый экспорт/печать используют visual и сохраняют свой путь подготовки.
  if(editable&&data.pdf&&data.objects.some(o=>isPdfPage(o)&&o.kind==='image'))data=(await import('./pdf-svg.ts')).pdfVectorPages(data);
  const options=data.exportOptions,minify=options?.svgo===true,precision=vectorOptions(options).precision;
  const text=await encodeSvg(options?await prepareExportImages(data):data,editable&&(options?.editable??true)&&!minify,precision);
  if(!minify)return {text};
  try{
    const {optimizeSvg}=await import('./svg-optimize.ts');
    return optimizeSvg(text,precision,vectorOptions(options).tolerance>0);
  }catch(e){
    return {text,processing:{name:'SVGO',before:utf8Size(text),after:null,used:false,error:e instanceof Error?e.message:String(e)}};
  }
}
