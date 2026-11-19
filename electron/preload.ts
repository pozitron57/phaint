// Мост между страницей и главным процессом. Страница видит только window.phaintNative
// (см. src/platform.ts) и не имеет доступа к Node.
import { contextBridge, ipcRenderer } from 'electron';
import type { FileApi } from '../src/files/api.ts';

const files: FileApi = {
  open: () => ipcRenderer.invoke('files:open'),
  recent:()=>ipcRenderer.invoke('files:recent'),
  read:file=>ipcRenderer.invoke('files:read',file),
  remember:file=>ipcRenderer.invoke('files:remember',file),
  chooseSave: (current, saveAs, selection) => ipcRenderer.invoke('files:choose-save', current, saveAs, selection),
  chooseExport: (current, format, selection) => ipcRenderer.invoke('files:choose-export', current, format, selection),
  writeBinary: (file, bytes) => ipcRenderer.invoke('files:write-binary', file, bytes),
  pdf: (svg, width, height, job) => ipcRenderer.invoke('files:pdf', svg, width, height, job),
  annotatedPdf:(request, job)=>ipcRenderer.invoke('files:annotated-pdf',request,job),
  cancelPdf:job=>ipcRenderer.invoke('files:cancel-pdf',job),
  write: (file, text) => ipcRenderer.invoke('files:write', file, text),
  beginWrite: file => ipcRenderer.invoke('files:write-begin', file),
  writeChunk: (ticket, chunk) => ipcRenderer.invoke('files:write-chunk', ticket, chunk),
  finishWrite: ticket => ipcRenderer.invoke('files:write-finish', ticket),
  abortWrite: ticket => ipcRenderer.invoke('files:write-abort', ticket),
  beginRecovery: (name, savedAt) => ipcRenderer.invoke('files:recovery-begin', name, savedAt),
  confirmUnsaved: name => ipcRenderer.invoke('files:confirm-unsaved', name),
  recoveryRead: () => ipcRenderer.invoke('files:recovery-read'),
  deferRecovery:()=>ipcRenderer.invoke('files:recovery-defer'),
  recoveryWrite: file => ipcRenderer.invoke('files:recovery-write', file),
  confirmRecovery: file => ipcRenderer.invoke('files:confirm-recovery', file),
  status: (name, dirty) => ipcRenderer.send('files:status', name, dirty),
  error: message => ipcRenderer.invoke('files:error', message),
  onCommand: cb => { ipcRenderer.on('files:command', (_event, command) => cb(command)); },
  closeReady: (ready = true) => ipcRenderer.send('files:close-ready', ready),
};

contextBridge.exposeInMainWorld('phaintNative', {
  appAction:(command:string)=>ipcRenderer.send('app:action',command),
  onAction:(cb:(id:string)=>void)=>{ipcRenderer.on('shortcuts:action',(_event,id)=>cb(id));},
  updateShortcuts:(keys:Record<string,string[]>)=>ipcRenderer.send('shortcuts:update',keys),
  readClipboardSvg:()=>ipcRenderer.invoke('clipboard:svg-read'),
  writeClipboardSvg:(svg:string)=>ipcRenderer.invoke('clipboard:svg-write',svg),
  clipboardCopy:(pending:boolean)=>ipcRenderer.send('clipboard:copy',pending),
  onEdit:(cb:(command:'copy'|'paste'|'cut')=>void)=>{ipcRenderer.on('edit:command',(_event,command)=>cb(command));},
  editText:(command:'copy'|'paste'|'cut')=>{ipcRenderer.send('edit:text',command);},
  files,
  clipboardImage: () => ipcRenderer.invoke('clipboard:image'),
  testKeys:(action:string,data:unknown={}):Promise<unknown>=>ipcRenderer.invoke('test:keys',action,data),
  testWindows:(action:string,data:unknown={}):Promise<unknown>=>ipcRenderer.invoke('test:windows',action,data),
  testFiles: (action: string, data: unknown = {}): Promise<unknown> => ipcRenderer.invoke('test:files', action, data),
  loadSettings: (): Promise<unknown> => ipcRenderer.invoke('settings:load'),
  saveSettings: (data: unknown): Promise<void> => ipcRenderer.invoke('settings:save', data),
  toggleFullscreen: (): Promise<void> => ipcRenderer.invoke('window:toggle-fullscreen'),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:is-fullscreen'),
  onFullscreen: (cb: (on: boolean) => void): void => {
    ipcRenderer.on('window:fullscreen', (_event, on: boolean) => cb(on));
  },
  onSelectAll:(cb:()=>void):void=>{ipcRenderer.on('edit:select-all',()=>cb());},
  /** Что система прислала за последний штрих пера (нативный модуль); null, если модуля нет. */
  tabletStats: (): Promise<Record<string, number> | null> => ipcRenderer.invoke('native:tablet-stats'),
  /** Только в режиме проверки: сохранить снимок окна или его части (экранные px), вернуть путь к файлу. */
  shot: (name: string, rect?: { x: number; y: number; width: number; height: number }): Promise<string | null> =>
    ipcRenderer.invoke('test:shot', name, rect),
  /** Только в режиме проверки: состояние окна (полный экран, размеры, нативный модуль). */
  windowInfo: (): Promise<unknown> => ipcRenderer.invoke('test:window'),
});
