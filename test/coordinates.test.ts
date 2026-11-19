// Система координат: отдельные пути осей, ортогональность и редактируемый SVG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrowHeads, rebuildShape, shapeData, shapePoints, strokeLoops } from '../src/core/shapes.ts';
import { makeStroke } from '../src/core/types.ts';
import { transformObject, rotation } from '../src/core/transform.ts';
import { encodeSvg, nativeSvgData } from '../src/files/codec.ts';

test('координаты: два наконечника, общий ноль, пустота между осями во всех четвертях',()=>{
  for(const length of [-240,240])for(const height of [-180,180])for(const headType of ['open','filled'] as const){
    const shape={...shapeData('coordinates'),length,height,headType,both:true};
    const o=rebuildShape({...makeStroke(1,1,40,50,shapePoints(shape,4),'#315ca8'),shape});
    assert.deepEqual([...o.pts],[0,0,4,length,0,4,0,height,4]);
    const heads=arrowHeads(o);assert.equal(heads.length,2,'у нуля нет лишних головок');
    assert.deepEqual(heads.map(h=>[h[3],h[4]]),[[length,0],[0,height]]);
    for(const loop of strokeLoops(o))for(let i=0;i<loop.length;i+=2){
      assert.ok(Number.isFinite(loop[i])&&Number.isFinite(loop[i+1]));
      assert.ok(Math.min(Math.abs(loop[i]),Math.abs(loop[i+1]))<10,'весь контур в узких полосах вдоль осей, без диагонали');
      assert.ok(loop[i]+o.ox>=o.bbox.minX&&loop[i]+o.ox<=o.bbox.maxX);
      assert.ok(loop[i+1]+o.oy>=o.bbox.minY&&loop[i+1]+o.oy<=o.bbox.maxY);
    }
  }
});

test('координаты: поворот, растяжение и отражение сохраняют угол 90° и параметры в SVG',async()=>{
  const shape={...shapeData('coordinates'),length:320,height:-200,headType:'filled' as const};
  const original=rebuildShape({...makeStroke(1,1,140,260,shapePoints(shape,5),'#79ad65'),shape,dash:{length:20,gap:15,round:true}});
  let o=transformObject(original,rotation({x:140,y:260},Math.PI/5),true);
  o=transformObject(o,{a:-2,b:0,c:0,d:.7,e:100,f:-40},true);
  assert.equal(o.kind,'stroke');if(o.kind!=='stroke')return;
  const p=o.pts,ax=p[3]-p[0],ay=p[4]-p[1],bx=p[6]-p[0],by=p[7]-p[1];
  assert.ok(Math.abs((ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by)))<1e-7);
  assert.equal(p[2],5);assert.equal(o.shape?.length,320);assert.equal(o.shape?.height,-200);
  const data={objects:[o],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
  assert.deepEqual(await nativeSvgData(await encodeSvg(data)),data);
});

test('координаты: нулевая или короткая ось не создаёт неверных координат и огромных головок',()=>{
  for(const length of [0,.01,2])for(const height of [0,-.01,-2]){
    const shape={...shapeData('coordinates'),length,height,headType:'filled' as const};
    const o=rebuildShape({...makeStroke(1,1,0,0,shapePoints(shape,8),'#315ca8'),shape});
    assert.ok(Object.values(o.bbox).every(Number.isFinite));
    for(const loop of strokeLoops(o))assert.ok(loop.every(Number.isFinite));
    for(const h of arrowHeads(o))assert.ok(Math.hypot(h[3]-(h[0]+h[6])/2,h[4]-(h[1]+h[7])/2)<=2*.65+.001);
  }
});
