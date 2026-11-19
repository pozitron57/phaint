import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFRawStream, PDFName, decodePDFRawStream, rgb } from 'pdf-lib';
import { pdfFixture } from './pdf-fixture.ts';
import { base64 } from '../src/files/binary.ts';
import { composePdf } from '../src/files/pdf-compose.ts';
import type { PdfExportRequest } from '../src/files/pdf-types.ts';
import { makeImage, makeStroke, type ImageObj } from '../src/core/types.ts';
import { encodeSvg, nativeSvgData, exportSize, encodeData, decodeData } from '../src/files/codec.ts';
import { exportName, workingName, preferredExport } from '../src/files/names.ts';
import { defaultSettings, mergeSettings } from '../src/core/settings.ts';

test('имена экспорта и рабочей копии: p.svg, изображения, PDF и защита исходного имени',()=>{
  assert.equal(exportName('1889p.svg','svg'),'1889.svg');assert.equal(exportName('1889p.svg','png'),'1889.png');
  assert.equal(preferredExport('1889p.svg','jpg'),'svg');assert.equal(exportName('1889.pdf','pdf'),'1889 — пометки.pdf');
  assert.equal(workingName('задача.png'),'задачаp.svg');assert.equal(workingName('задача.pdf'),'задачаp.svg');
  assert.equal(exportName('1889p.svg','svg',true),'1889-part.svg');
  assert.equal(exportName('file.svg','svg',true),'file-part.svg');
  assert.equal(exportName('file.pdf','png',true),'file-part.png');
});
test('новый рисунок: местная дата в имени, ведущие нули и смена дня без перезапуска',context=>{
  context.mock.timers.enable({apis:['Date'],now:new Date(2026,0,2,0,5).getTime()});
  assert.equal(workingName(),'2026-01-02.svg');
  for(const format of ['svg','pdf','png','jpg'] as const){
    assert.equal(exportName(undefined,format),`2026-01-02.${format}`);
    assert.equal(exportName(undefined,format,true),`2026-01-02-part.${format}`);
  }
  context.mock.timers.setTime(new Date(2026,11,31,23,59).getTime());
  assert.equal(workingName(),'2026-12-31.svg');
  context.mock.timers.tick(120000);
  assert.equal(workingName(),'2027-01-01.svg');
  assert.equal(exportName(undefined,'pdf'),'2027-01-01.pdf');
  assert.equal(workingName('2026-11-18.svg'),'2026-11-18.svg');
  assert.equal(exportName('2026-11-18.svg','pdf'),'2026-11-18.pdf');
});
test('сетка по умолчанию и целые клетки в положительных/отрицательных координатах',async()=>{
  assert.equal(defaultSettings().grid.save,true);assert.equal(mergeSettings({version:8,grid:{save:false}}).grid.save,true);
  assert.equal(mergeSettings({version:9,grid:{save:false}}).grid.save,false);
  const data={objects:[makeStroke(1,1,-22,-67,new Float32Array([0,0,4,219,131,4]),'#315ca8')],grid:{enabled:true,save:true,step:24},view:{scale:1,rotSteps:0,x:0,y:0}};
  const size=exportSize(data);for(const value of Object.values(size))assert.equal(value%24===0,true);
  const svg=await encodeSvg(data);assert.match(svg,/stroke="#9eafc9" stroke-width="1.5"/);assert.match(svg,/<pattern/);
  assert.ok(size.x<data.objects[0].bbox.minX&&size.y<data.objects[0].bbox.minY);
});
test('рабочий SVG хранит исходный PDF один раз, страницы и данные пера восстанавливаются',async()=>{
  const bytes=await pdfFixture(),source={data:base64(bytes),name:'источник.pdf'};
  const image:ImageObj={...makeImage(1,1,0,0,480,640,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='),pdfPage:{index:0,transform:{a:4/3,b:0,c:0,d:-4/3,e:0,f:640}}};
  const data={objects:[image,makeStroke(2,2,40,40,new Float32Array([0,0,4,100,30,2]),'#c9514e')],pdf:source,grid:{enabled:true,step:24,save:true},view:{scale:1,rotSteps:0,x:200,y:300}};
  const svg=await encodeSvg(data),restored=await nativeSvgData(svg);assert.ok(restored);
  assert.deepEqual(restored.pdf,source);assert.deepEqual((restored.objects[0] as ImageObj).pdfPage,image.pdfPage);
  assert.equal(svg.split(source.data).length,2);assert.deepEqual(restored.objects[1],data.objects[1]);
  const prefix={...data,pdf:{...source,data:base64(new Uint8Array([10,32,...bytes]))}};
  assert.equal(decodeData(encodeData(prefix)).pdf!.data,prefix.pdf.data,'PDF с пробелами перед заголовком восстанавливается');
});
test('PDF-композиция сохраняет исходные потоки/поворот/обрезку, длинный лист содержит формы',async()=>{
  const bytes=await pdfFixture(),source=await PDFDocument.load(bytes),request:PdfExportRequest={source:{name:'источник.pdf',data:base64(bytes)},layout:'pages',bounds:{x:-24,y:-24,width:528,height:1728},grid:{step:24},pages:[
    {page:{index:0,transform:{a:4/3,b:0,c:0,d:-4/3,e:0,f:640}},x:0,y:0,width:480,height:640},
    {page:{index:1,transform:{a:0,b:4/3,c:4/3,d:0,e:-40,f:-160/3}},x:0,y:688,width:1120/3,height:560},
    {page:{index:2,transform:{a:4/3,b:0,c:0,d:-4/3,e:0,f:320}},x:0,y:1296,width:320,height:320},
  ]};
  const overlay=await PDFDocument.create(),p=overlay.addPage([360,480]);p.drawLine({start:{x:20,y:300},end:{x:200,y:300},thickness:3,color:rgb(.79,.32,.31)});
  const marks=await overlay.save(),result=await PDFDocument.load(await composePdf({request,overlays:[marks,marks,null]}));
  assert.equal(result.getPageCount(),3);assert.deepEqual(result.getPage(1).getCropBox(),source.getPage(1).getCropBox());assert.equal(result.getPage(1).getRotation().angle,90);
  const originalStreams=source.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDFRawStream);
  for(const [ref,o] of originalStreams){const saved=result.context.lookup(ref);assert.ok(saved instanceof PDFRawStream);assert.deepEqual(saved.contents,(o as PDFRawStream).contents,'исходный поток не изменён');}
  const sheet=await PDFDocument.load(await composePdf({request:{...request,layout:'sheet'},overlays:[null]}));assert.equal(sheet.getPageCount(),1);
  let forms=0,images=0,lines=0;for(const [,o] of sheet.context.enumerateIndirectObjects())if(o instanceof PDFRawStream){
    if(o.dict.get(PDFName.of('Subtype'))===PDFName.of('Form'))forms++;
    if(o.dict.get(PDFName.of('Subtype'))===PDFName.of('Image'))images++;
    else lines+=(Buffer.from(decodePDFRawStream(o).decode()).toString().match(/\bl\b/g)||[]).length;
  }
  assert.equal(forms,2,'две непустые страницы вложены как векторные формы');assert.equal(images,1,'только исходный PNG');assert.ok(lines>70,'сетка длинного листа векторная');
});
