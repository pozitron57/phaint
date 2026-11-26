// Главный процесс Electron: независимые окна, меню активного окна, общий профиль и нативный модуль.
// Dock всегда возвращает рисунок, Cmd+T создаёт окно со сдвигом; Cmd+Q закрывает документы по очереди.
//
// Режим проверки (для разработки, окно на экране не появляется):
//   electron . --smoke-test            встроенная самопроверка window.__phaint.selfTest()
//   electron . --run=сценарий.js       выполнить файл в странице как тело async-функции
//   --shot=файл.png                    куда сохранить снимок окна в конце (по умолчанию во временную папку)
//   --visible                          показать настоящее окно (для замеров скорости)
//   --size=1280x820                    размер окна
// Сценарий может сам делать снимки: await phaintNative.shot('имя') → файл.имя.png.
// Результат печатается строкой «RESULT {json}».
import { translate } from '../src/core/menu-text.ts';
import { app, dialog, clipboard, nativeImage, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions, type Rectangle, screen } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { installFiles } from './files.ts';
import { installClipboard, type TextRecognitionNative } from './clipboard.ts';
import { isLanguage, language, setLanguage } from '../src/core/language.ts';
import { WindowSettings } from './settings.ts';
import { recoverySlots } from './recovery.ts';
import { cascadeBounds } from './window-position.ts';
import { menuAccelerator, validCombo } from '../src/core/actions.ts';

/** native/phaint_native.m */
interface Native extends TextRecognitionNative {
  syncWindowTitlebar(handle:Buffer):boolean;
  windowStyleMask(handle:Buffer):number|null;
  prepareFileDialogs():number;
  clipboardImage(): {dataURL:string;width:number;height:number} | null;
  setPresentation(hide: boolean): boolean;
  getPresentation(): number;
  setMouseCoalescing(on: boolean): boolean;
  startTabletMonitor(): boolean;
  tabletStats(): Record<string, number>;
}

function loadNative(): Native | null {
  try {
    // Путь вычисляется при запуске, поэтому сборщик не пытается вшить модуль в бандл.
    return require(join(__dirname, 'phaint_native.node')) as Native;
  } catch (err) {
    console.warn('Нативный модуль не загрузился: ' + String(err));
    return null;
  }
}

function arg(name: string): string | undefined {
  const found = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (found === undefined) return undefined;
  return found.includes('=') ? found.slice(found.indexOf('=') + 1) : '';
}

const native = loadNative();
const runFile = arg('run');
const testing = arg('smoke-test') !== undefined || runFile !== undefined;
// Ошибка главного процесса в проверке должна завершить сценарий, а не открыть
// блокирующий системный alert, который не виден у скрытого тестового окна.
if(testing)process.on('uncaughtException',error=>{console.error(error);app.exit(1);});
const visible = arg('visible') !== undefined;
const shotFile = resolve(arg('shot') || arg('smoke-test') || join(tmpdir(), 'phaint-shot.png'));
const [winW, winH] = (arg('size') || '1280x820').split('x').map(Number);

// Проверка не должна трогать настоящие настройки.
if (testing) app.setPath('userData', resolve(arg('test-data') || join(tmpdir(), `phaint-test-${process.pid}`)));
const singleInstance = testing || app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.on('second-instance', () => reopenWindow());
app.on('activate', () => reopenWindow());
let files: ReturnType<typeof installFiles>;
const documentWindows = new Set<BrowserWindow>();
const windowShortcuts = new WeakMap<BrowserWindow, Record<string, string[]>>();
let menuWindow: BrowserWindow | null = null;
let openingEnabled = false;
let quitting: Promise<void> | null = null;
let quitAllowed = false;

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json');
const settings = new WindowSettings(settingsFile());

function openWindow(): BrowserWindow | undefined {
  // Начальная активация macOS не должна создавать второй холст при первом запуске.
  if (!openingEnabled || quitting || quitAllowed) return;
  return createWindow();
}

