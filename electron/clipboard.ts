// SVG в системном буфере: стандартный формат для редакторов и текст для обмена.
// Автотесты используют свой буфер, не подменяя содержимое буфера пользователя.
import { t, isLabelKey } from '../src/core/language.ts';
import { clipboard, ClipboardItem, ipcMain } from 'electron';
import { MAX_FILE_BYTES } from '../src/files/codec.ts';
import { stripProblemHeader } from './problem-text.ts';
import { WriteQueue } from './storage.ts';
import type { ImageTextResult, ImageTextSource } from '../src/platform.ts';

/** Нативные операции Apple Vision и атомарная относительно потока JS запись текста. */
export interface TextRecognitionNative {
  recognizeText(bytes:Buffer,id:number,clip?:number[]):Promise<string>;
  cancelTextRecognition(id:number):void;
  clipboardChangeCount():number;
  writeClipboardText(text:string,expectedCount:number):boolean;
}
// Прямая запись image/svg+xml в этой Electron теряет SVG на macOS. Пишем системный
// public.svg-image; при чтении проверяем и старое имя, под которым AppKit возвращает данные.
const SVG_TYPE='electron application/osclipboard;format="public.svg-image"';
const LEGACY_SVG='electron application/osclipboard;format="CorePasteboardFlavorType 0x73766720"';
export async function writeSvg(svg:string):Promise<void> {
  if(typeof svg!=='string'||Buffer.byteLength(svg)>MAX_FILE_BYTES)throw new Error(t('error.selectionTooLarge'));
  await clipboard.write([new ClipboardItem({[SVG_TYPE]:new Blob([svg],{type:'image/svg+xml'}),'text/plain':svg})]);
}
export async function readSvg():Promise<string|null> {
  for(const item of await clipboard.read())for(const type of [SVG_TYPE,LEGACY_SVG,'image/svg+xml']){
    if(!item.types.includes(type))continue;
    const blob=await item.getType(type);if(!(blob instanceof Blob))continue;
    if(blob.size>MAX_FILE_BYTES)throw new Error(t('error.clipboardSvgSize'));
    const svg=await blob.text();if(svg.trim())return svg;
  }
  const text=await clipboard.readText();
  return text.length<=MAX_FILE_BYTES&&/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)?text:null;
}
export function installClipboard(testing:boolean,native:TextRecognitionNative|null):void {
  let testSvg:string|null=null;
  let testText='',testChangeCount=0;
  let latestCopy = 0;
  const writes = new WriteQueue();
  const pending = new Map<Electron.WebContents, { id: number; done: Promise<void>; finish: () => void }>();
  const finish = (sender: Electron.WebContents): void => { pending.get(sender)?.finish(); pending.delete(sender); };
  const watched = new WeakSet<Electron.WebContents>();
  const recognizing=new Map<Electron.WebContents,{job:number;id:number;cancelled:boolean}>();
  const cancelRecognition=(sender:Electron.WebContents,job?:number):void=>{
    const task=recognizing.get(sender);
    if(!task || (job!==undefined&&task.job!==job))return;
    task.cancelled=true;native?.cancelTextRecognition(task.id);recognizing.delete(sender);
  };
  const watch=(sender:Electron.WebContents):void=>{
    if(watched.has(sender))return;
    watched.add(sender);
    const clean=()=>{finish(sender);cancelRecognition(sender);};
    sender.once('destroyed',clean);sender.on('render-process-gone',clean);
  };
  ipcMain.on('clipboard:copy', (event, copying: boolean) => {
    const sender = event.sender;
    if (!copying) { finish(sender); return; }
    if (pending.has(sender)) return;
    let resolve!: () => void;
    pending.set(sender, { id: ++latestCopy, done: new Promise<void>(done => { resolve = done; }), finish: () => resolve() });
    watch(sender);
  });
  ipcMain.handle('clipboard:svg-write',async(e,svg:unknown)=>{
    if(typeof svg!=='string'||Buffer.byteLength(svg)>MAX_FILE_BYTES)throw new Error(t('error.selectionTooLarge'));
    const id=pending.get(e.sender)?.id ?? ++latestCopy;
    await writes.run(async()=>{
      // Поздно готовая большая копия не подменяет более новое Cmd+C из другого окна.
      if(id!==latestCopy)return;
      if(testing){testSvg=svg;testText=svg;testChangeCount++;return;}
      await writeSvg(svg);
    });
  });
  ipcMain.handle('clipboard:svg-read',async()=>{
    // Копирование в соседнем окне ещё может собирать SVG в Worker.
    await Promise.all([...pending.values()].map(copy => copy.done));
    await writes.idle();
    if(testing)return testSvg;
    return readSvg();
  });
  ipcMain.handle('clipboard:image-text',async(event,job:unknown,image:ImageTextSource):Promise<ImageTextResult>=>{
    if(!native)throw new Error(t('error.ocrLoad'));
    if(!Number.isSafeInteger(job) || (job as number)<1 || !image || typeof image.source!=='string' || image.source.length>90*1024*1024)
      throw new Error(t('error.ocrImage'));
    const comma=image.source.indexOf(',');
    if(comma<0 || !/^data:image\/(?:png|jpe?g|webp|gif|bmp|tiff);base64$/i.test(image.source.slice(0,comma)))
      throw new Error(t('error.ocrRaster'));
    if(image.clip!==undefined && (!Array.isArray(image.clip) || image.clip.length>128 || image.clip.length%2 || image.clip.some(n=>!Number.isFinite(n) || Math.abs(n)>1e6)))
      throw new Error(t('error.ocrCrop'));
    const sender=event.sender;watch(sender);cancelRecognition(sender);
    const task={job:job as number,id:++latestCopy,cancelled:false};recognizing.set(sender,task);
    const changeCount=testing?testChangeCount:native.clipboardChangeCount();
    try{
      const recognized=await native.recognizeText(Buffer.from(image.source.slice(comma+1),'base64'),task.id,image.clip);
      const text=stripProblemHeader(recognized);
      return await writes.run(async()=>{
        if(task.cancelled || sender.isDestroyed())return 'cancelled';
        if(task.id!==latestCopy || (testing?testChangeCount:native.clipboardChangeCount())!==changeCount)return 'superseded';
        if(!text)return 'empty';
        if(testing){testSvg=null;testText=text;testChangeCount++;return 'copied';}
        return native.writeClipboardText(text,changeCount)?'copied':'superseded';
      });
    }catch(error){if(task.cancelled)return 'cancelled';
      if(error instanceof Error && isLabelKey(error.message))throw new Error(t(error.message));
      throw error;}
    finally{if(recognizing.get(sender)===task)recognizing.delete(sender);}
  });
  ipcMain.on('clipboard:image-text-cancel',(event,job:unknown)=>{if(typeof job==='number')cancelRecognition(event.sender,job);});
  // Состояние только тестового буфера; реальные пользовательские данные не читаются и не меняются.
  ipcMain.handle('test:clipboard',()=>testing?{text:testText,svg:testSvg,recognizing:recognizing.size}:null);
  ipcMain.on('edit:text',(e,command:unknown)=>{
    if(command==='copy'||command==='cut')++latestCopy;
    if(command==='copy')e.sender.copy();else if(command==='paste')e.sender.paste();else if(command==='cut')e.sender.cut();
  });
}
