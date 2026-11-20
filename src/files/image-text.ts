// Ctrl+C: локальное распознавание одной выбранной картинки; документ и история не меняются.
import type { App } from '../app.ts';
import { isCancelled } from '../core/cancel.ts';
import { isLocked } from '../core/types.ts';
import { FileProcessing } from './processing.ts';

export class ImageText {
  private app:App;
  private processing:FileProcessing|null=null;
  private generation=0;

  constructor(app:App){this.app=app;}
  get busy():boolean{return this.processing!==null;}

  cancel():boolean{return this.processing?.cancel()??false;}
  documentChanged():void {
    if(this.processing && this.generation!==this.app.files.generation)this.cancel();
  }

  async copy():Promise<void> {
    const {app}=this;
    if(this.busy || app.input.blocked || app.files.busy || app.clipboard.busy ||
      document.activeElement?.closest('input,textarea,select,[contenteditable],dialog'))return;
    app.input.finishCurrent();
    const objects=app.selection?.objects,image=objects?.[0];
    if(objects?.length!==1 || image?.kind!=='image' || isLocked(image)){
      app.hud.toast('Выделите одну картинку для распознавания текста');return;
    }
    const processing=this.processing=new FileProcessing('Распознаю текст…','Распознавание текста');
    this.generation=app.files.generation;
    try{
      const result=await app.platform.copyImageText({source:image.source,
        ...(image.clip?{clip:image.clip.flatMap(p=>[p.x/image.width,p.y/image.height])}:{})},processing.signal);
      processing.signal.throwIfAborted();
      app.hud.toast({copied:'Текст скопирован',empty:'На картинке не найден текст',
        superseded:'Буфер уже изменился — текст не скопирован',cancelled:'Распознавание отменено'}[result]);
    }catch(error){
      if(isCancelled(error))app.hud.toast('Распознавание отменено');
      else{
        const message=(error instanceof Error?error.message:String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
        await app.platform.files.error(message);
      }
    }finally{processing.close();this.processing=null;}
  }
}