function reopenWindow(): BrowserWindow | undefined {
  if (!openingEnabled || quitting || quitAllowed) return;
  const focused = BrowserWindow.getFocusedWindow();
  const focusedDocument = focused && documentWindows.has(focused) ? focused : null;
  const win = focusedDocument ?? menuWindow ?? [...documentWindows].at(-1);
  if (!win) return;
  if (!testing || visible) {
    if (app.isHidden()) app.show();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  updateMenu(win);
  return win;
}

function updateMenu(win: BrowserWindow): void {
  menuWindow = win;
  buildMenu(windowShortcuts.get(win));
}

async function closeAllWindows(): Promise<void> {
  for (const win of [...documentWindows]) if (!await files.close(win)) return;
  await files.idle();
  await settings.idle();
  quitAllowed = true;
  app.quit();
}

function buildMenu(shortcuts:Record<string,string[]>={}): void {
  const fileCommand = (command: string): void => { BrowserWindow.getFocusedWindow()?.webContents.send('files:command', command); };
  const selectAll=():void=>{
    const win=BrowserWindow.getFocusedWindow();
    if(win?.webContents.isFocused())win.webContents.send('edit:select-all');
    else Menu.sendActionToFirstResponder('selectAll:'); // Поле системного диалога принадлежит AppKit.
  };
  const edit=(command:'copy'|'paste'|'cut'):void=>{
    const win=BrowserWindow.getFocusedWindow();
    if(win?.webContents.isFocused())win.webContents.send('edit:command',command);
    else Menu.sendActionToFirstResponder(`${command}:`);
  };
  const action=(id:string):void=>{BrowserWindow.getFocusedWindow()?.webContents.send('shortcuts:action',id);};
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Phaint',
      submenu: [
        { id:'app.about', label: 'О программе Phaint',click:()=>app.showAboutPanel() },
        { id:'ui.shortcuts',label:'Настройки…',accelerator:'Cmd+,',click:()=>action('ui.shortcuts') },
        { type: 'separator' },
        { id:'app.hide',label:'Скрыть Phaint',accelerator:'Cmd+H',click:()=>app.hide() },
        { id:'app.hideOthers',label:'Скрыть остальные',accelerator:'Alt+Cmd+H',click:()=>Menu.sendActionToFirstResponder('hideOtherApplications:') },
        { id:'app.showAll',label:'Показать все',click:()=>Menu.sendActionToFirstResponder('unhideAllApplications:') },
        { type: 'separator' },
        { id:'app.quit',label:'Завершить Phaint',accelerator:'Cmd+Q',click:()=>app.quit() },
      ],
    },
    {
      label: 'Файл',
      submenu: [
        { id:'app.newWindow',label:'Новое окно',accelerator:'Cmd+T',click:()=>openWindow() },
        { id:'file.new',label: 'Новый рисунок', click: () => fileCommand('new') },
        { id:'file.open',label: 'Открыть SVG, картинку или PDF…', click: () => fileCommand('open') },
        { id:'file.recent',label:'Открыть последний файл',click:()=>action('file.recent') },
        { id:'file.save',label: 'Сохранить SVG', click: () => fileCommand('save') },
        { id:'file.saveAs',label: 'Сохранить SVG как…', click: () => fileCommand('saveAs') },
        { id:'file.export',label: 'Экспорт SVG / PDF / PNG / JPG…', click: () => fileCommand('export') },
        { id:'app.close',label:'Закрыть окно',accelerator:'Cmd+W',click:()=>BrowserWindow.getFocusedWindow()?.close() },
      ],
    },
    {
      // Нужно для полей ввода в настройках.
      label: 'Правка',
      submenu: [
        { id:'edit.undo',label:'Отменить',click:()=>action('edit.undo') },
        { id:'edit.redo',label:'Повторить',click:()=>action('edit.redo') },
        { type:'separator' },
        { id:'edit.cut',label:'Вырезать',accelerator:'Cmd+X',click:()=>edit('cut') },
        { id:'edit.copy',label:'Скопировать',accelerator:'Cmd+C',click:()=>edit('copy') },
        { id:'edit.copyImageText',label:'Распознать и скопировать текст',accelerator:'Ctrl+C',click:()=>action('edit.copyImageText') },
        { id:'edit.paste',label:'Вставить',accelerator:'Cmd+V',click:()=>edit('paste') },
        { id:'edit.selectAll',label:'Выделить всё',accelerator:'Cmd+A',click:selectAll },
        { type:'separator' },
        { label:'Порядок объектов',submenu:[
          { id:'selection.order.front',label:'На передний план',accelerator:'Ctrl+F',click:()=>action('selection.order.front') },
          { id:'selection.order.back',label:'На задний план',accelerator:'Ctrl+B',click:()=>action('selection.order.back') },
          { id:'selection.order.forward',label:'На один шаг вперёд',accelerator:'Ctrl+Shift+F',click:()=>action('selection.order.forward') },
          { id:'selection.order.backward',label:'На один шаг назад',accelerator:'Ctrl+Shift+B',click:()=>action('selection.order.backward') },
        ] },
      ],
    },
    {
      label: 'Окно', role: 'windowMenu',
      submenu: [
        { id:'app.minimize',label:'Свернуть',accelerator:'Cmd+M',click:()=>BrowserWindow.getFocusedWindow()?.minimize() },
        { id:'app.zoom',label:'Развернуть',click:()=>appAction('zoom') },
        { id:'view.fullscreen',label:'Полный экран',click:()=>action('view.fullscreen') },
      ],
    },
  ];
  if (!app.isPackaged) {
    template.push({
      label: 'Разработка',
      submenu: [
        { role: 'reload', label: 'Перезагрузить', accelerator:'Cmd+Shift+R' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
      ],
    });
  }
  const apply=(items:MenuItemConstructorOptions[]):void=>{
    for(const item of items){
      if(item.label)item.label=translate(item.label);
      if(item.id&&Object.hasOwn(shortcuts,item.id)){
        const combo=shortcuts[item.id].find(key=>menuAccelerator(key));item.accelerator=combo?menuAccelerator(combo):undefined;
      }
      if(Array.isArray(item.submenu))apply(item.submenu);
    }
  };
  apply(template);Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function appAction(command:string, win=BrowserWindow.getFocusedWindow()):void {
  if(command==='quit')app.quit();
  else if(command==='close')win?.close();
  else if(command==='hide')app.hide();
  else if(command==='hideOthers')Menu.sendActionToFirstResponder('hideOtherApplications:');
  else if(command==='showAll')Menu.sendActionToFirstResponder('unhideAllApplications:');
  else if(command==='minimize')win?.minimize();
  else if(command==='zoom'&&win){if(win.isMaximized())win.unmaximize();else win.maximize();}
  else if(command==='about')app.showAboutPanel();
  else if(command==='newWindow')openWindow();
}
ipcMain.on('app:action',(event,command:unknown)=>{if(typeof command==='string')appAction(command,BrowserWindow.fromWebContents(event.sender));});
ipcMain.on('shortcuts:update',(event,keys:Record<string,unknown>)=>{
  if(!keys||typeof keys!=='object')return;
  const clean:Record<string,string[]>={};
  for(const [id,values] of Object.entries(keys)){
    if(!Array.isArray(values))continue;
    clean[id]=values.filter((v):v is string=>typeof v==='string'&&validCombo(v));
  }
  // У созданного MenuItem accelerator неизменяем. Пересобираем меню только при
  // загрузке/применении назначений, не при каждом сохранении других настроек.
  const win=BrowserWindow.fromWebContents(event.sender);
  if (!win || !documentWindows.has(win)) return;
  windowShortcuts.set(win,clean);
  if (menuWindow===win) buildMenu(clean);
});

// Стандартный полноэкранный режим macOS: отдельный Space; состояние — после системной анимации.
const fullscreenState = new WeakMap<BrowserWindow, boolean>();

function syncFullscreen(win: BrowserWindow): void {
  const on = win.isFullScreen();
  if (fullscreenState.get(win) === on) return;
  fullscreenState.set(win, on);

  // Только после системной анимации: в Space нет выезжающей полосы заголовка,
  // после выхода снова обычная рамка. Системная строка меню остаётся доступной.
  native?.syncWindowTitlebar(win.getNativeWindowHandle());

  win.webContents.send('window:fullscreen', on);
}

function createWindow(recoverySlot?: string): BrowserWindow {
  const offscreen = testing && !visible;
  const previous=menuWindow??[...documentWindows].at(-1);
  const bounds=previous?.getNormalBounds();
  const position=bounds?cascadeBounds(bounds,screen.getDisplayMatching(bounds).workArea,winW||1280,winH||820):{};
  const win = new BrowserWindow({
    width: winW || 1280,
    height: winH || 820,
    ...position,
    minWidth: 480,
    minHeight: 320,
    show: false,
    backgroundColor: '#ffffff',
    title: 'Phaint',
    // Зелёная кнопка и F11 используют стандартный полноэкранный Space macOS.
    fullscreenable: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Скрытие тестового окна не должно останавливать кадры и искажать замеры.
      // В обычном запуске фоновые ограничения остаются включёнными для экономии ресурсов.
      backgroundThrottling: !testing,
      // Проверка рисует в память, без окна на экране, с плотностью пикселей как у Retina.
      offscreen: offscreen ? { deviceScaleFactor: 2 } : false,
    },
  });
  documentWindows.add(win);
  const owner = win.webContents.id;
  if (!menuWindow) updateMenu(win);
  win.on('focus', () => updateMenu(win));
  win.on('closed', () => {
    documentWindows.delete(win);
    settings.forget(owner);
    if (menuWindow===win) {
      menuWindow=null;
      const next=[...documentWindows].at(-1);
      if(next)updateMenu(next);
    }
  });
  fullscreenState.set(win, false);
  // В фокусе холста клавиши обрабатывает единый реестр по KeyboardEvent.code.
  // Меню показывает те же назначения, но не перехватывает их, в том числе при записи.
  win.webContents.setIgnoreMenuShortcuts(true);
  files.attach(win, recoverySlot);
  win.once('ready-to-show', () => {
    openingEnabled = true;
    if (!testing) win.show();
    else if (visible) win.showInactive();
  });
  win.on('enter-full-screen', () => syncFullscreen(win));
  win.on('leave-full-screen', () => syncFullscreen(win));
  void win.loadFile(join(__dirname, 'renderer', 'index.html'));
  return win;
}

