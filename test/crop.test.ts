// Область — пересечение рисунка с рамкой, а не только список выбранных целых объектов.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxPolygon, insideClip, intersectClip, polygonArea } from '../src/core/clip.ts';
import { cropDocument } from '../src/files/crop.ts';
import { decodeData, encodeData, encodeSvg, nativeSvgData, type DocumentData } from '../src/files/codec.ts';
import { makeStroke, makeImage, makeSvg, type Obj } from '../src/core/types.ts';
import { matApply, type Pt } from '../src/core/geom.ts';
import { rotation, transformObject, objectMatrix } from '../src/core/transform.ts';
import { defaultSettings, mergeSettings } from '../src/core/settings.ts';
import { gridSnap } from '../src/core/snap.ts';

const area={corners:boxPolygon({minX:20,minY:20,maxX:80,maxY:80})};
const data=(objects:Obj[]):DocumentData=>({objects,grid:{enabled:true,step:24,save:true},view:{x:50,y:50,scale:1,rotSteps:0}});
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6foAAAAASUVORK5CYII=';
const ink=()=>makeStroke(1,1,0,0,Float32Array.of(0,50,5,100,50,5),'#315ca8');
const close=(a:Pt,b:Pt)=>{assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-7,`${JSON.stringify(a)} ≈ ${JSON.stringify(b)}`);};

test('сетка: новый и старый профиль включают привязку; Alt обращает оба режима',()=>{
  assert.equal(defaultSettings().snapToGrid,true);assert.equal(mergeSettings({version:8}).snapToGrid,true);
  assert.equal(mergeSettings({snapToGrid:false}).snapToGrid,false);
  for(const mode of [true,false]){assert.equal(gridSnap(mode,false),mode);assert.equal(gridSnap(mode,true),!mode);}
});
test('обрезка: пересекающий штрих и картинка остаются объектами, внешний объект исключается',async()=>{
  const outside=makeStroke(4,4,1000,0,ink().pts,'#000');
  const image=makeImage(2,2,40,40,80,70,png),svg=makeSvg(3,3,-10,20,40,100,'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="100"><rect width="40" height="100"/></svg>');
  const original=data([ink(),image,svg,outside]),cropped=cropDocument(original,area);
  assert.equal(cropped.objects.length,3);assert.ok(cropped.objects.every(o=>o.clip?.length===4));
  assert.equal(original.objects.length,4);assert.equal(original.objects[0].clip,undefined);
  assert.equal(cropped.objects[0].kind,'stroke');assert.equal((cropped.objects[0] as ReturnType<typeof ink>).pts,original.objects[0].kind==='stroke'?original.objects[0].pts:null);
  assert.deepEqual(cropped.objects[1].bbox,{minX:40,minY:40,maxX:80,maxY:80});
  const {exportArea,...saved}=cropped;
  assert.deepEqual(decodeData(encodeData(cropped)),saved);
  const encoded=await encodeSvg(cropped);assert.match(encoded,/viewBox="0 0 60 60"/);assert.match(encoded,/<clipPath/);
  assert.deepEqual(await nativeSvgData(encoded),saved);
  assert.equal(JSON.parse(encodeData(cropped)).version,3,'старые версии должны читать видимый SVG, а не игнорировать clip');
});
test('обрезка повёрнутого вида: каждый угол становится углом экспортированного прямоугольника',()=>{
  const m=rotation({x:50,y:50},Math.PI/8),corners=area.corners.map(p=>matApply(m,p.x,p.y));
  const result=cropDocument(data([ink()]),{corners}),page=result.exportArea!;
  corners.forEach((p,i)=>close(matApply(page.matrix,p.x,p.y),[{x:0,y:0},{x:60,y:0},{x:60,y:60},{x:0,y:60}][i]));
  assert.ok(result.objects[0].clip);
});
test('локальная обрезка следует за переносом, отражением и поворотом штриха и картинки',()=>{
  const objects=cropDocument(data([ink(),makeImage(2,2,0,0,100,100,png)]),area).objects;
  const m={a:0,b:-2,c:-3,d:0,e:40,f:20};
  for(const o of objects){
    const moved=transformObject(o,m,true),before=objectMatrix(o),after=objectMatrix(moved);
    o.clip!.forEach((p,i)=>{const q=matApply(before,p.x,p.y),r=moved.clip![i];close(matApply(m,q.x,q.y),matApply(after,r.x,r.y));});
    assert.ok(moved.bbox.minX>=-200&&moved.bbox.maxX<=-20&&moved.bbox.minY>=-140&&moved.bbox.maxY<=-20);
  }
});
test('повторная обрезка пересекает прежнюю область, не возвращая скрытые части',()=>{
  const first=cropDocument(data([ink()]),area);
  const second=cropDocument(first,{corners:boxPolygon({minX:10,minY:40,maxX:50,maxY:60})});
  assert.ok(second.objects[0].clip!.every(p=>insideClip(area.corners,p)));
  assert.equal(second.objects[0].bbox.minX,20);assert.equal(second.objects[0].bbox.maxX,50);
  const wrong=JSON.parse(encodeData(second));wrong.objects[0].clip=[{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}];
  assert.throws(()=>decodeData(JSON.stringify(wrong)),/обрезки/);
  assert.equal(intersectClip(area.corners,boxPolygon({minX:90,minY:90,maxX:100,maxY:100})).length,0);
  assert.equal(polygonArea(area.corners.map(p=>({x:p.x+1e10,y:p.y+1e10}))),3600);
});
test('сетка SVG: компактный шаблон, только при двух включённых флажках',async()=>{
  const svg=await encodeSvg(data([ink()]));assert.match(svg,/data-phaint-grid="true"/);assert.match(svg,/<pattern/);
  for(const grid of [{enabled:false,save:true,step:24},{enabled:true,save:false,step:24}])assert.doesNotMatch(await encodeSvg({...data([ink()]),grid}),/data-phaint-grid/);
});
