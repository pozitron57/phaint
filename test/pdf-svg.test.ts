import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfFixture } from './pdf-fixture.ts';
import { base64 } from '../src/files/binary.ts';
import { pdfVectorPages } from '../src/files/pdf-svg.ts';
import { encodeData, encodeSvg, nativeSvgData, type DocumentData } from '../src/files/codec.ts';
import { serializeSvg } from '../src/files/svg-export.ts';
import { makeImage, makeSvg, isLocked, isPdfPage } from '../src/core/types.ts';
import { compactPdfSvg } from '../src/files/svg-optimize.ts';

async function fixture():Promise<DocumentData> {
  const blank='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
  return {pdf:{name:'исходник.pdf',data:base64(await pdfFixture())},grid:{enabled:false,save:true,step:24},view:{scale:1,rotSteps:0,x:0,y:0},objects:[
    {...makeImage(1,1,0,0,480,640,blank),pdfPage:{index:0,transform:{a:4/3,b:0,c:0,d:-4/3,e:0,f:640}}},
    {...makeImage(2,2,0,688,1120/3,560,blank),pdfPage:{index:1,transform:{a:0,b:4/3,c:4/3,d:0,e:-40,f:-160/3}}},
    {...makeImage(3,3,0,1296,320,320,blank),pdfPage:{index:2,transform:{a:4/3,b:0,c:0,d:-4/3,e:0,f:320}}},
    makeSvg(4,4,700,0,20,20,'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path id="pdf-1-0" d="M0 0H20V20Z"/></svg>'),
  ]};
}

test('PDF → SVG: векторы, переиспользуемые буквы, независимые id страниц и единственный исходный растр',async()=>{
  const data=await fixture(),before=encodeData(data),vectors=pdfVectorPages(data),pages=vectors.objects.filter(isPdfPage);
  assert.equal(encodeData(data),before,'преобразование не меняет исходный документ');
  assert.ok(pages.every(p=>p.kind==='svg'&&isLocked(p)));
  assert.match(pages[0].source,/<use\b/);assert.match(pages[0].source,/<path\b/);assert.doesNotMatch(pages[0].source,/<text\b/);
  assert.match(pages[1].source,/viewBox="0 0 280 420"/,'поворот и CropBox учтены');
  const svg=await encodeSvg(vectors,false),ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'нет конфликтов букв и масок между страницами и вставленным SVG');
  for(const [,id] of svg.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(id),`ссылка ${id} разрешается`);
  assert.equal((svg.match(/<image\b/g)||[]).length,1,'только встроенный в PDF PNG, никаких растров страниц');
  assert.ok(pages.every(p=>p.source.includes('<rect width="100%" height="100%" fill="#fff"/>')),'белая бумага и у пустой страницы');
  assert.equal(pdfVectorPages(vectors),vectors,'готовые SVG не конвертируются повторно');
});

test('SVG-сохранение обновляет старые PDF-подложки, возвращает закрепление и уважает внешние правки',async()=>{
  const data=await fixture(),saved=await serializeSvg(data,true),restored=await nativeSvgData(saved.text);
  assert.ok(restored);assert.deepEqual(restored.pdf,data.pdf);
  assert.ok(restored.objects.filter(isPdfPage).every(p=>p.kind==='svg'&&isLocked(p)));
  assert.equal(JSON.parse(encodeData(restored)).version,6);
  assert.equal(await nativeSvgData(saved.text.replace('<rect width="100%"','<rect opacity=".5" width="100%"')),null,'внешняя правка приоритетнее metadata');
  const plain=await serializeSvg({...data,exportOptions:{quality:'maximum',editable:false}},true);
  assert.doesNotMatch(plain.text,/<metadata/);assert.match(plain.text,/<use\b/);
  const compact=await serializeSvg({...data,exportOptions:{quality:'high',editable:false,svgo:true}},true);
  assert.doesNotMatch(compact.text,/<metadata/);assert.equal((compact.text.match(/<image\b/g)||[]).length,1);
});

test('малые координаты PDF не склеиваются с предыдущим числом при сжатии SVG',()=>{
  const d='M-8.15 -20.45C-8.116666 -20.550002 -8.066666 -20.65 -7.9999997 -20.75 -7.9333336 -20.85 -7.9 -20.9 -7.8999998 -20.9 -7.899999 -20.9 -7.8833324 -20.916666 -7.8499996 -20.949999';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`;
  const out=compactPdfSvg(svg),path=/ d="([^"]+)"/.exec(out)![1];
  const tokens=path.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[a-df-z]/gi)!;
  let x=0,y=0;const curves:number[][]=[];
  for(let i=0;i<tokens.length;){
    const command=tokens[i++],args:number[]=[];while(i<tokens.length&&!/^[a-z]$/i.test(tokens[i]))args.push(Number(tokens[i++]));
    const n=/m/i.test(command)?2:6;assert.equal(args.length%n,0,'каждая команда содержит полные наборы координат');
    for(let j=0;j<args.length;j+=n){const values=args.slice(j,j+n).map((v,k)=>v+(command===command.toLowerCase()?(k%2?y:x):0));x=values[n-2];y=values[n-1];if(n===6)curves.push(values);}
  }
  assert.equal(curves.length,3);assert.ok(Math.abs(x+7.8499996)<1e-10&&Math.abs(y+20.949999)<1e-10);
});