ipcMain.handle('test:keys',(event,action:string,data:{id?:string;input?:unknown})=>{
  if(!testing)return null;
  if(action==='settings')return readFile(settingsFile(),'utf8').then(JSON.parse);
  if(action==='menuLabels') {
    const labels=(menu:Menu):string[]=>menu.items.flatMap(item=>[item.label,...(item.submenu?labels(item.submenu):[])]);
    const menu=Menu.getApplicationMenu();return menu?labels(menu):[];
  }
  if(action==='menu')return Menu.getApplicationMenu()?.getMenuItemById(data.id??'')?.accelerator??null;
  if(action==='input'){event.sender.sendInputEvent(data.input as Parameters<typeof event.sender.sendInputEvent>[0]);return true;}
  return null;
});

/** Снимок окна или его части (rect в экранных px) в PNG. */
async function shot(win: BrowserWindow, file: string, rect?: Rectangle): Promise<string> {
  const image = await win.webContents.capturePage(rect);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, image.toPNG());
  return file;
}

async function runTest(win: BrowserWindow): Promise<void> {
  try {
    await windowReady(win);
    const code = runFile ? `(async () => {\n${await readFile(resolve(runFile), 'utf8')}\n})()` : 'window.__phaint.selfTest()';
    const result: unknown = await win.webContents.executeJavaScript(code, true);
    const png = await shot(win, shotFile);
    console.log('RESULT ' + JSON.stringify({ ok: true, png, result }));
    app.exit(0);
  } catch (err) {
    if (win.isDestroyed() || files.isClosing(win)) return;
    console.log('RESULT ' + JSON.stringify({ ok: false, error: String(err) }));
    app.exit(1);
  }
}

