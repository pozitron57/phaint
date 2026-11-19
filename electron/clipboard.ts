// SVG в системном буфере: стандартный формат для редакторов и текст для обмена.
// Автотесты используют свой буфер, не подменяя содержимое буфера пользователя.
import { clipboard, ClipboardItem, ipcMain } from 'electron';
import { MAX_FILE_BYTES } from '../src/files/codec.ts';
import { WriteQueue } from './storage.ts';
// Прямая запись image/svg+xml в этой Electron теряет SVG на macOS. Пишем системный
// public.svg-image; при чтении проверяем и старое имя, под которым AppKit возвращает данные.
const SVG_TYPE='electron application/osclipboard;format="public.svg-image"';
const LEGACY_SVG='electron application/osclipboard;format="CorePasteboardFlavorType 0x73766720"';
export async function writeSvg(svg:string):Promise<void> {
  if(typeof svg!=='string'||Buffer.byteLength(svg)>MAX_FILE_BYTES)throw new Error('Слишком большое выделение для буфера.');
  await clipboard.write([new ClipboardItem({[SVG_TYPE]:new Blob([svg],{type:'image/svg+xml'}),'text/plain':svg})]);
}
export async function readSvg():Promise<string|null> {
  for(const item of await clipboard.read())for(const type of [SVG_TYPE,LEGACY_SVG,'image/svg+xml']){
    if(!item.types.includes(type))continue;
    const blob=await item.getType(type);if(!(blob instanceof Blob))continue;
    if(blob.size>MAX_FILE_BYTES)throw new Error('SVG в буфере слишком большой.');
    const svg=await blob.text();if(svg.trim())return svg;
  }
  const text=await clipboard.readText();
  return text.length<=MAX_FILE_BYTES&&/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)?text:null;
}
export function installClipboard(testing:boolean):void {
  let testSvg:string|null=null;
  let latestCopy = 0;
  const writes = new WriteQueue();
  const pending = new Map<Electron.WebContents, { id: number; done: Promise<void>; finish: () => void }>();
  const finish = (sender: Electron.WebContents): void => { pending.get(sender)?.finish(); pending.delete(sender); };
  const watched = new WeakSet<Electron.WebContents>();
  ipcMain.on('clipboard:copy', (event, copying: boolean) => {
    const sender = event.sender;
    if (!copying) { finish(sender); return; }
    if (pending.has(sender)) return;
    let resolve!: () => void;
    pending.set(sender, { id: ++latestCopy, done: new Promise<void>(done => { resolve = done; }), finish: () => resolve() });
    if (!watched.has(sender)) {
      watched.add(sender);
      sender.once('destroyed', () => finish(sender));
      sender.on('render-process-gone', () => finish(sender));
    }
  });
  ipcMain.handle('clipboard:svg-write',async(e,svg:unknown)=>{
    if(typeof svg!=='string'||Buffer.byteLength(svg)>MAX_FILE_BYTES)throw new Error('Слишком большое выделение для буфера.');
    const id=pending.get(e.sender)?.id ?? ++latestCopy;
    await writes.run(async()=>{
      // Поздно готовая большая копия не подменяет более новое Cmd+C из другого окна.
      if(id!==latestCopy)return;
      if(testing){testSvg=svg;return;}
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
  ipcMain.on('edit:text',(e,command:unknown)=>{if(command==='copy')e.sender.copy();else if(command==='paste')e.sender.paste();else if(command==='cut')e.sender.cut();});
}
