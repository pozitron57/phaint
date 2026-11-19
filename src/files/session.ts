// Жизненный цикл документа: сохранить/открыть/закрыть, признак изменений и резервная копия.
// Запись снимка не помечает более поздние штрихи сохранёнными. Автокопия только при изменениях,
// через 5 с тишины, максимум через минуту; тяжёлая сериализация идёт в Worker.
import type { App } from '../app.ts';
import type { FileRef, OpenFile, RecoveryFile } from './api.ts';
import type { DocumentData } from './codec.ts';
import { DocumentWorker } from './worker-client.ts';
import { FileProcessing } from './processing.ts';
import { abortable, cancellationPoint, checkCancelled, isCancelled } from '../core/cancel.ts';
import { openSvg, sanitizeSvg } from './svg-import.ts';
import { bboxUnion, bboxIntersects } from '../core/geom.ts';
import { prepareObjects } from '../view/draw.ts';
import { isPdfPage, type Obj } from '../core/types.ts';
import { exportSize } from './codec.ts';
import { browserPdf, chooseExport, rasterExport } from './export.ts';
import { VECTOR_QUALITY, vectorOptions, exportHasGrid, type ExportSettings } from './export-options.ts';
import type { FileWriteStats, LastFileWrite, SvgFileResult } from './file-stats.ts';
import { preferredExport } from './names.ts';
import { openImage } from './image-import.ts';
import { PdfView } from './pdf-view.ts';
import type { PdfSource, PdfExportRequest, PdfLayer } from './pdf-types.ts';

export class DocumentSession {
  private app: App;
  readonly worker = new DocumentWorker();
  file: FileRef | null = null;
  private processing: FileProcessing | null = null;
  get processingFile(): boolean { return this.processing !== null; }
  cancelProcessing(): boolean { return this.processing?.cancel() ?? false; }
  private pdf:PdfSource|undefined;
  private pdfView:PdfView|null=null;
  busy = false;
  baseScale = 1;
  generation = 0;
  lastWrite:LastFileWrite|null=null;
  private savedState: number;
  private savedGrid: string;
  private switching = false;
  private timer = 0;
  private due = 0;
  private epoch = 0;
  private recoveryChain: Promise<void> = Promise.resolve();
  private backupErrorShown = false;
  private active: Promise<boolean> | null = null;
  private closePending = false;
  private initializing = true;
  readonly ready: Promise<void>;

  constructor(app: App) {
    this.app = app;
    this.savedState = app.history.state;
    this.savedGrid = this.gridKey();
    const viewChanged=app.view.onChange;
    app.view.onChange=()=>{viewChanged?.();this.pdfView?.schedule();};
    app.doc.onChange(() => this.changed());
    app.platform.files.onCommand(command => {
      if (command === 'close') void this.close();
      else if (command === 'open') void this.open();
      else if (command === 'new') void this.newDocument();
      else if (command === 'export') void this.export();
      else void this.save(command === 'saveAs');
    });
    this.ready = this.initialize();
  }

  get name(): string { return this.file?.name ?? 'Без названия'; }
  get dirty(): boolean { return this.app.history.state !== this.savedState || this.gridKey() !== this.savedGrid; }
  private gridKey(): string { return `${this.app.settings.grid.enabled}:${this.app.settings.grid.step}:${!!this.app.settings.grid.save}`; }

  changed(): void {
    if (this.switching) return;
    this.app.platform.files.status(this.name, this.dirty);
    window.clearTimeout(this.timer);
    if (!this.dirty) {
      this.due = 0;
      // Выполняется только на границе «изменено → сохранено», не в кадре рисования.
      void this.clearRecovery().catch(error => this.backupError(error));
      return;
    }
    if (!this.due) this.due = performance.now() + 60000;
    this.timer = window.setTimeout(() => { void this.backup(); }, Math.max(0, Math.min(5000, this.due - performance.now())));
  }

