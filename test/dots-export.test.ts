// Отдельные точки не зависят от отсчётов пера; экспорт сохраняет геометрию без служебных данных.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashedPoints, inkDash, shapeData, shapePoints, strokeLoops, rebuildShape } from '../src/core/shapes.ts';
import { makeStroke } from '../src/core/types.ts';
import { encodeSvg, nativeSvgData } from '../src/files/codec.ts';
import { rasterSize } from '../src/files/export.ts';
import { mergeSettings } from '../src/core/settings.ts';

test('точки: шаг по длине, непрерывная фаза и нажим на стыке отсчётов',()=>{
  const style={length:2,gap:10,round:true,dots:true};
  const sparse=dashedPoints(Float32Array.of(0,0,2,30,0,8),style);
  const dense=dashedPoints(Float32Array.of(0,0,2,10,0,4,20,0,6,30,0,8),style);
  assert.deepEqual(sparse,dense);assert.deepEqual(dense.map(p=>[...p]),[[0,0,2],[10,0,4],[20,0,6],[30,0,8]]);
  assert.deepEqual(dashedPoints(Float32Array.of(0,0,2,10,0,2,10,20,2),style).map(p=>[...p]),[[0,0,2],[10,0,2],[10,10,2],[10,20,2]]);
  assert.deepEqual(dashedPoints(Float32Array.of(0,0,2,20,0,2),{...style,offset:5}).map(p=>p[0]),[5,15]);
});
test('точки: круги, редактируемый SVG и отдельные настройки штрихов',async()=>{
  const settings=mergeSettings({}),ink=settings.arrow;
  const original={length:ink.dashLength*4,gap:ink.dashGap*4,round:ink.round};
  ink.dashed=true;assert.deepEqual(inkDash(ink,4),original);ink.dotted=true;
  const dash=inkDash(ink,4)!,shape={...shapeData('line'),length:48};
  const o=rebuildShape({...makeStroke(1,1,20,30,shapePoints(shape,4),'#315ca8'),shape,dash});
  const loops=strokeLoops(o);assert.equal(loops.length,5);
  for(let i=0;i<loops.length;i++){
    // B-сплайн идёт через середины рёбер; небольшой запас радиуса компенсирует сглаживание.
    const pts=loops[i];for(let j=0;j<pts.length;j+=2){const k=(j+2)%pts.length;assert.ok(Math.abs(Math.hypot((pts[j]+pts[k])/2-i*12,(pts[j+1]+pts[k+1])/2)-2)<.002);}
  }
  const data={objects:[o],grid:{enabled:true,step:24,save:true},view:{x:0,y:0,scale:1,rotSteps:0}};
  const svg=await encodeSvg(data);assert.deepEqual(await nativeSvgData(svg),data);
  const visual=await encodeSvg(data,false);assert.doesNotMatch(visual,/<metadata/);assert.match(visual,/<pattern/);
  assert.equal(visual,svg.replace(/<metadata[^>]*>[\s\S]*?<\/metadata>\n/,''));
  ink.dotted=false;assert.deepEqual(inkDash(ink,4),original);
});
test('растровый экспорт: разрешение без лишней нагрузки на память',()=>{
  assert.deepEqual(rasterSize(1000,800,2000),{width:2000,height:1600});
  assert.deepEqual(rasterSize(1000,800,1333),{width:1333,height:1066});
  for(const [w,h] of [[1e6,1e6],[1e7,20],[5000,5000],[.5,.5]]){
    const size=rasterSize(w,h,12000);assert.ok(size.width>=1&&size.height>=1&&size.width<=12000&&size.height<=12000&&size.width*size.height<=24000000);
  }
});