const windowOf = (event: { sender: Electron.WebContents }): BrowserWindow | null => BrowserWindow.fromWebContents(event.sender);

async function windowReady(win: BrowserWindow): Promise<void> {
  await win.webContents.executeJavaScript('new Promise((resolve, reject) => { const deadline = Date.now() + 30000; const check = () => { if (window.__phaint) resolve(true); else if (Date.now() > deadline) reject(new Error("Приложение не запустилось")); else setTimeout(check, 20); }; check(); })');
}

// Только тестовый режим: сценарий одного окна может проверить настоящий второй рендерер.
ipcMain.handle('test:windows', async (event, action: string, data: { id?: number; code?: string } = {}) => {
  if (!testing) return null;
  if (action==='list') return [...documentWindows].map(win=>({id:win.id,title:win.getTitle(),focused:win.isFocused(),minimized:win.isMinimized(),visible:win.isVisible(),bounds:win.getBounds()}));
  if (action==='new' || action==='activate' || action==='second-instance') {
    const before=new Set(documentWindows);
    if(action==='new')openWindow();else app.emit(action);
    const win=[...documentWindows].find(win=>!before.has(win)) ?? menuWindow;
    if (!win) throw new Error('Нет открытого окна.');
    await windowReady(win);
    return win.id;
  }
  if (action==='switch-app') { app.emit('did-become-active'); return true; }
  if (visible && (action==='reopen-native' || action==='background')) {
    // Настоящий Launch Services, как при запуске через Dock/Spotlight; только для проверки.
    const {execFile}=await import('node:child_process');
    const target=action==='background'?'Finder':dirname(dirname(dirname(process.execPath)));
    await new Promise<void>((resolve,reject)=>execFile('/usr/bin/open',['-a',target],error=>error?reject(error):resolve()));
    return true;
  }
  if (action==='quit') { app.quit(); return true; }
  const win=data.id===undefined?windowOf(event):[...documentWindows].find(win=>win.id===data.id);
  if (!win || !documentWindows.has(win)) throw new Error('Нет тестового окна.');
  if (action==='close') return files.close(win);
  if (action==='focus') { if(visible){win.show();win.focus();}else win.emit('focus'); return true; }
  if (action==='minimize') { win.minimize(); return true; }
  if (action==='hide') { app.hide(); return true; }
  if (action==='eval') {
    await windowReady(win);
    return win.webContents.executeJavaScript(`(async()=>{${data.code ?? ''}\n})()`,true);
  }
  return null;
});

