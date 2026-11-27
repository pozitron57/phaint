// Выбор формата и растровый экспорт. PDF печатается векторным в системном мосте;
// браузер использует свою печать. Размер растра ограничен, чтобы не перегружать память.
import { t } from '../core/language.ts';
import { abortable, cancellationPoint, checkCancelled } from '../core/cancel.ts';
import { vectorOptions, vectorCompression, compressionLevel, MAX_VECTOR_COMPRESSION, rasterSize, rasterWidthLimit, exportHasGrid, DETAIL_LOSS_TOLERANCE, type ExportSettings } from './export-options.ts';
export {rasterSize} from './export-options.ts';

/** Курсор может уйти выше/ниже полосы: значение следует только горизонтальному движению. */
function captureSlider(input:HTMLInputElement,signal:AbortSignal):void {
  let pointer=-1;
  const apply=(e:PointerEvent)=>{
    const r=input.getBoundingClientRect(),t=Math.max(0,Math.min(1,(e.clientX-r.left-8)/Math.max(1,r.width-16))),min=Number(input.min),max=Number(input.max),step=Number(input.step)||1;
    input.value=String(Math.min(max,min+Math.round(t*(max-min)/step)*step));input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  const stop=()=>{if(pointer<0)return;const id=pointer;pointer=-1;try{input.releasePointerCapture(id);}catch{}input.dispatchEvent(new Event('change',{bubbles:true}));};
  input.addEventListener('pointerdown',e=>{if(e.button!==0||input.disabled)return;e.preventDefault();input.focus();pointer=e.pointerId;try{input.setPointerCapture(pointer);}catch{}apply(e);},{signal});
  window.addEventListener('pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();apply(e);}},{signal});
  for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>{if((e as PointerEvent).pointerId===pointer)stop();},{signal});
  window.addEventListener('blur',stop,{signal});signal.addEventListener('abort',stop,{once:true});
}

export function chooseExport(width:number,height:number,selected:number,settings:ExportSettings,svgOnly=false,grid?:{visible:boolean;width:number;height:number},pdfPages=0):Promise<ExportSettings|null> {
  return new Promise(resolve=>{
    const withoutGrid={width,height};
    const draft=structuredClone(settings);if(svgOnly)draft.format='svg';
    for(const f of ['svg','pdf'] as const)draft[f].compression=vectorCompression(draft[f]);
    const events=new AbortController();
    const dialog=document.createElement('dialog');dialog.className='file-dialog export-dialog';
    dialog.setAttribute('aria-label',t('file.exportDrawing'));
    const content=document.createElement('div');content.className='export-content';
    const title=document.createElement('h3');title.textContent=svgOnly?t('export.saveSelectionAsSvg'):t('export.export');dialog.append(title);
    const scope=document.createElement('p');scope.textContent=selected?t('export.selected', {count:selected}):t('export.entireDrawing');dialog.append(scope);
    const select=(name:string,options:Array<[string,string]>)=>{
      const label=document.createElement('label');label.textContent=name;
      const input=document.createElement('select');input.setAttribute('aria-label',name);
      for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
      label.append(input);dialog.append(label);return {label,input};
    };
    const formats=document.createElement('div');formats.className='export-formats';formats.setAttribute('role','radiogroup');formats.setAttribute('aria-label',t('export.format'));
    const formatButtons=(['svg','pdf','png','jpg'] as const).map(f=>{
      const button=document.createElement('button');button.type='button';button.textContent=f.toUpperCase();button.dataset.format=f;
      button.setAttribute('role','radio');button.disabled=svgOnly&&f!=='svg';
      button.onclick=()=>{draft.format=f;sync();};formats.append(button);return button;
    });
    formats.onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();e.stopPropagation();const available=formatButtons.filter(b=>!b.disabled),at=available.indexOf(document.activeElement as HTMLButtonElement);
      const next=e.key==='Home'?0:e.key==='End'?available.length-1:(at+(e.key==='ArrowRight'?1:-1)+available.length)%available.length;
      available[next].click();available[next].focus();
    };
    dialog.append(formats);
    const pdfLayout=select(t('export.pdfPages'),[['pages',t('export.originalPages', {count:pdfPages})],['sheet',t('export.oneLongPage')]]);
    pdfLayout.input.value=draft.pdf.layout;pdfLayout.input.addEventListener('change',()=>{draft.pdf.layout=pdfLayout.input.value as 'pages'|'sheet';sync();});
    const gridLabel=document.createElement('label');gridLabel.className='export-editable';
    const includeGrid=document.createElement('input');includeGrid.type='checkbox';includeGrid.setAttribute('aria-label',t('export.includeGrid'));gridLabel.append(includeGrid,t('export.includeGrid'));dialog.append(gridLabel);
    const compressionGroup=document.createElement('div');compressionGroup.className='export-compression';
    const compressionLabel=document.createElement('label');compressionLabel.textContent=t('export.compression');compressionLabel.htmlFor='export-compression';
    const compressionValue=document.createElement('output');compressionValue.setAttribute('aria-live','polite');compressionLabel.append(compressionValue);
    const compression=document.createElement('input');compression.id='export-compression';compression.type='range';compression.min='0';compression.max=String(MAX_VECTOR_COMPRESSION);compression.step='1';compression.setAttribute('aria-label',t('export.compression'));
    const compressionEnds=document.createElement('div');compressionEnds.className='export-range-ends';
    for(const text of [t('export.0MoreDetail'),t('export.20SmallerFile')]){const span=document.createElement('span');span.textContent=text;compressionEnds.append(span);}
    compressionGroup.append(compressionLabel,compression,compressionEnds);dialog.append(compressionGroup);
    const geometryNote=document.createElement('p');geometryNote.className='export-description';dialog.append(geometryNote);
    const widthLabel=document.createElement('label');widthLabel.textContent=t('export.widthPx');
    const widthSlider=document.createElement('input');widthSlider.type='range';widthSlider.min='1';widthSlider.max=String(rasterWidthLimit(width,height));widthSlider.step='1';widthSlider.setAttribute('aria-label',t('export.imageWidth'));
    const widthNumber=document.createElement('input');widthNumber.type='number';widthNumber.min='1';widthNumber.max=widthSlider.max;widthNumber.step='1';widthNumber.setAttribute('aria-label',t('export.widthInPixels'));
    const widthControls=document.createElement('span');widthControls.className='export-width';widthControls.append(widthSlider,widthNumber);widthLabel.append(widthControls);dialog.append(widthLabel);
    const jpegLabel=document.createElement('label');jpegLabel.textContent=t('export.jpgQuality');
    const jpeg=document.createElement('input');jpeg.type='range';jpeg.min='10';jpeg.max='100';jpeg.step='1';jpeg.setAttribute('aria-label',t('export.jpgQuality'));
    const value=document.createElement('output');value.setAttribute('aria-live','polite');
    const controls=document.createElement('span');controls.className='export-jpeg';controls.append(jpeg,value);jpegLabel.append(controls);dialog.append(jpegLabel);
    const pngLabel=document.createElement('label');pngLabel.textContent=t('export.pngCompression');
    const png=document.createElement('input');png.type='range';png.min='0';png.max='9';png.step='1';png.setAttribute('aria-label',t('export.pngCompression'));
    const pngValue=document.createElement('output');pngValue.setAttribute('aria-live','polite');const pngControls=document.createElement('span');pngControls.className='export-jpeg';pngControls.append(png,pngValue);pngLabel.append(pngControls);dialog.append(pngLabel);
    const editLabel=document.createElement('label');editLabel.className='export-editable';
    const editable=document.createElement('input');editable.type='checkbox';editable.setAttribute('aria-label',t('export.keepEditableInPhaint'));editLabel.append(editable,t('export.keepEditableInPhaint'));dialog.append(editLabel);
    const svgoLabel=document.createElement('label');svgoLabel.className='export-editable';
    const svgo=document.createElement('input');svgo.type='checkbox';svgo.setAttribute('aria-label',t('export.additionalSvgCompression'));svgoLabel.append(svgo,t('export.optimizeSvgWithSvgo'));dialog.append(svgoLabel);
    const description=document.createElement('p');description.className='export-description';dialog.append(description);
    const editingNote=document.createElement('p');editingNote.className='export-description';dialog.append(editingNote);
    // Меняется только содержимое: рамка диалога и нижние кнопки остаются на месте.
    content.append(...dialog.childNodes);dialog.append(content);
    const sync=()=>{
      const f=draft.format,vector=f==='svg'||f==='pdf';
      for(const button of formatButtons){const active=button.dataset.format===f;button.setAttribute('aria-checked',String(active));button.tabIndex=active?0:-1;}
      const originalPages=f==='pdf'&&pdfPages>0&&draft.pdf.layout==='pages',gridIncluded=exportHasGrid(draft,grid?.visible??false,pdfPages);
      ({width,height}=gridIncluded&&grid?grid:withoutGrid);
      includeGrid.disabled=!grid?.visible||originalPages;includeGrid.checked=gridIncluded;gridLabel.style.opacity=includeGrid.disabled?'.5':'';
      includeGrid.title=originalPages?t('export.gridUnavailableForPages'):!grid?.visible?t('export.theGridIsHiddenPressGOnThe'):'';
      widthSlider.max=widthNumber.max=String(rasterWidthLimit(width,height));
      pdfLayout.label.hidden=f!=='pdf'||!pdfPages;
      compressionGroup.hidden=geometryNote.hidden=!vector;widthLabel.hidden=vector;jpegLabel.hidden=f!=='jpg';pngLabel.hidden=f!=='png';editLabel.hidden=svgoLabel.hidden=editingNote.hidden=f!=='svg';
      if(vector){
        const options=draft[f],level=vectorCompression(options),values=vectorOptions(options);
        compression.value=String(level);compressionValue.textContent=`${level} / ${MAX_VECTOR_COMPRESSION}`;
        const lossy=values.tolerance>DETAIL_LOSS_TOLERANCE;
        geometryNote.textContent=lossy?t('export.lossyCompressionHint'):t('export.compressionHint');
        compression.setAttribute('aria-valuetext',`${level} ${t('export.of')} ${MAX_VECTOR_COMPRESSION}${lossy?t('export.lossy'):level===0?t('export.originalDetail'):''}`);
        description.textContent=({maximum:t('export.originalImageQuality'),high:t('export.embeddedImagesUse288Dpi'),compact:t('export.embeddedImagesUse144Dpi')})[values.quality]+(f==='pdf'?(pdfPages&&draft.pdf.layout==='pages'?t('export.originalPagesHint'):t('export.oneLongVectorPage')):'');
        if(f==='pdf'&&pdfPages)description.textContent+=t('export.originalPageQuality');
      }else{
        const options=draft[f];options.width=rasterSize(width,height,options.width||width*(options.scale??2)).width;delete options.scale;
        widthSlider.value=widthNumber.value=String(draft[f].width);const size=rasterSize(width,height,draft[f].width);
        description.textContent=t('export.dimensions', {width:size.width, height:size.height})+(f==='png'?t('export.pngCompressionHint'):t('export.jpegQualityHint'));
      }
      description.textContent+=originalPages?t('export.gridExcludedFromPages'):gridIncluded?t('export.theGridWillBeIncluded'):!grid?.visible?t('export.gridHiddenHint'):t('export.includeGridIsTurnedOff');
      jpeg.value=String(draft.jpg.quality);value.textContent=`${draft.jpg.quality} %`;
      png.value=String(draft.png.compression);pngValue.textContent=`${draft.png.compression} / 9`;
      svgo.checked=draft.svg.svgo;editable.disabled=draft.svg.svgo;editable.checked=draft.svg.editable&&!draft.svg.svgo;
      editLabel.style.opacity=draft.svg.svgo?'.5':'';
      editingNote.textContent=draft.svg.svgo?t('export.optimizedSvgHint'):draft.svg.editable?t('export.editableSvgHint'):t('export.plainSvgHint');
    };
    includeGrid.onchange=()=>{draft.includeGrid=includeGrid.checked;sync();};
    compression.oninput=()=>{if(draft.format==='svg'||draft.format==='pdf')draft[draft.format].compression=compressionLevel(Number(compression.value));sync();};
    const setWidth=(n:number)=>{if(draft.format==='png'||draft.format==='jpg')draft[draft.format].width=rasterSize(width,height,n).width;sync();};
    widthSlider.oninput=()=>setWidth(Number(widthSlider.value));
    widthNumber.onchange=()=>setWidth(Number(widthNumber.value)||1);
    jpeg.oninput=()=>{draft.jpg.quality=Number(jpeg.value);sync();};
    png.oninput=()=>{draft.png.compression=Number(png.value);sync();};
    for(const input of [widthSlider,jpeg,png,compression])captureSlider(input,events.signal);
    editable.onchange=()=>{draft.svg.editable=editable.checked;sync();};svgo.onchange=()=>{draft.svg.svgo=svgo.checked;sync();};sync();
    const finish=(value:ExportSettings|null)=>{events.abort();dialog.close();dialog.remove();resolve(value);};
    const cancel=document.createElement('button');cancel.className='btn export-cancel';cancel.textContent=t('settings.cancel');cancel.onclick=()=>finish(null);
    const save=document.createElement('button');save.className='btn';save.textContent=svgOnly?t('settings.save'):t('file.export');save.onclick=()=>finish(draft);
    const actions=document.createElement('div');actions.className='export-actions';actions.append(cancel,save);dialog.append(actions);
    dialog.oncancel=e=>{e.preventDefault();finish(null);};
    dialog.onkeydown=e=>{if(e.code==='Enter'&&!(e.target instanceof HTMLSelectElement)&&!(e.target instanceof HTMLButtonElement)){
      e.preventDefault();
      // Enter не снимает фокус: фиксируем набранное число до сохранения черновика.
      if(e.target instanceof HTMLInputElement&&e.target.type==='number')e.target.dispatchEvent(new Event('change',{bubbles:true}));
      save.click();
    }};
    document.body.append(dialog);dialog.showModal();save.focus();
  });
}

