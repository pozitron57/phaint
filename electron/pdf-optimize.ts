// Убираем дробный шум Skia, сохраняя те же Float32-координаты, и повторно сжимаем потоки.
// Структуру PDF, ссылки, длины и таблицу объектов пересобирает pdf-lib; изображения не перекодируются.
import { PDFDocument, PDFRawStream, PDFName, PDFArray, decodePDFRawStream } from 'pdf-lib';
import { deflateSync } from 'node:zlib';

export function compactPdfPathStream(source:string):string {
  // Текст и встроенные бинарные изображения нельзя править поиском чисел.
  if(/[()<>]|\bBI\b/.test(source))return source;
  const counts:Record<string,number>={m:2,l:2,c:6,v:4,y:4,re:4};
  return source.replace(/^([\d+.\- \t]+)(m|l|c|v|y|re)[ \t]*$/gm,(line,operands:string,operator:string)=>{
    const tokens=operands.trim().split(/\s+/);if(tokens.length!==counts[operator])return line;
    return tokens.map(token=>{
      const value=Number(token);if(!Number.isFinite(value))return token;
      const f=Math.fround(value);
      for(let digits=1;digits<=9;digits++){
        const candidate=Number(value.toPrecision(digits));
        if(Math.fround(candidate)!==f)continue;
        // Экспоненциальная запись в PDF запрещена.
        let text=String(candidate);if(/[eE]/.test(text))text=candidate.toFixed(Math.max(0,Math.min(20,digits-1-Math.floor(Math.log10(Math.abs(candidate)||1)))));
        if(/[eE]/.test(text)||Math.fround(Number(text))!==f)return token;
        text=text.replace(/^0\./,'.').replace(/^-0\./,'-.');return text.length<token.length?text:token;
      }
      return token;
    }).join(' ')+' '+operator;
  });
}
export async function optimizePdf(bytes:Uint8Array):Promise<Uint8Array> {
  const doc=await PDFDocument.load(bytes,{updateMetadata:false}),pageStreams=new Set<unknown>();
  for(const page of doc.getPages()){
    const contents=page.node.Contents();
    if(contents instanceof PDFArray)for(const ref of contents.asArray())pageStreams.add(doc.context.lookup(ref));
    else if(contents)pageStreams.add(contents);
  }
  for(const [ref,object] of doc.context.enumerateIndirectObjects()){
    if(!(object instanceof PDFRawStream))continue;
    if(object.dict.get(PDFName.of('Subtype'))!==PDFName.of('Form')&&!pageStreams.has(object))continue;
    const raw=decodePDFRawStream(object).decode(),text=Buffer.from(raw).toString('latin1'),compact=compactPdfPathStream(text);
    const compressed=deflateSync(Buffer.from(compact,'latin1'),{level:9});
    const dict=object.dict.clone(doc.context);dict.set(PDFName.of('Filter'),PDFName.of('FlateDecode'));dict.delete(PDFName.of('DecodeParms'));
    doc.context.assign(ref,PDFRawStream.of(dict,compressed));
  }
  const result=await doc.save({useObjectStreams:true,addDefaultPage:false});
  return result.length<bytes.length?result:bytes;
}
