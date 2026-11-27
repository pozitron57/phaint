// PDF.js загружается только при работе с PDF. Исходные байты не меняются;
// растровые изображения нужны для холста/SVG, экспорт PDF использует оригинал.
import { t } from '../core/language.ts';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import type { DocumentData } from './codec.ts';
import type { PdfSource } from './pdf-types.ts';
import type { GridSettings } from '../core/settings.ts';
import { makeImage, isPdfPage, type ImageObj } from '../core/types.ts';
import { base64, fromBase64 } from './binary.ts';
import { abortable, cancellationPoint, checkCancelled } from '../core/cancel.ts';

const resource=(name:string)=>new URL(`./pdfjs/${name}`,import.meta.url).href;
GlobalWorkerOptions.workerSrc=resource('pdf.worker.mjs');

export async function loadPdf(source:PdfSource,signal?:AbortSignal):Promise<PDFDocumentProxy> {
  checkCancelled(signal);
  const task=getDocument({data:fromBase64(source.data),disableWorkerRendering:true,
    cMapUrl:resource('cmaps/'),cMapPacked:true,standardFontDataUrl:resource('standard_fonts/'),wasmUrl:resource('wasm/'),iccUrl:resource('iccs/'),
  });
  const abort=()=>{void task.destroy().catch(()=>undefined);};
  signal?.addEventListener('abort',abort,{once:true});
  try{return await abortable(task.promise,signal);}
  finally{signal?.removeEventListener('abort',abort);}
}
export async function renderPage(pdf:PDFDocumentProxy,index:number,density:number,pause=()=>false,signal?:AbortSignal):Promise<HTMLCanvasElement> {
  checkCancelled(signal);
  const page=await abortable(pdf.getPage(index+1),signal),viewport=page.getViewport({scale:4/3*density});
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
  const task=page.render({canvas,viewport,background:'white'});
  const abort=()=>task.cancel();signal?.addEventListener('abort',abort,{once:true});
  task.onContinue=(continueRender:()=>void)=>{const resume=()=>{if(signal?.aborted)return;if(pause())setTimeout(resume,100);else continueRender();};resume();};
  try{await abortable(task.promise,signal);return canvas;}catch(error){canvas.width=canvas.height=1;throw error;}finally{signal?.removeEventListener('abort',abort);page.cleanup();}
}
export async function openPdf(bytes:Uint8Array,name:string,grid:GridSettings,screenWidth:number,screenHeight:number,progress:(text:string)=>void,signal?:AbortSignal):Promise<DocumentData> {
  const source={data:base64(bytes),name},pdf=await loadPdf(source,signal);
  try{
    if(pdf.numPages>500)throw new Error(t('error.pdfPageLimit'));
    const geometry=[];
    for(let i=0;i<pdf.numPages;i++){
      await cancellationPoint(signal);
      const page=await abortable(pdf.getPage(i+1),signal),v=page.getViewport({scale:4/3});
      if(![v.width,v.height].every(n=>Number.isFinite(n)&&n>0&&n<1e7))throw new Error(t('error.pdfPageSize'));
      geometry.push(v);
    }
    // Все миниатюры вместе занимают до 16 Мп; высокая чёткость подгружается только
    // для видимых страниц, без сотен больших декодированных изображений в памяти.
    const density=Math.min(1,Math.sqrt(16000000/geometry.reduce((sum,v)=>sum+v.width*v.height,0)));
    const objects:ImageObj[]=[];let y=0;
    for(let i=0;i<geometry.length;i++){
      await cancellationPoint(signal);
      progress(t('pdf.openProgress', {page:i+1, total:geometry.length}));
      const v=geometry[i],canvas=await renderPage(pdf,i,Math.min(density,Math.sqrt(1000000/(v.width*v.height))),undefined,signal);
      const [a,b,c,d,e,f]=v.transform;
      objects.push({...makeImage(i+1,i+1,0,y,v.width,v.height,canvas.toDataURL('image/png')),pdfPage:{index:i,transform:{a,b,c,d,e,f}}});
      canvas.width=canvas.height=1;y+=v.height+48;
    }
    const first=objects[0];if(!first)throw new Error(t('error.pdfEmpty'));
    const scale=Math.max(.05,Math.min(1,(screenWidth-100)/first.width,(screenHeight-80)/first.height));
    return {objects,pdf:source,grid:{...grid},baseScale:scale,view:{scale,rotSteps:0,x:first.width/2,y:first.height/2}};
  }finally{await pdf.loadingTask.destroy();}
}

/** Для растрового экспорта выбираем чёткость подложек под требуемое разрешение. */
export async function pdfExportImages(data:DocumentData,density:number,signal?:AbortSignal):Promise<DocumentData> {
  if(!data.pdf)return data;
  const pages=data.objects.filter(isPdfPage);
  if(!pages.length)return data;
  const pdf=await loadPdf(data.pdf,signal),copies=new Map<number,ImageObj>();
  const scale=Math.min(density,Math.sqrt(32000000/pages.reduce((sum,p)=>sum+p.width*p.height,0)));
  try{
    for(const p of pages){await cancellationPoint(signal);const c=await renderPage(pdf,p.pdfPage.index,Math.min(scale,Math.sqrt(8000000/(p.width*p.height))),undefined,signal);copies.set(p.id,{...p,kind:'image',source:c.toDataURL('image/png')});c.width=c.height=1;}
    return {...data,objects:data.objects.map(o=>copies.get(o.id)??o)};
  }finally{await pdf.loadingTask.destroy();}
}
