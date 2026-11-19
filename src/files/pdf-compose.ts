// Исходные PDF-потоки не переписываются: поверх страниц добавляется прозрачная
// векторная форма. В длинном листе оригиналы вложены как PDF-формы, без растеризации.
import { PDFDocument, PDFDict, PDFRawStream, PDFName, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState, setGraphicsState, rgb, type PDFPage, type PDFEmbeddedPage } from 'pdf-lib';
import { matInvert, matMul, type Mat } from '../core/geom.ts';
import type { PdfExportRequest, PdfLayer } from './pdf-types.ts';
import { fromBase64 } from './binary.ts';

export interface PdfComposition { request:PdfExportRequest; overlays:Array<Uint8Array|null> }
function drawForm(page:PDFPage,form:PDFEmbeddedPage,m:Mat,multiply=false):void {
  const name=page.node.newXObject('Phaint',form.ref);
  const blend=multiply?[setGraphicsState(page.node.newExtGState('Marker',page.doc.context.obj({Type:'ExtGState',BM:'Multiply'})))]:[];
  page.pushOperators(pushGraphicsState(),...blend,concatTransformationMatrix(m.a,m.b,m.c,m.d,m.e,m.f),drawObject(name),popGraphicsState());
}
const identity: [number,number,number,number,number,number]=[1,0,0,1,0,0];
/** Chromium печатает SVG изолированно: режим маркера переносим на фон исходного PDF.
 * Отдельная копия страницы не даёт изменить общие ресурсы обычного пера. */
function multiplyStates(doc:PDFDocument):void {
  const seen=new Set<PDFDict>();
  const visit=(dict:PDFDict):void=>{
    if(seen.has(dict))return;seen.add(dict);
    const states=dict.lookupMaybe(PDFName.of('ExtGState'),PDFDict);
    if(states)for(const key of states.keys())states.lookup(key,PDFDict).set(PDFName.of('BM'),PDFName.of('Multiply'));
    for(const [,value] of dict.entries())if(value instanceof PDFDict)visit(value);
  };
  for(const [,object] of doc.context.enumerateIndirectObjects()){
    if(object instanceof PDFDict)visit(object);else if(object instanceof PDFRawStream)visit(object.dict);
  }
}
async function embedOverlays(doc:PDFDocument,bytes:Uint8Array|null|undefined,layers?:PdfLayer[]):Promise<Array<{form:PDFEmbeddedPage;multiply:boolean}>> {
  if(!bytes)return [];
  const overlay=await PDFDocument.load(bytes);
  if(layers&&overlay.getPageCount()!==layers.length)throw new Error('Не удалось напечатать все слои пометок PDF.');
  const result:Array<{form:PDFEmbeddedPage;multiply:boolean}>=[];
  for(let i=0;i<overlay.getPageCount();i++){
    const multiply=layers?.[i]?.multiply===true;
    let page=overlay.getPage(i);
    if(multiply){const isolated=await PDFDocument.create();[page]=await isolated.copyPages(overlay,[i]);isolated.addPage(page);multiplyStates(isolated);}
    result.push({form:await doc.embedPage(page),multiply});
  }
  return result;
}
export async function composePdf({request:r,overlays}:PdfComposition):Promise<Uint8Array> {
  const source=await PDFDocument.load(fromBase64(r.source.data));
  if(r.layout==='pages'){
    // Работаем с копией байтов в памяти: формы, ссылки и прочие данные оригинала
    // остаются в документе; исходный файл никогда не перезаписывается экспортом.
    for(let i=0;i<r.pages.length;i++){
      const placement=r.pages[i],bytes=overlays[i];if(!bytes)continue;
      const page=source.getPage(placement.page.index);
      for(const {form,multiply} of await embedOverlays(source,bytes,placement.layers)){
        const local:Mat={a:placement.width/form.width,b:0,c:0,d:-placement.height/form.height,e:0,f:placement.height};
        drawForm(page,form,matMul(matInvert(placement.page.transform),local),multiply);
      }
    }
    return source.save({useObjectStreams:true});
  }
  const doc=await PDFDocument.create();doc.setTitle(r.source.name.replace(/\.pdf$/i,''));doc.setCreator('Phaint');
  const factor=Math.min(1,14400/Math.max(r.bounds.width,r.bounds.height));
  const forms=await embedOverlays(doc,overlays[0],r.layers),first=forms[0]?.form;
  const width=first?.width??r.bounds.width*factor*.75,height=first?.height??r.bounds.height*factor*.75;
  const page=doc.addPage([width,height]);
  const sx=width/r.bounds.width,sy=height/r.bounds.height;
  const world:Mat={a:sx,b:0,c:0,d:-sy,e:-r.bounds.x*sx,f:(r.bounds.y+r.bounds.height)*sy};
  if(r.grid){
    const step=r.grid.step,color=rgb(201/255,213/255,230/255),thickness=.5*Math.min(sx,sy);
    const count=(r.bounds.width+r.bounds.height)/step;
    if(count>200000)throw new Error('Слишком много линий сетки для PDF. Увеличьте шаг сетки.');
    for(let x=Math.ceil(r.bounds.x/step)*step;x<=r.bounds.x+r.bounds.width;x+=step){const px=(x-r.bounds.x)*sx;page.drawLine({start:{x:px,y:0},end:{x:px,y:height},thickness,color});}
    for(let y=Math.ceil(r.bounds.y/step)*step;y<=r.bounds.y+r.bounds.height;y+=step){const py=(r.bounds.y+r.bounds.height-y)*sy;page.drawLine({start:{x:0,y:py},end:{x:width,y:py},thickness,color});}
    page.drawRectangle({x:0,y:0,width,height,borderColor:rgb(158/255,175/255,201/255),borderWidth:1.5*Math.min(sx,sy)});
  }
  for(const placement of r.pages){
    const original=source.getPage(placement.page.index),crop=original.getCropBox();
    page.drawRectangle({x:(placement.x-r.bounds.x)*sx,y:(r.bounds.y+r.bounds.height-placement.y-placement.height)*sy,width:placement.width*sx,height:placement.height*sy,color:rgb(1,1,1)});
    if(!original.node.Contents())continue;
    const embedded=await doc.embedPage(original,{left:crop.x,bottom:crop.y,right:crop.x+crop.width,top:crop.y+crop.height},identity);
    const position:Mat={a:1,b:0,c:0,d:1,e:placement.x,f:placement.y};
    drawForm(page,embedded,matMul(world,matMul(position,placement.page.transform)));
  }
  for(const {form,multiply} of forms)drawForm(page,form,{a:1,b:0,c:0,d:1,e:0,f:0},multiply);
  return doc.save({useObjectStreams:true});
}
