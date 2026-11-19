// Чёткие видимые страницы PDF: обновление после остановки вида, до трёх изображений
// по 8 Мп. Во время письма новые операции откладываются. Документ и история не меняются.
import type { App } from '../app.ts';
import type { PdfSource } from './pdf-types.ts';
import { isPdfPage, type PdfPageObj } from '../core/types.ts';
import { setPdfImage } from '../view/draw.ts';
import { bboxIntersects } from '../core/geom.ts';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export class PdfView {
  private app:App;
  private source:PdfSource;
  private pdf:Promise<PDFDocumentProxy>|null=null;
  private timer=0;
  private stopped=false;
  private busy=false;
  private cache=new Map<PdfPageObj,{image:ImageBitmap;density:number}>();
  constructor(app:App,source:PdfSource){this.app=app;this.source=source;this.schedule();}
  schedule():void {window.clearTimeout(this.timer);if(!this.stopped)this.timer=window.setTimeout(()=>void this.refresh(),180);}
  dispose():void {this.stopped=true;window.clearTimeout(this.timer);for(const [o,v] of this.cache){setPdfImage(o,null);v.image.close();}this.cache.clear();void this.pdf?.then(pdf=>pdf.loadingTask.destroy()).catch(()=>{});}
  private async refresh():Promise<void> {
    if(this.stopped)return;
    if(this.busy||this.app.input.drawing){this.schedule();return;}
    const {view,doc,renderer}=this.app,bounds=view.worldBounds();
    const pages=[...doc.values()].filter(isPdfPage).filter(o=>bboxIntersects(o.bbox,bounds)).slice(0,3);
    for(const [o,v] of this.cache)if(!pages.includes(o)){setPdfImage(o,null);v.image.close();this.cache.delete(o);renderer.tiles.onChange({added:[o],removed:[o],top:false});renderer.invalidateScene();}
    this.busy=true;
    try{
      for(const o of pages){
        const density=Math.min(2**Math.ceil(Math.log2(view.scale*view.dpr)),Math.sqrt(8000000/(o.width*o.height)));
        const old=this.cache.get(o);if(old&&Math.abs(old.density-density)<.01)continue;
        const module=await import('./pdf-render.ts');if(this.stopped)break;
        this.pdf??=module.loadPdf(this.source);const pdf=await this.pdf;
        if(this.stopped)break;
        const canvas=await module.renderPage(pdf,o.pdfPage!.index,density,()=>!this.stopped&&this.app.input.drawing);
        const bitmap=await createImageBitmap(canvas);canvas.width=canvas.height=1;
        if(this.stopped){bitmap.close();break;}
        old?.image.close();this.cache.set(o,{image:bitmap,density});setPdfImage(o,bitmap);
        renderer.tiles.onChange({added:[o],removed:[o],top:false});renderer.invalidateScene();
      }
    }catch(error){if(!this.stopped)console.warn('Предпросмотр PDF: '+String(error));}
    finally{this.busy=false;}
  }
}
