// Одна векторная страница размером с рисунок. Изолированное окно без JS и сети
// закрывается после печати; временный HTML не остаётся на диске.
import { app, BrowserWindow } from 'electron';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { MAX_FILE_BYTES } from '../src/files/codec.ts';
import type { PdfExportRequest } from '../src/files/pdf-types.ts';
import { abortable, checkCancelled } from '../src/core/cancel.ts';

export async function renderAnnotatedPdf(request:PdfExportRequest,signal?:AbortSignal):Promise<Uint8Array> {
  checkCancelled(signal);
  const r=request;
  if(!r?.source||typeof r.source.data!=='string'||r.source.data.length>MAX_FILE_BYTES||!Array.isArray(r.pages)||r.pages.length>500||!r.pages.length||!['pages','sheet'].includes(r.layout))throw new Error('Неверные данные PDF.');
  if(![r.bounds.x,r.bounds.y,r.bounds.width,r.bounds.height].every(Number.isFinite)||r.bounds.width<=0||r.bounds.height<=0)throw new Error('Неверный размер PDF.');
  if(r.grid&&(!Number.isFinite(r.grid.step)||r.grid.step<=0))throw new Error('Неверный шаг сетки PDF.');
  for(const p of r.pages){
    const m=p.page?.transform;
    if(!m||!Number.isInteger(p.page.index)||p.page.index<0||![p.x,p.y,p.width,p.height,...Object.values(m)].every(Number.isFinite)||p.width<=0||p.height<=0||Math.abs(m.a*m.d-m.b*m.c)<1e-12)throw new Error('Неверная страница PDF.');
  }
  const overlays:Array<Uint8Array|null>=[];
  if(r.layout==='sheet')overlays.push(r.layers?.length?await renderPdfLayers(r.layers.map(l=>l.svg),r.bounds.width,r.bounds.height,true,signal):null);
  else for(const p of r.pages)overlays.push(p.layers?.length?await renderPdfLayers(p.layers.map(l=>l.svg),p.width,p.height,true,signal):null);
  // Текстовые SVG уже использованы и не нужны второму потоку.
  const layers=(values:PdfExportRequest['layers'])=>values?.map(l=>({svg:'',multiply:l.multiply}));
  const data={request:{...r,layers:layers(r.layers),pages:r.pages.map(p=>({...p,layers:layers(p.layers)}))},overlays};
  return runWorker('pdf-compose-worker.cjs',data,overlays.filter((v):v is Uint8Array=>!!v).map(v=>v.buffer as ArrayBuffer),signal);
}

async function runWorker(name:string,data:unknown,transfer:ArrayBuffer[],signal?:AbortSignal):Promise<Uint8Array> {
  checkCancelled(signal);
  const worker=new Worker(join(__dirname,name));
  try{
    return await abortable(new Promise<Uint8Array>((resolve,reject)=>{
      worker.once('message',message=>message.error?reject(new Error(message.error)):resolve(message.bytes));
      worker.once('error',reject);worker.once('exit',code=>reject(new Error(`PDF: поток завершился с кодом ${code}`)));
      worker.postMessage(data,transfer);
    }),signal);
  }finally{await worker.terminate();}
}

export async function renderPdf(svg:string,width:number,height:number,transparent=false,signal?:AbortSignal):Promise<Uint8Array> {
  return renderPdfLayers([svg],width,height,transparent,signal);
}
/** Слои одной страницы печатаются одним запуском Chromium, без окна на каждый маркер. */
async function renderPdfLayers(svgs:string[],width:number,height:number,transparent=false,signal?:AbortSignal):Promise<Uint8Array> {
  checkCancelled(signal);
  if(!svgs.length||svgs.some(svg=>typeof svg!=='string')||svgs.reduce((n,s)=>n+Buffer.byteLength(s),0)>MAX_FILE_BYTES||![width,height].every(n=>Number.isFinite(n)&&n>0))throw new Error('Неверный размер рисунка для PDF.');
  // Chromium ограничивает физический размер страницы. Масштаб меняется одинаково по осям.
  const factor=Math.min(1,14400/Math.max(width,height)),w=Math.max(16,width*factor),h=Math.max(16,height*factor);
  const directory=await mkdtemp(join(app.getPath('temp'),'phaint-pdf-'));
  let win:BrowserWindow|null=null;
  const abort=()=>{if(win&&!win.isDestroyed())win.destroy();};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    const images=svgs.map(svg=>`<div class="page"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></div>`).join('');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Phaint</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>@page{size:${w}px ${h}px;margin:0}html,body{margin:0;padding:0;width:${w}px;background:${transparent?'transparent':'white'}}.page{width:${w}px;height:${h}px;overflow:hidden;break-after:page;break-inside:avoid}.page:last-child{break-after:auto}img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body>${images}</body></html>`;
    const path=join(directory,'print.html');await writeFile(path,html);
    checkCancelled(signal);
    win=new BrowserWindow({show:false,width:800,height:600,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,javascript:false}});
    await abortable(win.loadFile(path),signal);
    const pdf=await abortable(win.webContents.printToPDF({printBackground:true,displayHeaderFooter:false,preferCSSPageSize:true,pageSize:{width:w/96,height:h/96},margins:{top:0,bottom:0,left:0,right:0},pageRanges:`1-${svgs.length}`}),signal);
    const bytes=new Uint8Array(pdf);
    return await runWorker('pdf-worker.cjs',bytes,[bytes.buffer],signal);
  }finally{signal?.removeEventListener('abort',abort);abort();await rm(directory,{recursive:true,force:true});}
}
