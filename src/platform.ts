// Платформа: всё, что зависит от оболочки. В Electron функции даёт preload (window.phaintNative),
// в обычном браузере — заменители на веб-API. Благодаря этому рендерер можно открыть и проверить
// в любом браузере без Electron.
import { isLanguage, type Language } from './core/language.ts';
import type { FileApi } from './files/api.ts';
import { browserFiles } from './files/browser.ts';
import { abortable, checkCancelled } from './core/cancel.ts';

export interface ClipboardImage { dataURL: string; width: number; height: number }
/** Обрезка в долях исходного изображения, пары x/y с началом сверху слева. */
export interface ImageTextSource { source:string; clip?:number[] }
export type ImageTextResult = 'copied'|'empty'|'superseded'|'cancelled';

export interface Platform {
  appAction(command:string):void;
  onAction(cb:(id:string)=>void):void;
  updateShortcuts(keys:Record<string,string[]>):void;
  readClipboardSvg():Promise<string|null>;
  writeClipboardSvg(svg:string):Promise<void>;
  clipboardCopy(pending:boolean):void;
  onEdit(cb:(command:'copy'|'paste'|'cut')=>void):void;
  editText(command:'copy'|'paste'|'cut'):void;
  clipboardImage(): Promise<ClipboardImage | null>;
  copyImageText(image:ImageTextSource,signal:AbortSignal):Promise<ImageTextResult>;
  readonly files: FileApi;
  tabletStats(): Promise<Record<string, number> | null>;
  /** true — работаем внутри Electron. */
  readonly native: boolean;
  loadSettings(): Promise<unknown>;
  onLanguage(cb:(value:Language)=>void):void;
  saveSettings(data: unknown, language?:Language): Promise<void>;
  toggleFullscreen(): void;
  /** Подписка на вход и выход из полноэкранного режима; текущее состояние сообщается сразу. */
  onFullscreen(cb: (on: boolean) => void): void;
  onSelectAll(cb:()=>void):void;
}

/** То, что выставляет electron/preload.ts. */
interface NativeApi {
  appAction(command:string):void;
  onAction(cb:(id:string)=>void):void;
  updateShortcuts(keys:Record<string,string[]>):void;
  readClipboardSvg():Promise<string|null>;
  writeClipboardSvg(svg:string):Promise<void>;
  clipboardCopy(pending:boolean):void;
  onEdit(cb:(command:'copy'|'paste'|'cut')=>void):void;
  editText(command:'copy'|'paste'|'cut'):void;
  clipboardImage(): Promise<ClipboardImage | null>;
  copyImageText(job:number,image:ImageTextSource):Promise<ImageTextResult>;
  cancelImageText(job:number):void;
  files: FileApi;
  tabletStats(): Promise<Record<string, number> | null>;
  loadSettings(): Promise<unknown>;
  onLanguage(cb:(value:Language)=>void):void;
  saveSettings(data: unknown, language?:Language): Promise<void>;
  toggleFullscreen(): Promise<void>;
  isFullscreen(): Promise<boolean>;
  onFullscreen(cb: (on: boolean) => void): void;
  onSelectAll(cb:()=>void):void;
}

const STORAGE_KEY = 'phaint.settings';

function browserSettings():{language?:unknown}|null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); }
  catch { return null; }
}

export function getPlatform(): Platform {
  let textJob=0;
  const native = (window as unknown as { phaintNative?: NativeApi }).phaintNative;
  if (native) {
    return {
      native: true,
      appAction:command=>native.appAction(command),onAction:cb=>native.onAction(cb),updateShortcuts:keys=>native.updateShortcuts(keys),
      readClipboardSvg:()=>native.readClipboardSvg(),
      writeClipboardSvg:svg=>native.writeClipboardSvg(svg),
      clipboardCopy:pending=>native.clipboardCopy(pending),
      onEdit:cb=>native.onEdit(cb),
      editText:command=>native.editText(command),
      clipboardImage: () => native.clipboardImage(),
      copyImageText:async(image,signal)=>{
        checkCancelled(signal);const job=++textJob;
        const cancel=()=>native.cancelImageText(job);
        signal.addEventListener('abort',cancel,{once:true});
        try{return await abortable(native.copyImageText(job,image),signal);}
        finally{signal.removeEventListener('abort',cancel);}
      },
      files: native.files,
      tabletStats: () => native.tabletStats(),
      loadSettings: () => native.loadSettings(),
      onLanguage: cb => native.onLanguage(cb),
      saveSettings: (data,language) => native.saveSettings(data,language),
      toggleFullscreen: () => void native.toggleFullscreen(),
      onFullscreen: (cb) => {
        native.onFullscreen(cb);
        void native.isFullscreen().then(cb);
      },
      onSelectAll:cb=>native.onSelectAll(cb),
    };
  }
  return {
    native: false,
    appAction:command=>{if(command==='quit'||command==='close')window.close();else if(command==='newWindow')window.open(location.href,'_blank');},onAction:()=>{},updateShortcuts:()=>{},
    readClipboardSvg:async()=>{const text=await navigator.clipboard.readText();return /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)?text:null;},
    writeClipboardSvg:svg=>navigator.clipboard.writeText(svg),
    clipboardCopy:()=>{},
    copyImageText:async()=>{throw new Error('Распознавание текста доступно в приложении Phaint для macOS.');},
    onEdit:()=>{},
    editText:command=>{document.execCommand(command);},
    clipboardImage: async () => {
      for(const item of await navigator.clipboard.read()) {
        const type=item.types.find(t=>t.startsWith('image/')); if(!type) continue;
        const blob=await item.getType(type);
        const dataURL=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
        const bitmap=await createImageBitmap(blob); const result={dataURL,width:bitmap.width/window.devicePixelRatio,height:bitmap.height/window.devicePixelRatio};bitmap.close();return result;
      }
      return null;
    },
    files: browserFiles(),
    tabletStats: async () => null,
    loadSettings: async () => browserSettings(),
    onLanguage: cb => window.addEventListener('storage', e => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const value = browserSettings()?.language;
        if (isLanguage(value)) cb(value);
      }
    }),
    saveSettings: async (data, language) => {
      try {
        let selected=language;
        if (!selected) {
          const stored=browserSettings();
          if(isLanguage(stored?.language))selected=stored.language;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({...data as object, language:selected ?? null}));
      } catch {
        // Хранилище недоступно — настройки просто не сохранятся.
      }
    },
    toggleFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    },
    onFullscreen: (cb) => {
      document.addEventListener('fullscreenchange', () => cb(!!document.fullscreenElement));
      cb(!!document.fullscreenElement);
    },
    onSelectAll:()=>{}, // В браузере Cmd+A обрабатывается обычным событием клавиатуры.
  };
}