export async function rasterExport(svg:string,width:number,height:number,targetWidth:number,format:'png'|'jpg',quality=95,signal?:AbortSignal):Promise<Uint8Array> {
  await cancellationPoint(signal);
  const size=rasterSize(width,height,targetWidth),canvas=document.createElement('canvas');
  canvas.width=size.width;canvas.height=size.height;
  // Размер декодируемого SVG тоже ограничен, а viewBox и мировая геометрия остаются прежними.
  const rasterSvg=svg.replace(/(<svg\b[^>]*\bwidth=")[^"]*(" height=")[^"]*(")/,(_match,before,middle,after)=>`${before}${size.width}${middle}${size.height}${after}`);
  const url=URL.createObjectURL(new Blob([rasterSvg],{type:'image/svg+xml'}));
  const image=new Image();
  try{
    image.src=url;await abortable(image.decode(),signal);
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error(t('export.couldNotCreateTheImage'));
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    await cancellationPoint(signal);
    const blob=await abortable(new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error(t('export.couldNotSaveTheImage'))),format==='png'?'image/png':'image/jpeg',Math.max(10,Math.min(100,quality))/100)),signal);
    return new Uint8Array(await blob.arrayBuffer());
  }finally{image.src='';URL.revokeObjectURL(url);canvas.width=canvas.height=1;}
}

export async function browserPdf(svg:string,width:number,height:number,signal?:AbortSignal):Promise<void> {
  const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;left:-100px';
  document.body.append(frame);
  const doc=frame.contentDocument!,image=doc.createElement('img');
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  image.src=url;doc.body.append(image);
  const style=doc.createElement('style');style.textContent=`@page{size:${width}px ${height}px;margin:0}html,body{margin:0;background:white}img{display:block;width:${width}px;height:${height}px}`;doc.head.append(style);
  try{await abortable(image.decode(),signal);checkCancelled(signal);frame.contentWindow!.focus();frame.contentWindow!.print();}
  finally{const clear=()=>{frame.remove();URL.revokeObjectURL(url);};if(signal?.aborted)clear();else window.setTimeout(clear,60000);}
}
