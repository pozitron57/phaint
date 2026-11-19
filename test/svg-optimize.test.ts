// Реальный SVGO: выбор меньшего файла, UTF-8, контуры и независимость рабочего SVG.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {optimizeSvg} from '../src/files/svg-optimize.ts';
import {serializeSvg} from '../src/files/svg-export.ts';
import {utf8Size} from '../src/files/file-stats.ts';
import {encodeData,nativeSvgData,type DocumentData} from '../src/files/codec.ts';
import {makeStroke,makeSvg} from '../src/core/types.ts';

test('SVGO: размер сравнивается в UTF-8; увеличение, равенство и ошибка сохраняют вход',()=>{
  for(const text of ['abc','Привет','𝛾🙂','a\ud800b','\udc00','ё\ud800🙂'])assert.equal(utf8Size(text),new TextEncoder().encode(text).length);
  const grown=`<svg><text font-family='"x"'>a</text></svg>`,result=optimizeSvg(grown,3);
  assert.ok(result.processing!.after!>utf8Size(grown),'настоящий SVGO увеличивает этот SVG из-за экранирования кавычек');
  assert.equal(result.text,grown);assert.equal(result.processing!.used,false);
  assert.equal(optimizeSvg('<svg/>',3).processing!.used,false,'равный размер не заменяет оригинал');
  const broken='<svg><path></svg>',failed=optimizeSvg(broken,3);
  assert.equal(failed.text,broken);assert.equal(failed.processing!.after,null);assert.ok(failed.processing!.error);
});

test('SVGO: контуры остаются SVG, viewBox не теряется, статистика соответствует результату',()=>{
  const source='<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><g transform="translate(0 0)"><path fill="#000000" d="M 0 0 L 20 0 L 20 20 L 0 20 Z"/></g><text x="30" y="40">Проверка 🙂</text></svg>';
  const result=optimizeSvg(source,4);
  assert.ok(result.processing!.used);assert.equal(result.processing!.before,utf8Size(source));assert.equal(result.processing!.after,utf8Size(result.text));
  assert.match(result.text,/viewBox="0 0 120 80"/);assert.match(result.text,/Проверка 🙂/);assert.doesNotMatch(result.text,/<metadata/);
});
test('SVGO: защищённые кривые не упрощаются и не округляются повторно',()=>{
  const d='M.000013 .000027C.000114 .000227 .000325 .000417 .000518 .000619L.001 0Z',matrix='matrix(.00123456789 0 0 .00123456789 30.000000123 50.000000321)';
  const source=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="${matrix}"><path fill="#000000" d="${d}"/><path fill="#000000" d="M10.000012 0L11.000013 0 11.000013 1Z"/></g></svg>`;
  const result=optimizeSvg(source,0,true);
  assert.ok(result.text.includes(d)&&result.text.includes(matrix),'контрольные точки и матрица остаются точными');
  assert.ok(result.text.includes('10.000012')&&result.text.includes('11.000013'),'объединение путей тоже не округляет контуры');
  assert.ok(result.processing!.before>=new TextEncoder().encode(result.text).length);
});

test('SVGO: экспорт исключает данные Phaint, обычное сохранение и отключение SVGO возвращают их',async()=>{
  const data:DocumentData={objects:[makeStroke(1,1,10,20,Float32Array.of(0,0,2,10,5,3,20,0,1),'#315ca6'),
    makeSvg(2,2,30,40,80,50,'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><text x="10" y="20">Сила</text></svg>')],grid:{enabled:true,save:true,step:25},view:{x:0,y:0,scale:1,rotSteps:0}};
  const untouched=encodeData(data),options={quality:'maximum' as const,editable:true,svgo:true};
  const result=await serializeSvg({...data,exportOptions:options},true);
  assert.ok(result.processing);assert.doesNotMatch(result.text,/<metadata/);assert.equal(await nativeSvgData(result.text),null);
  assert.equal(encodeData(data),untouched,'экспорт не меняет объекты');
  for(const snapshot of [data,{...data,exportOptions:{...options,svgo:false}}]){
    const native=await serializeSvg(snapshot,true);assert.equal(native.processing,undefined);assert.deepEqual(await nativeSvgData(native.text),data);
  }
});
