// Уменьшение вставленных картинок в Worker, последовательно и без изменения документа.
// Прозрачность сохраняется PNG; для непрозрачной картинки выбирается меньший PNG/JPEG.
import type { DocumentData } from './codec.ts';
import { exportImageSize, matrixScale, VECTOR_QUALITY, vectorOptions } from './export-options.ts';

function base64(bytes:Uint8Array):string {
  let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);
}
function imageBlob(source:string):Blob {
  const comma=source.indexOf(','),header=source.slice(0,comma);
  if(!/^data:image\/(?:png|jpeg|webp);base64$/i.test(header))throw new Error('Не удалось прочитать встроенную картинку.');
  const raw=atob(source.slice(comma+1)),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return new Blob([bytes],{type:header.slice(5,-7)});
}
export async function prepareExportImages(data:DocumentData):Promise<DocumentData> {
  const quality=vectorOptions(data.exportOptions).quality;
  if(quality==='maximum'||!data.objects.some(o=>o.kind==='image'))return data;
  const objects=[...data.objects],cache=new Map<string,Map<string,string>>();
  for(let i=0;i<objects.length;i++){
    const o=objects[i];if(o.kind!=='image')continue;
    const zoom=matrixScale(o.matrix),key=`${o.width*zoom}:${o.height*zoom}`;
    const variants=cache.get(o.source)??new Map<string,string>();cache.set(o.source,variants);
    const cached=variants.get(key);if(cached){objects[i]={...o,source:cached};continue;}
    const original=imageBlob(o.source),bitmap=await createImageBitmap(original);
    let canvas:OffscreenCanvas|undefined;
    try{
      const size=exportImageSize(bitmap.width,bitmap.height,o.width*zoom,o.height*zoom,quality);
      canvas=new OffscreenCanvas(size.width,size.height);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Не удалось обработать картинку для экспорта.');
      ctx.drawImage(bitmap,0,0,size.width,size.height);
      let encoded=await canvas.convertToBlob({type:'image/png'});
      const pixels=ctx.getImageData(0,0,size.width,size.height).data;
      let opaque=true;for(let at=3;at<pixels.length;at+=4)if(pixels[at]!==255){opaque=false;break;}
      if(opaque){const jpeg=await canvas.convertToBlob({type:'image/jpeg',quality:VECTOR_QUALITY[quality].jpeg});if(jpeg.size<encoded.size)encoded=jpeg;}
      // Уже хорошо сжатая картинка не должна становиться больше от повторного кодирования.
      const source=encoded.size<original.size?`data:${encoded.type};base64,${base64(new Uint8Array(await encoded.arrayBuffer()))}`:o.source;
      variants.set(key,source);objects[i]={...o,source};
    }finally{bitmap.close();if(canvas)canvas.width=canvas.height=1;}
  }
  return {...data,objects};
}