  snapshot(objects?:readonly Obj[]): DocumentData {
    const { view, doc, settings } = this.app;
    const entries=objects?[...objects]:[...doc.values()];
    const center = view.toWorld(view.width / view.dpr / 2, view.height / view.dpr / 2);
    const corners=[[0,0],[view.width/view.dpr,0],[view.width/view.dpr,view.height/view.dpr],[0,view.height/view.dpr]].map(([x,y])=>view.toWorld(x,y));
    const emptyBounds=corners.map(p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y})).reduce(bboxUnion);
    return { ...(!entries.length?{emptyBounds}:{}),...(this.pdf&&entries.some(isPdfPage)?{pdf:this.pdf}:{}),baseScale:this.baseScale, objects:entries, grid: { ...settings.grid }, view: { scale: view.scale, rotSteps: view.rotSteps, ...center } };
  }

  async backup(): Promise<void> {
    window.clearTimeout(this.timer);
    if (!this.dirty || this.switching) return;
    if (this.app.input.drawing || this.busy) {
      this.timer = window.setTimeout(() => { void this.backup(); }, 1000);
      return;
    }
    const epoch = this.epoch;
    const data = this.snapshot();
    this.due = 0;
    this.recoveryChain = this.recoveryChain.catch(() => undefined).then(async () => {
      if (epoch !== this.epoch || !this.dirty) return;
      const api = this.app.platform.files;
      const savedAt = new Date().toISOString();
      if (api.beginRecovery) {
        const ticket = await api.beginRecovery(this.name, savedAt);
        try {
          await this.worker.streamRecovery(data, chunk => api.writeChunk!(ticket, chunk));
          if (epoch === this.epoch && this.dirty) await api.finishWrite!(ticket);
          else await api.abortWrite!(ticket);
        } catch (error) { await api.abortWrite!(ticket); throw error; }
      } else {
        const text = await this.worker.run<string>('recovery', data);
        if (epoch === this.epoch && this.dirty) await api.recoveryWrite({ data: text, name: this.name, savedAt });
      }
      this.backupErrorShown = false;
    });
    await this.recoveryChain.catch(error => this.backupError(error));
  }

  private backupError(error: unknown): void {
    if (this.backupErrorShown) return;
    this.backupErrorShown = true;
    this.app.hud.toast('Не удалось записать резервную копию. Сохраните рисунок через Cmd+S.');
    console.error(error);
  }

  private clearRecovery(): Promise<void> {
    this.epoch++;
    window.clearTimeout(this.timer);
    this.due = 0;
    this.recoveryChain = this.recoveryChain.catch(() => undefined).then(() => this.app.platform.files.recoveryWrite(null));
    return this.recoveryChain;
  }

  save(saveAs = false): Promise<boolean> {
    return this.run(()=>{
      const selected=this.app.selection?.objects;
      return selected?.length?this.saveSelection(selected):this.saveCore(saveAs);
    });
  }
  selectionSnapshot(objects:readonly Obj[]):DocumentData {
    const data=this.snapshot(objects),bounds=objects.map(o=>o.bbox).reduce(bboxUnion);
    return {...data,view:{...data.view,x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2}};
  }
  export():Promise<boolean> {
    return this.run(async()=>{
      const selected=this.app.selection?.objects??[],data=selected.length?this.selectionSnapshot(selected):this.snapshot();
      return this.exportData(data,selected.length);
    });
  }
  private rememberExport(choice:ExportSettings,svgOnly:boolean):void {
    const format=svgOnly?this.app.settings.export.format:choice.format;
    this.app.settings.export={...choice,format};this.app.settingsChanged();
  }
  private async exportData(data:DocumentData,selected:number,svgOnly=false):Promise<boolean> {
    const initial={...this.app.settings.export,format:preferredExport(this.file?.name,this.app.settings.export.format)};
    const pdfPages=data.pdf&&this.app.platform.files.annotatedPdf?data.objects.filter(isPdfPage).length:0;
    const withoutGrid=exportSize({...data,grid:{...data.grid,save:false}}),withGrid=exportSize({...data,grid:{...data.grid,save:true}});
    const choice=await chooseExport(withoutGrid.width,withoutGrid.height,selected,initial,svgOnly,{visible:data.grid.enabled,...withGrid},pdfPages);
    if(!choice)return false;
    data={...data,grid:{...data.grid,save:exportHasGrid(choice,data.grid.enabled,pdfPages)}};
    const {width,height}=exportSize(data);
    const {format}=choice,api=this.app.platform.files;
    if(format==='svg')data={...data,exportOptions:{...choice.svg}};
    if(format==='pdf')data={...data,exportOptions:{...choice.pdf,editable:false,grid:'paths',vectorMasks:true}};
    if(format==='pdf'&&!api.pdf){
      await this.process('Подготовка PDF…', async op => {
        const svg=await op.worker.run<string>('visual',data,op.signal);
        await browserPdf(svg,width,height,op.signal);
      });
      this.rememberExport(choice,svgOnly);return true;
    }
    const file=await api.chooseExport(this.file,format,!!selected);if(!file)return false;
    return this.process('Экспорт…', async op => {
      if(data.pdf&&format!=='svg'&&(format!=='pdf'||!api.annotatedPdf)){
        const density=format==='png'||format==='jpg'?choice[format].width/width:Math.min(3,VECTOR_QUALITY[vectorOptions(choice[format]).quality].pixelsPerUnit);
        data=await (await import('./pdf-render.ts')).pdfExportImages(data,density,op.signal);
      }
      let stats:FileWriteStats;
      if(format==='svg')stats=await this.write(file,data,op);
      else{
        let bytes:Uint8Array;
        if(format==='pdf'&&data.pdf&&api.annotatedPdf){
          const request=await this.pdfRequest(data,choice.pdf.layout,op);
          bytes=await this.nativePdf(op,id=>api.annotatedPdf!(request,id));
        }else{
          const svg=await op.worker.run<string>('visual',data,op.signal);
          bytes=format==='pdf'?await this.nativePdf(op,id=>api.pdf!(svg,width,height,id))
            :await rasterExport(svg,width,height,choice[format].width,format,choice.jpg.quality,op.signal);
        }
        if(format==='png')bytes=await op.worker.run<Uint8Array>('png',{bytes,level:choice.png.compression},op.signal);
        op.seal();await api.writeBinary(file,bytes);
        stats={bytes:bytes.byteLength};
      }
      this.lastWrite={...stats,name:file.name,action:'export'};
      this.rememberExport(choice,svgOnly);this.app.hud.toast(`Экспортировано: ${file.name}`);return true;
    });
  }

  private async pdfRequest(data:DocumentData,layout:'pages'|'sheet',op:FileProcessing):Promise<PdfExportRequest> {
    const pages=data.objects.filter(isPdfPage);
    const objects=data.objects.filter(o=>!isPdfPage(o)),bounds=exportSize(data);
    const request:PdfExportRequest={source:data.pdf!,layout,bounds,pages:pages.map(o=>({page:o.pdfPage!,x:o.ox,y:o.oy,width:o.width,height:o.height}))};
    const annotations={...data,pdf:undefined,objects,grid:{...data.grid,enabled:false,save:false}};
    const layers=async(objects:Obj[],exportBounds:import('../core/geom.ts').BBox):Promise<PdfLayer[]>=>{
      const groups:Array<{objects:Obj[];multiply:boolean}>=[];
      for(const o of [...objects].sort((a,b)=>a.z-b.z)){
        const multiply=o.kind==='stroke'&&o.marker===true,last=groups.at(-1);
        if(!multiply&&last&&!last.multiply)last.objects.push(o);
        else groups.push({objects:[o],multiply});
      }
      const result:PdfLayer[]=[];
      for(const group of groups)result.push({multiply:group.multiply,svg:await op.worker.run<string>('visual',{...annotations,objects:group.objects,exportBounds},op.signal)});
      return result;
    };
    if(layout==='sheet'){
      request.grid=data.grid.enabled&&data.grid.save?{step:data.grid.step}:undefined;
      request.layers=await layers(objects,{minX:bounds.x,minY:bounds.y,maxX:bounds.x+bounds.width,maxY:bounds.y+bounds.height});
    }else for(let i=0;i<pages.length;i++){
      const page=pages[i],inside=objects.filter(o=>bboxIntersects(o.bbox,page.bbox));
      if(inside.length)request.pages[i].layers=await layers(inside,page.bbox);
    }
    return request;
  }
  private async saveSelection(objects:readonly Obj[]):Promise<boolean> {
    return this.exportData(this.selectionSnapshot(objects),objects.length,true);
  }
  private async saveCore(saveAs: boolean): Promise<boolean> {
    this.app.input.finishCurrent();
    const file = await this.app.platform.files.chooseSave(this.file, saveAs);
    if (!file) return false;
    const state = this.app.history.state, grid = this.gridKey();
    const data = this.snapshot();
    const stats=await this.process('Сохранение…', op=>this.write(file,data,op));
    this.lastWrite={...stats,name:file.name,action:'save'};
    this.file = file;
    this.savedState = state; this.savedGrid = grid;
    if (!this.dirty) await this.clearRecovery();
    this.changed();
    await this.rememberFile(file);
    this.app.hud.toast(this.dirty ? 'Снимок сохранён; есть новые изменения' : `Сохранено: ${file.name}`);
    return true;
  }
  private async write(file:FileRef,data:DocumentData,op:FileProcessing):Promise<FileWriteStats> {
    const api = this.app.platform.files;
    if (api.beginWrite) {
      const ticket = await api.beginWrite(file);
      try {
        const stats=await op.worker.streamSvg(data, chunk => api.writeChunk!(ticket, chunk),op.signal);
        op.seal();await api.finishWrite!(ticket);
        return stats;
      } catch (error) {
        await api.abortWrite!(ticket);
        throw error;
      }
    } else {
      const {text,stats} = await op.worker.run<SvgFileResult>('svg-file', data,op.signal);
      op.seal();await api.write(file, text);
      return stats;
    }
  }

  private async rememberFile(file:FileRef):Promise<void> {
    // Ошибка вспомогательной истории не превращает удачное сохранение в неудачное.
    try{await this.app.platform.files.remember?.({handle:file.handle,name:file.name});}catch(error){console.warn('Последний файл не запомнен: '+String(error));}
  }

  open(recent=false): Promise<boolean> {
    return this.run(async () => {
      const api=this.app.platform.files;let file:OpenFile|null;
      if(recent){
        if(!api.recent||!api.read){this.app.hud.toast('В браузере выберите файл через Cmd+O.');return false;}
        const ref=await api.recent();
        if(!ref){this.app.hud.toast('Пока нет недавнего файла. Откройте или сохраните рисунок.');return false;}
        // Выбор файла фиксируем до сохранения текущего, содержимое читаем после:
        // Cmd+R того же документа не должен вернуть старую версию сразу после Cmd+S.
        if(!await this.canLeave())return false;
        file=await api.read(ref);
      }else file=await api.open();
      if (!file) return false;
      const { view, settings } = this.app;
      // Сначала читаем и проверяем новый файл. При ошибке текущий рисунок остаётся на месте.
      const w=view.width/view.dpr,h=view.height/view.dpr;
      const data=await this.process('Открытие файла…', async op=>{
        const data=file.type==='pdf'
          ?await (await import('./pdf-render.ts')).openPdf(file.bytes,file.name,settings.grid,w,h,text=>op.update(text),op.signal)
          :file.type==='image'?await openImage(file.bytes,file.mime,settings.grid,w,h,op.signal)
          :await openSvg(file.text,op.worker,settings.grid,w,h,op.signal);
        await prepareObjects(data.objects,op.signal);
        return data;
      });
      if (!recent&&!await this.canLeave()) return false;
      await this.clearRecovery();
      this.replace(data, file, false);
      await this.rememberFile(file);
      return true;
    }, true);
  }

  newDocument(): Promise<boolean> {
    return this.run(async () => {
      if (!await this.canLeave()) return false;
      await this.clearRecovery();
      const v = this.app.view;
      this.replace({ objects: [], grid: { ...this.app.settings.grid, save:true }, view: { scale: 1, rotSteps: 0, x: v.width / v.dpr / 2, y: v.height / v.dpr / 2 } }, null, false);
      return true;
    }, true);
  }

  async close(): Promise<void> {
    if (this.closePending) return;
    this.closePending = true;
    let ready = false;
    try {
      await this.ready;
      if (this.active) await this.active;
      ready = await this.run(async () => {
        if (!await this.canLeave()) return false;
        await this.clearRecovery();
        await this.app.flushSettings();
        this.app.platform.files.closeReady();
        return true;
      }, true);
    } finally {
      this.closePending = false;
      if (!ready) this.app.platform.files.closeReady(false);
    }
  }

  private async canLeave(): Promise<boolean> {
    if (!this.dirty) return true;
    const choice = await this.app.platform.files.confirmUnsaved(this.name);
    if (choice === 'cancel') return false;
    if (choice === 'save') return this.saveCore(false);
    return true;
  }

  private async process<T>(label:string,fn:(op:FileProcessing)=>Promise<T>):Promise<T> {
    this.app.hud.clearToast();
    const op=new FileProcessing(label);this.processing=op;
    try { const result=await fn(op);checkCancelled(op.signal);return result; }
    catch(error){if(op.signal.aborted)throw op.signal.reason;throw error;}
    finally {op.close();this.processing=null;}
  }

  private async nativePdf(op:FileProcessing,fn:(id:string)=>Promise<Uint8Array>):Promise<Uint8Array> {
    checkCancelled(op.signal);
    const id=crypto.randomUUID();let stopped:Promise<void>|undefined;
    const abort=()=>{stopped=this.app.platform.files.cancelPdf?.(id).catch(()=>undefined);};
    op.signal.addEventListener('abort',abort,{once:true});
    try{return await abortable(fn(id),op.signal);}
    finally{op.signal.removeEventListener('abort',abort);await stopped;}
  }

  private run(fn: () => Promise<boolean>, freeze = false): Promise<boolean> {
    if (this.busy || this.initializing) return Promise.resolve(false);
    this.busy = true;
    this.app.input.finishCurrent();
    if (freeze) {
      this.app.input.blocked = true;
      document.getElementById('ui')!.inert = true;
    }
    const task = (async () => {
      try { return await fn(); }
      catch (error) {
        if (isCancelled(error)) { this.app.hud.toast('Обработка отменена'); return false; }
        const message = (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
        await this.app.platform.files.error(message);
        return false;
      }
      finally {
        this.busy = false; this.app.input.blocked = false; this.active = null;
        document.getElementById('ui')!.inert = false;
        this.app.platform.files.status(this.name, this.dirty);
      }
    })();
    this.active = task;
    return task;
  }

  private replace(data: DocumentData, file: FileRef | null, recovered: boolean): void {
    this.switching = true;
    try {
      this.generation++;
      this.pdfView?.dispose();this.pdfView=null;this.pdf=data.pdf;
      this.baseScale=data.baseScale??1;
      this.app.history.clear();
      Object.assign(this.app.settings.grid, {save:false}, data.grid);
      this.app.view.restore(data.view);
      this.file = file;
      this.savedState = recovered ? -1 : this.app.history.state;
      this.savedGrid = this.gridKey();
      this.app.doc.replace(data.objects);
      if(this.pdf)this.pdfView=new PdfView(this.app,this.pdf);
      this.app.panels.background.sync();
      this.app.onViewChanged();
    } finally { this.switching = false; }
    this.app.platform.files.status(this.name, this.dirty);
    if (recovered) this.changed();
  }

  private async initialize(): Promise<void> {
    this.app.input.blocked = true;
    try {
      const recovery: RecoveryFile | null = await this.app.platform.files.recoveryRead();
      if (recovery) {
        if (await this.app.platform.files.confirmRecovery(recovery)) {
          const data = await this.process('Восстановление рисунка…', async op => {
            const data=await op.worker.run<DocumentData>('decode',recovery.data,op.signal);
            const objects:Obj[]=[];
            for(const o of data.objects){
              if(o.kind==='svg'){await cancellationPoint(op.signal);objects.push({...o,source:sanitizeSvg(o.source).source});}
              else objects.push(o);
            }
            data.objects=objects;await prepareObjects(data.objects,op.signal);return data;
          });
          this.replace(data, null, true);
          this.app.hud.toast('Рисунок восстановлен. Сохраните его через Cmd+S.');
        } else await this.clearRecovery();
      }
    } catch (error) {
      if(isCancelled(error)){
        await this.app.platform.files.deferRecovery?.();
        this.app.hud.toast('Восстановление отменено; резервная копия сохранена');
      }
      else await this.app.platform.files.error(`Не удалось прочитать резервную копию. ${String(error)}`);
    }
    finally {
      this.initializing = false;
      this.app.input.blocked = false;
      this.app.platform.files.status(this.name, this.dirty);
    }
  }
}
