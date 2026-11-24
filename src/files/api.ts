// Общие типы файлового моста: никаких Electron-зависимостей в рендерере.
export interface FileRef { handle: string; name: string }
import type { PdfExportRequest } from './pdf-types.ts';
export type OpenFile = FileRef & ({type?:'svg';text:string}|{type:'image';bytes:Uint8Array;mime:string}|{type:'pdf';bytes:Uint8Array;mime:string});
export type UnsavedChoice = 'save' | 'discard' | 'cancel';
export type ExportFormat = 'svg' | 'pdf' | 'png' | 'jpg';
export type ExportFormats = { drawing?: ExportFormat; selection?: ExportFormat };
export interface RecoveryFile { data: string; name: string; savedAt: string }
export interface FileApi {
  open(): Promise<OpenFile | null>;
  /** Последний рабочий файл. Путь хранится в оболочке, рендерер видит только ссылку. */
  recent?():Promise<FileRef|null>;
  read?(file:FileRef):Promise<OpenFile>;
  remember?(file:FileRef):Promise<void>;
  chooseSave(current: FileRef | null, saveAs: boolean, selection?:boolean): Promise<FileRef | null>;
  chooseExport(current: FileRef | null, format: ExportFormat, selection: boolean, previous?: FileRef): Promise<FileRef | null>;
  exportFormats?(current: FileRef): Promise<ExportFormats>;
  rememberExport?(current: FileRef, selected: boolean, target: FileRef): Promise<void>;
  writeBinary(file: FileRef, bytes: Uint8Array): Promise<void>;
  pdf?(svg: string, width: number, height: number, job?: string): Promise<Uint8Array>;
  annotatedPdf?(request:PdfExportRequest, job?: string):Promise<Uint8Array>;
  cancelPdf?(job:string):Promise<void>;
  write(file: FileRef, text: string): Promise<void>;
  /** Порционная запись большого SVG: доступна в Electron. */
  beginWrite?(file: FileRef): Promise<string>;
  writeChunk?(ticket: string, chunk: Uint8Array): Promise<void>;
  finishWrite?(ticket: string): Promise<void>;
  abortWrite?(ticket: string): Promise<void>;
  beginRecovery?(name: string, savedAt: string): Promise<string>;
  confirmUnsaved(name: string): Promise<UnsavedChoice>;
  recoveryRead(): Promise<RecoveryFile | null>;
  /** Оставить отменённое восстановление для следующего запуска, сменив копию текущего окна. */
  deferRecovery?():Promise<void>;
  recoveryWrite(file: RecoveryFile | null): Promise<void>;
  confirmRecovery(file: RecoveryFile): Promise<boolean>;
  status(name: string, dirty: boolean): void;
  error(message: string): Promise<void>;
  onCommand(cb: (command: 'open' | 'save' | 'saveAs' | 'export' | 'new' | 'close') => void): void;
  closeReady(ready?: boolean): void;
}