ipcMain.handle('clipboard:image', async () => {
  const data=native?.clipboardImage(); if(data) return data;
  for(const item of await clipboard.read()) {
    if(!item.types.includes('image/png'))continue;
    const blob=await item.getType('image/png');
    const img=nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()));
    if(!img.isEmpty())return {dataURL:img.toDataURL(),...img.getSize()};
  }
  return null;
});
ipcMain.handle('settings:load', event => settings.load(event.sender.id));
ipcMain.handle('settings:save', async (event, data: unknown, choice: unknown) => {
  const selected = isLanguage(choice) ? choice : undefined;
  await settings.save(event.sender.id, data, selected);
  if (selected && selected !== language) {
    setLanguage(selected);
    buildMenu(menuWindow ? windowShortcuts.get(menuWindow) : undefined);
    for (const win of documentWindows) win.webContents.send('settings:language', selected);
  }
});
ipcMain.handle('window:toggle-fullscreen', (event) => {
  const win = windowOf(event);
  if (!win) return;
  win.setFullScreen(!win.isFullScreen());
});
ipcMain.handle('window:is-fullscreen', (event) => windowOf(event)?.isFullScreen() ?? false);
ipcMain.handle('native:tablet-stats', () => native?.tabletStats() ?? null);
ipcMain.handle('test:shot', async (event, name: unknown, rect?: Rectangle) => {
  const win = windowOf(event);
  if (!testing || !win) return null;
  const safe = String(name).replace(/[^\w-]/g, '_');
  return shot(win, shotFile.replace(/\.png$/i, '') + `.${safe}.png`, rect);
});
ipcMain.handle('test:window', (event) => {
  const win = windowOf(event);
  if (!testing || !win) return null;
  return {
    native: native !== null,
    styleMask: native?.windowStyleMask(win.getNativeWindowHandle()) ?? null,
    fullscreen: win.isFullScreen(),
    simpleFullscreen: win.isSimpleFullScreen(),
    bounds: win.getBounds(),
    display: screen.getDisplayMatching(win.getBounds()).bounds,
    presentation: native?.getPresentation() ?? null,
  };
});

