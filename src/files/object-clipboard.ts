// Копия — обычный SVG с параметрами Phaint. Вставка получает новые id/z и один шаг отмены.
import type { App } from '../app.ts';
import { bboxUnion, matBBox } from '../core/geom.ts';
import { inheritImage, prepareObjects } from '../view/draw.ts';
import { openSvg } from './svg-import.ts';
export class ObjectClipboard {
  private app:App;
  busy=false;
  private copying:Promise<void>|null=null;
  constructor(app:App){this.app=app;}
  async copy(cut=false):Promise<void>{
    if(this.busy||this.app.input.blocked)return;
    this.app.input.finishCurrent();const objects=this.app.selection?.objects;
    if(!objects?.length){this.app.hud.toast('Сначала выделите объекты инструментом M');return;}
    const generation=this.app.files.generation;
    this.busy=true;
    let done!:()=>void;this.copying=new Promise(resolve=>{done=resolve;});
    try{
      this.app.platform.clipboardCopy(true);
      const data=this.app.files.selectionSnapshot(objects);data.grid={...data.grid,save:false};
      const svg=await this.app.files.worker.run<string>('svg',data);
      await this.app.platform.writeClipboardSvg(svg);
      if(cut&&this.app.files.generation===generation){
        // За время записи в буфер объект мог измениться; новые версии не удаляем.
        const removed=objects.filter(o=>this.app.doc.get(o.id)===o);
        if(removed.length)this.app.history.commit({added:[],removed});
      }
      this.app.hud.toast(`${cut?'Вырезано':'Скопировано'} объектов: ${objects.length}`);
    }catch(error){await this.app.platform.files.error(String(error));}finally{this.app.platform.clipboardCopy(false);this.busy=false;this.copying=null;done();}
  }
  async paste():Promise<void>{
    if(this.app.input.blocked||this.app.files.busy)return;
    const {app}=this,generation=app.files.generation,pos=app.input.position;
    const target=app.view.toWorld(pos?.x??app.view.width/app.view.dpr/2,pos?.y??app.view.height/app.view.dpr/2);
    if(this.copying)await this.copying;
    if(this.busy||app.input.blocked||app.files.busy||generation!==app.files.generation)return;
    app.input.finishCurrent();this.busy=true;
    try{
      const svg=await app.platform.readClipboardSvg();
      if(!svg){await app.pasteImage('free');return;}
      const data=await openSvg(svg,app.files.worker,app.settings.grid,app.view.width/app.view.dpr,app.view.height/app.view.dpr,{fitToWidth:false});
      if(!data.objects.length)return;
      await prepareObjects(data.objects);
      if(generation!==app.files.generation||app.input.blocked)return;
      const matrix=app.view.matrix(),screen=data.objects.map(o=>matBBox(matrix,o.bbox)).reduce(bboxUnion);
      const anchor=app.view.toWorld(screen.minX/app.view.dpr,screen.minY/app.view.dpr),dx=target.x-anchor.x,dy=target.y-anchor.y;
      let z=app.doc.topZ();
      const added=[...data.objects].sort((a,b)=>a.z-b.z).map(o=>{
        const next={...o,id:app.doc.nextId(),z:z++,ox:o.ox+dx,oy:o.oy+dy,bbox:{minX:o.bbox.minX+dx,minY:o.bbox.minY+dy,maxX:o.bbox.maxX+dx,maxY:o.bbox.maxY+dy}};
        inheritImage(o,next);return next;
      });
      app.input.finishCurrent();app.history.commit({added,removed:[]});app.selectTool('select',false);app.selection!.showObjects(added);
    }catch(error){await app.platform.files.error(String(error));}finally{this.busy=false;}
  }
}
