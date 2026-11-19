// Предел ошибки контура, сохранение отверстий/данных и защита от роста экспортной записи.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discLoop} from '../src/core/outline.ts';
import {compactContours} from '../src/files/contour-export.ts';
import {loopsToSvg,encodeSvg,nativeSvgData} from '../src/files/codec.ts';
import {makeStroke} from '../src/core/types.ts';
import {gridSvg} from '../src/files/grid-svg.ts';
import {compactPdfPathStream} from '../electron/pdf-optimize.ts';
test('перекрывающиеся диски одного штриха объединяются, данные пера остаются точными',async()=>{
  const loops=Array.from({length:80},(_,i)=>discLoop(Math.cos(i*.9)*2,Math.sin(i*.9)*2,3));
  assert.ok(compactContours(loops,.04,2,loopsToSvg).length<loopsToSvg(loops,2).length/8);
  const o=makeStroke(1,1,20,30,Float32Array.from(Array.from({length:60},(_,i)=>[Math.cos(i)*2,Math.sin(i)*2,4]).flat()),'#315ca8');
  const data={objects:[o],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
  const original=await encodeSvg(data),compact=await encodeSvg({...data,exportOptions:{quality:'high',editable:true}},true,2);
  assert.ok(compact.length<original.length/3);assert.deepEqual(await nativeSvgData(compact),data);
  assert.equal(await encodeSvg(data),original,'экспорт не изменяет исходник');
});
test('сетка: SVG сохраняет шаблон, PDF получает пути с фазой сетки в отрицательных координатах',()=>{
  const b={minX:-35,minY:-20,maxX:55,maxY:40};
  assert.match(gridSvg(b,24,'test'),/<pattern/);
  const paths=gridSvg(b,24,'test',true);assert.doesNotMatch(paths,/<pattern|<image/);assert.match(paths,/M-24 -20V40/);assert.match(paths,/M-35 24H55/);
  assert.throws(()=>gridSvg({...b,maxX:1e12},1,'test',true));
});
test('PDF: удаляется только числовой шум путей, Float32-значения неизменны',()=>{
  const source='q\n100.099998 20.2000008 m\n10.333333 20.6666667 40.1199989 50 60.2999992 70 c\nS\nQ\n';
  const out=compactPdfPathStream(source);assert.ok(out.length<source.length);
  const numbers=(s:string)=>s.match(/[-+]?(?:\d*\.\d+|\d+)/g)!.map(n=>Math.fround(Number(n)));
  assert.deepEqual(numbers(out),numbers(source));
  const text='BT (100.099998 20.2 m) Tj ET';assert.equal(compactPdfPathStream(text),text);
  assert.equal(compactPdfPathStream('BI 100.099998 20.2 m EI'),'BI 100.099998 20.2 m EI');
  for(const path of ['100000000000000000000000 20 m','0.000000000000000000000000000001 20 m']){
    const compact=compactPdfPathStream(path);assert.doesNotMatch(compact,/[eE]/);assert.deepEqual(numbers(compact),numbers(path));
  }
});