app.on('before-quit', event => {
  if (quitAllowed || !files || !singleInstance) return;
  event.preventDefault();
  if (quitting) return;
  quitting=closeAllWindows().catch(error=>console.error(error)).finally(()=>{quitting=null;});
});
app.on('window-all-closed', () => { if (!quitting) app.quit(); });

void app.whenReady().then(async () => {
  if (!singleInstance) return;
  const profile = await settings.load(0);
  if (profile.language) setLanguage(profile.language);
  else {
    const selected = testing ? (arg('choose-language') === 'en' ? 'en' : 'ru') :
      (dialog.showMessageBoxSync({
        type: 'question', title: 'Phaint', message: 'Выберите язык / Choose your language',
        detail: 'Позже язык можно изменить в настройках (⌘,).\nYou can change the language later in Settings (⌘,).',
        buttons: ['Русский', 'English'], defaultId: app.getLocale().startsWith('ru') ? 0 : 1, noLink: true,
      }) === 0 ? 'ru' : 'en');
    try { await settings.save(0, profile, selected); }
    catch (error) {
      dialog.showErrorBox('Не удалось сохранить язык / Could not save language', String(error));
      app.quit(); return;
    }
    setLanguage(selected);
  }
  settings.forget(0);
  files = installFiles(testing, arg('recover') !== undefined);
  installClipboard(testing,native);
  buildMenu();
  if (native) {
    // Все отсчёты планшета, а не один на кадр.
    native.setMouseCoalescing(false);
    native.startTabletMonitor();
  }
  if (testing && !visible) app.dock?.hide();
  const slots=await recoverySlots(app.getPath('userData'));
  const win = createWindow(slots[0]);
  for(const slot of slots.slice(1))createWindow(slot);
  // loadFile уже запущен: пока рендерер загружает интерфейс, AppKit готовит файловую панель.
  // В автоматических сценариях диалоги подменены, поэтому лишняя инициализация не нужна.
  if(!testing&&native)try{native.prepareFileDialogs();}catch(error){console.warn('Подготовка файловой панели: '+String(error));}
  if (testing) {
    win.webContents.once('did-finish-load', () => void runTest(win));
    // Страховка: если страница не ответила, не висеть вечно.
    setTimeout(() => {
      console.log('RESULT ' + JSON.stringify({ ok: false, error: 'timeout' }));
      app.exit(2);
    }, 120000);
  }
});
