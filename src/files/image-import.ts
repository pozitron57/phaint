// Открытие картинки создаёт обычный объект изображения; SVG сохраняется рядом отдельным файлом.
import { t } from '../core/language.ts';
import { makeImage } from '../core/types.ts';
import type { DocumentData } from './codec.ts';
import type { GridSettings } from '../core/settings.ts';
import { base64 } from './binary.ts';
import { abortable, cancellationPoint } from '../core/cancel.ts';

export async function openImage(bytes:Uint8Array,mime:string,grid:GridSettings,screenWidth:number,screenHeight:number,signal?:AbortSignal):Promise<DocumentData> {
  await cancellationPoint(signal);
  let source=`data:${mime};base64,${base64(bytes)}`;
  const image=new Image();image.src=source;
  try{await abortable(image.decode(),signal);}finally{if(signal?.aborted)image.src='';}
  await cancellationPoint(signal);
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width*height>64000000)throw new Error(t('error.imageTooLarge'));
  if(!['image/png','image/jpeg','image/webp'].includes(mime)){
    const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d')!.drawImage(image,0,0);source=c.toDataURL('image/png');c.width=c.height=1;
  }
  const scale=Math.max(.05,Math.min(1,(screenWidth-100)/width,(screenHeight-80)/height));
  return {objects:[makeImage(1,1,0,0,width,height,source)],grid:{...grid},baseScale:scale,view:{scale,rotSteps:0,x:width/2,y:height/2}};
}
