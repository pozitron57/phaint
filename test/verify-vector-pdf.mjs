// Проверяем все объекты, включая изображения внутри Pattern: один get_images их пропускает.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument,PDFName,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
export async function verifyVectorPdf(path){
 const doc=await PDFDocument.load(await readFile(path));assert.equal(doc.getPageCount(),1);
 let paths=0;
 for(const [,object] of doc.context.enumerateIndirectObjects()){
  if(!(object instanceof PDFRawStream))continue;
  assert.notEqual(object.dict.get(PDFName.of('Subtype')),PDFName.of('Image'),'сетка и линии не должны превращаться в картинки');
  assert.notEqual(object.dict.get(PDFName.of('Type')),PDFName.of('Pattern'),'сетка PDF записана явными линиями');
  const text=Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');paths+=(text.match(/\bm\b/g)||[]).length;
 }
 assert.ok(paths>20,'есть пути рисунка и сетки');
}
