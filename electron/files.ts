// Файловые диалоги и IPC. Рендерер получает непрозрачные идентификаторы выбранных файлов.
// У каждого окна своя резервная копия; закрытие и его отмена отвечают главному процессу.
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { exportName, workingName } from '../src/files/names.ts';
import { basename, join, dirname, resolve, isAbsolute } from 'node:path';
import { mkdir, rm, stat, realpath, readFile, writeFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { ExportFormat, FileRef, OpenFile, RecoveryFile, UnsavedChoice } from '../src/files/api.ts';
import { MAX_FILE_BYTES } from '../src/files/codec.ts';
import { AtomicWriter, atomicWrite, readLimited, readOptional, WriteQueue } from './storage.ts';
import { renderPdf, renderAnnotatedPdf } from './pdf.ts';
import { imageTypes } from '../src/files/binary.ts';
import { cancelled } from '../src/core/cancel.ts';

interface Entry { path: string; stamp: string | null }
interface TestChoices { opens?: Array<string | null>; saves?: Array<string | null>; unsaved?: UnsavedChoice[]; recovery?: boolean }
const stamp = async (path: string): Promise<string | null> => {
  try { const s = await stat(path); return `${s.mtimeMs}:${s.size}:${s.ino}`; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
};

export function installFiles(testing: boolean, recoverForTest = false) {
  const entries = new Map<string, Entry>();
  const queue = new WriteQueue();
  const recoveryPaths = new WeakMap<Electron.WebContents, string>();
  const recoveryPath = (event: { sender: Electron.WebContents }): string => {
    const path = recoveryPaths.get(event.sender);
    if (!path) throw new Error('Окно закрыто.');
    return path;
  };
  const recentPath = join(app.getPath('userData'), 'recent.json');
  const testRoot = join(app.getPath('userData'), 'files');
  let choices: TestChoices = { recovery: recoverForTest };
  const errors: string[] = [];
  let lastDialog:{defaultPath:string;format:string}|null=null;
  const writers = new Map<string, { writer: AtomicWriter; entry: Entry; initialStamp: string | null; owner: Electron.WebContents; recovery?: boolean }>();
  const allowedClose = new WeakSet<BrowserWindow>();
  const closing = new Map<BrowserWindow, { promise: Promise<boolean>; resolve: (closed: boolean) => void }>();
  const settleClose = (win: BrowserWindow, closed: boolean): void => {
    closing.get(win)?.resolve(closed);
    closing.delete(win);
  };
  const windowOf = (e: { sender: Electron.WebContents }): BrowserWindow => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) throw new Error('Окно закрыто.');
    return win;
  };
  const register = async (path: string): Promise<FileRef> => {
    const handle = randomUUID();
    entries.set(handle, { path, stamp: await stamp(path) });
    return { handle, name: basename(path) };
  };
  const testPath = (name: string): string => {
    if (!/^[\wа-яА-ЯёЁ .-]+\.(svg|pdf|png|jpe?g|webp|gif|bmp)$/i.test(name) || name.includes('..')) throw new Error('Неверное имя тестового файла.');
    return join(testRoot, name);
  };
  const openPath=async(path:string):Promise<OpenFile>=>{
    const ref=await register(path),extension=path.split('.').pop()!.toLowerCase();
    if((await stat(path)).size>MAX_FILE_BYTES)throw new Error('Файл больше 256 МБ.');
    const content=extension==='svg'?{type:'svg' as const,text:await readLimited(path)}:extension==='pdf'
      ?{type:'pdf' as const,mime:'application/pdf',bytes:new Uint8Array(await readFile(path))}
      :{type:'image' as const,mime:imageTypes[extension],bytes:new Uint8Array(await readFile(path))};
    if(content.type==='image'&&!content.mime)throw new Error('Этот формат изображения не поддерживается.');
    if(await stamp(path)!==entries.get(ref.handle)!.stamp)throw new Error('Файл изменился во время чтения. Откройте его ещё раз.');
    return {...ref,...content};
  };

  ipcMain.handle('files:recent',async()=>queue.run(async()=>{
    const text=await readOptional(recentPath);if(!text)return null;
    const value=JSON.parse(text);
    if(!value||typeof value.path!=='string'||!isAbsolute(value.path)||value.path.includes('\0'))throw new Error('Не удалось прочитать путь последнего файла. Откройте рисунок через Cmd+O.');
    return register(value.path);
  }));
  ipcMain.handle('files:read',async(_e,ref:FileRef)=>{
    const entry=entries.get(ref?.handle);if(!entry)throw new Error('Не найден выбранный файл.');
    try{return await openPath(entry.path);}
    catch(error){
      if((error as NodeJS.ErrnoException).code==='ENOENT')throw new Error(`Файл «${basename(entry.path)}» перемещён или удалён. Найдите его через Cmd+O.`);
      throw error;
    }
  });
  ipcMain.handle('files:remember',async(_e,ref:FileRef)=>queue.run(async()=>{
    const entry=entries.get(ref?.handle);if(!entry||entry.stamp===null)throw new Error('Нельзя запомнить файл, который ещё не открыт или не сохранён.');
    await atomicWrite(recentPath,JSON.stringify({version:1,path:entry.path}));
  }));

  ipcMain.handle('files:open', async e => {
    const win = windowOf(e);
    let path: string | undefined;
    if (testing) { const name = choices.opens?.shift(); if (name) path = testPath(name); }
    else {
      const result = await dialog.showOpenDialog(win, { title: 'Открыть рисунок или PDF', buttonLabel: 'Открыть', filters: [{ name: 'Рисунки и PDF', extensions: ['svg','pdf',...Object.keys(imageTypes)] },{name:'SVG',extensions:['svg']},{name:'Картинки',extensions:Object.keys(imageTypes)},{name:'PDF',extensions:['pdf']}], properties: ['openFile'] });
      if (!result.canceled) path = result.filePaths[0];
    }
    if (!path) return null;
    return openPath(path);
  });
  ipcMain.handle('files:choose-save', async (e, current: FileRef | null, saveAs: boolean, selection=false) => {
    const win = windowOf(e);
    if (!saveAs && !selection && current && entries.has(current.handle) && /\.svg$/i.test(current.name)) return current;
    const previous = current ? entries.get(current.handle)?.path : undefined;
    const defaultPath=join(previous?dirname(previous):'',selection?exportName(current?.name,'svg',true):workingName(current?.name));
    if(testing)lastDialog={defaultPath,format:'svg'};
    let path: string | undefined;
    if (testing) { const name = choices.saves?.shift(); if (name) path = testPath(name); }
    else {
      const result = await dialog.showSaveDialog(win, { title: selection?'Сохранить выделение в отдельный SVG':'Сохранить рисунок', buttonLabel: 'Сохранить', defaultPath, filters: [{ name: 'Рисунок SVG', extensions: ['svg'] }], properties: ['createDirectory', 'showOverwriteConfirmation'] });
      if (!result.canceled) path = result.filePath;
    }
    if (!path) return null;
    if (!/\.svg$/i.test(path)) path += '.svg';
    if(selection&&previous){
      const [target,source]=await Promise.all([realpath(path).catch(()=>resolve(path!)),realpath(previous).catch(()=>resolve(previous))]);
      if(target===source)throw new Error('Для выделения выберите другое имя: полный открытый рисунок должен остаться в исходном файле.');
    }
    return register(path);
  });
  ipcMain.handle('files:choose-export',async(e,current:FileRef|null,format:ExportFormat,selection:boolean)=>{
    if(!['svg','pdf','png','jpg'].includes(format))throw new Error('Неизвестный формат.');
    const win=windowOf(e),previous=current?entries.get(current.handle)?.path:undefined;
    const defaultPath=join(previous?dirname(previous):'',exportName(current?.name,format,selection));
    if(testing)lastDialog={defaultPath,format};
    let path:string|undefined;
    if(testing){const name=choices.saves?.shift();if(name)path=testPath(name);}
    else{
      const result=await dialog.showSaveDialog(win,{title:'Экспорт рисунка',buttonLabel:'Экспортировать',defaultPath,filters:[{name:format.toUpperCase(),extensions:[format]}],properties:['createDirectory','showOverwriteConfirmation']});
      if(!result.canceled)path=result.filePath;
    }
    if(!path)return null;
    if(!path.toLowerCase().endsWith(`.${format}`))path+=`.${format}`;
    if(previous&&format===previous.split('.').pop()?.toLowerCase()){
      const [target,source]=await Promise.all([realpath(path).catch(()=>resolve(path!)),realpath(previous).catch(()=>resolve(previous))]);
      if(target===source)throw new Error('Для экспорта выберите другое имя: исходный файл должен остаться без изменений.');
    }
    return register(path);
  });
  const pdfJobs=new Map<string,{owner:Electron.WebContents;controller:AbortController;done:Promise<Uint8Array>}>();
  const pdfJob=(owner:Electron.WebContents,id:unknown,run:(signal:AbortSignal)=>Promise<Uint8Array>)=>{
    if(id!==undefined&&(typeof id!=='string'||id.length>100))throw new Error('Неверная операция PDF.');
    const key=`${owner.id}:${id??randomUUID()}`;
    if(pdfJobs.has(key))throw new Error('Операция PDF уже выполняется.');
    const controller=new AbortController(),abort=()=>controller.abort(cancelled());
    owner.once('destroyed',abort);
    const done=run(controller.signal).finally(()=>{pdfJobs.delete(key);owner.removeListener('destroyed',abort);});
    pdfJobs.set(key,{owner,controller,done});return done;
  };
  ipcMain.handle('files:pdf',(e,svg:string,width:number,height:number,id?:string)=>pdfJob(e.sender,id,signal=>renderPdf(svg,width,height,false,signal)));
  ipcMain.handle('files:annotated-pdf',(e,request,id?:string)=>pdfJob(e.sender,id,signal=>renderAnnotatedPdf(request,signal)));
  ipcMain.handle('files:cancel-pdf',async(e,id:unknown)=>{
    if(typeof id!=='string')return;
    const job=pdfJobs.get(`${e.sender.id}:${id}`);
    if(job?.owner===e.sender){job.controller.abort(cancelled());await job.done.catch(()=>undefined);}
  });
  ipcMain.handle('files:write-binary',async(_e,ref:FileRef,bytes:Uint8Array)=>queue.run(async()=>{
    const entry=entries.get(ref?.handle);
    if(!entry||!(/\.(pdf|png|jpg)$/i.test(entry.path)))throw new Error('Сначала выберите файл для экспорта.');
    if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_FILE_BYTES)throw new Error('Слишком большой файл.');
    if(await stamp(entry.path)!==entry.stamp)throw new Error('Файл изменён другой программой. Выберите другое имя.');
    const writer=await AtomicWriter.create(entry.path);
    try{
      await writer.write(bytes);
      if(await stamp(entry.path)!==entry.stamp)throw new Error('Во время экспорта файл изменён другой программой. Выберите другое имя.');
      await writer.commit();entry.stamp=await stamp(entry.path);
    }finally{await writer.abort();}
  }));
  ipcMain.handle('files:write', async (_e, ref: FileRef, text: string) => queue.run(async () => {
    const entry = entries.get(ref?.handle);
    if (!entry) throw new Error('Сначала выберите файл для сохранения.');
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_FILE_BYTES) throw new Error('SVG больше 256 МБ.');
    if (await stamp(entry.path) !== entry.stamp) throw new Error('Файл изменён другой программой. Откройте его заново или выберите «Сохранить как…», чтобы сохранить свою копию.');
    await atomicWrite(entry.path, text);
    entry.stamp = await stamp(entry.path);
  }));
  ipcMain.handle('files:write-begin', async (e, ref: FileRef) => queue.run(async () => {
    const entry = entries.get(ref?.handle);
    if (!entry) throw new Error('Сначала выберите файл для сохранения.');
    if (await stamp(entry.path) !== entry.stamp) throw new Error('Файл изменён другой программой. Откройте его заново или выберите «Сохранить как…».');
    const ticket = randomUUID();
    writers.set(ticket, { writer: await AtomicWriter.create(entry.path), entry, initialStamp: entry.stamp, owner: e.sender });
    return ticket;
  }));
  ipcMain.handle('files:write-chunk', async (e, ticket: string, chunk: Uint8Array) => queue.run(async () => {
    const task = writers.get(ticket);
    if (!task || task.owner !== e.sender || !(chunk instanceof Uint8Array) || chunk.byteLength > 1024 * 1024) throw new Error('Некорректная порция SVG.');
    await task.writer.write(chunk);
  }));
  ipcMain.handle('files:recovery-begin', async (e, name: string, savedAt: string) => queue.run(async () => {
    const ticket = randomUUID();
    const path = recoveryPath(e);
    const entry = { path, stamp: await stamp(path) };
    const writer = await AtomicWriter.create(path);
    await writer.write(new TextEncoder().encode(`{"name":${JSON.stringify(name)},"savedAt":${JSON.stringify(savedAt)},"data":`));
    writers.set(ticket, { writer, entry, initialStamp: entry.stamp, owner: e.sender, recovery: true });
    return ticket;
  }));
  ipcMain.handle('files:write-finish', async (e, ticket: string) => queue.run(async () => {
    const task = writers.get(ticket);
    if (!task || task.owner !== e.sender) throw new Error('Нет активного сохранения.');
    try {
      if (await stamp(task.entry.path) !== task.initialStamp) throw new Error('Во время сохранения файл изменился в другой программе. Используйте «Сохранить как…».');
      if (task.recovery) await task.writer.write(new TextEncoder().encode('}'));
      await task.writer.commit();
      task.entry.stamp = await stamp(task.entry.path);
    } finally { await task.writer.abort(); writers.delete(ticket); }
  }));
  ipcMain.handle('files:write-abort', async (e, ticket: string) => queue.run(async () => {
    const task = writers.get(ticket);
    if (task?.owner === e.sender) { await task.writer.abort(); writers.delete(ticket); }
  }));
  ipcMain.handle('files:confirm-unsaved', async (e, name: string): Promise<UnsavedChoice> => {
    if (testing) return choices.unsaved?.shift() ?? 'cancel';
    const { response } = await dialog.showMessageBox(windowOf(e), { type: 'question', message: `Сохранить изменения в «${name}»?`, detail: 'Без сохранения изменения будут потеряны.', buttons: ['Сохранить', 'Не сохранять', 'Отмена'], defaultId: 0, cancelId: 2, noLink: true });
    return (['save', 'discard', 'cancel'] as const)[response];
  });
  ipcMain.handle('files:recovery-read', async e => queue.run(async (): Promise<RecoveryFile | null> => {
    const text = await readOptional(recoveryPath(e));
    if (!text) return null;
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== 'object') throw new Error('Повреждена резервная копия.');
    const o = raw as { data?: unknown; name?: unknown; savedAt?: unknown };
    if ((!o.data || (typeof o.data !== 'string' && typeof o.data !== 'object')) || typeof o.name !== 'string' || typeof o.savedAt !== 'string') throw new Error('Повреждена резервная копия.');
    return { name: o.name, savedAt: o.savedAt, data: typeof o.data === 'string' ? o.data : JSON.stringify(o.data) };
  }));
  ipcMain.handle('files:recovery-defer',e=>queue.run(async()=>{
    recoveryPath(e);
    recoveryPaths.set(e.sender,join(app.getPath('userData'),`recovery-${randomUUID()}.json`));
  }));
  ipcMain.handle('files:recovery-write', async (e, file: RecoveryFile | null) => queue.run(async () => {
    const path = recoveryPath(e);
    if (file === null) { await rm(path, { force: true }); return; }
    if (!file || typeof file.data !== 'string' || typeof file.name !== 'string' || typeof file.savedAt !== 'string' || Buffer.byteLength(file.data) > MAX_FILE_BYTES) throw new Error('Некорректная резервная копия.');
    await atomicWrite(path, JSON.stringify(file));
  }));
  ipcMain.handle('files:confirm-recovery', async (e, file: RecoveryFile) => {
    if (testing) return choices.recovery ?? false;
    const { response } = await dialog.showMessageBox(windowOf(e), { type: 'question', message: 'Найдены изменения после незавершённой работы', detail: `«${file.name}». Восстановить рисунок из резервной копии?`, buttons: ['Восстановить', 'Начать с пустого холста'], defaultId: 0, cancelId: 1, noLink: true });
    return response === 0;
  });
  ipcMain.on('files:status', (e, name: string, dirty: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || win.isDestroyed()) return;
    win.setTitle(`${name}${dirty ? ' •' : ''} — Phaint`);
    win.setDocumentEdited(dirty);
  });
  ipcMain.handle('files:error', async (e, message: string) => {
    if (testing) { errors.push(message); return; }
    await dialog.showMessageBox(windowOf(e), { type: 'error', message: 'Не удалось выполнить действие', detail: message, buttons: ['Понятно'] });
  });
  ipcMain.on('files:close-ready', (e, ready = true) => {
    const win = windowOf(e);
    if (!ready) { settleClose(win, false); return; }
    void queue.idle().then(() => {
      if (win.isDestroyed()) return;
      allowedClose.add(win);
      win.close();
    });
  });

  // Управление тестовыми диалогами и файлами доступно только с --run/--smoke-test.
  ipcMain.handle('test:files', async (e, action: string, data: { name?: string; text?: string; bytes?:Uint8Array; choices?: TestChoices }) => {
    if (!testing) return null;
    if (action === 'choices') { choices = data.choices ?? {}; return true; }
    if (action === 'errors') return [...errors];
    if (action === 'recoveryFiles') return (await readdir(app.getPath('userData'))).filter(name=>/^recovery.*\.json$/.test(name));
    if (action === 'jobs') return {writers:[...writers.values()].filter(j=>j.owner===e.sender).length,pdf:[...pdfJobs.values()].filter(j=>j.owner===e.sender).length};
    if (action === 'lastDialog') return lastDialog;
    if (action === 'recent') return readOptional(recentPath).then(text=>text?JSON.parse(text).path:null);
    if (action === 'edit'&&(data.name==='copy'||data.name==='paste')) { e.sender.send('edit:command',data.name);return true; }
    if (action === 'close') { windowOf(e).close(); return true; }
    const path = testPath(data.name ?? 'test.svg');
    if (action === 'prepare') { await mkdir(testRoot, { recursive: true }); await atomicWrite(path, data.text ?? ''); return path; }
    if (action === 'prepareBytes') { await mkdir(testRoot,{recursive:true});await writeFile(path,data.bytes!);return path; }
    if (action === 'read') return readLimited(path);
    if (action === 'readBytes') return new Uint8Array(await readFile(path));
    if (action === 'size') return (await stat(path)).size;
    if (action === 'remove') {await rm(path,{force:true});return true;}
    return null;
  });
  return {
    attach(win: BrowserWindow, slot = `recovery-${randomUUID()}.json`) {
      const contents = win.webContents;
      recoveryPaths.set(contents, join(app.getPath('userData'), slot));
      win.on('closed', () => {
        settleClose(win, true);
        void queue.run(async () => {
          for (const [ticket, task] of writers) if (task.owner === contents) { await task.writer.abort(); writers.delete(ticket); }
        });
      });
      win.on('close', e => {
        if (allowedClose.has(win)) return;
        e.preventDefault();
        win.webContents.send('files:command', 'close');
      });
    },
    close(win: BrowserWindow): Promise<boolean> {
      if (win.isDestroyed()) return Promise.resolve(true);
      const pending = closing.get(win);
      if (pending) return pending.promise;
      let resolve!: (closed: boolean) => void;
      const promise = new Promise<boolean>(done => { resolve = done; });
      closing.set(win, { promise, resolve });
      win.close();
      return promise;
    },
    idle: () => queue.idle(),
    isClosing: (win: BrowserWindow) => allowedClose.has(win),
  };
}
