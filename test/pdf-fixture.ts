// Три разные страницы: текст/векторы/растр, поворот с обрезкой и пустая страница.
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
export async function pdfFixture():Promise<Uint8Array> {
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
  const first=doc.addPage([360,480]);
  first.drawText('VECTOR PAGE ONE',{x:32,y:440,size:20,font,color:rgb(.19,.36,.66)});
  first.drawCircle({x:100,y:330,size:30,borderWidth:3,borderColor:rgb(.19,.36,.66)});
  first.drawLine({start:{x:30,y:240},end:{x:320,y:240},thickness:3,color:rgb(.19,.36,.66)});
  const png=await doc.embedPng('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==');
  first.drawImage(png,{x:270,y:360,width:30,height:30});
  const rotated=doc.addPage([500,360]);rotated.setCropBox(40,30,420,280);rotated.setRotation(degrees(90));
  rotated.drawText('ROTATED CROP',{x:90,y:220,size:22,font,color:rgb(.19,.36,.66)});
  rotated.drawCircle({x:160,y:170,size:20,borderWidth:3,borderColor:rgb(.19,.36,.66)});
  doc.addPage([240,240]);
  return doc.save();
}
