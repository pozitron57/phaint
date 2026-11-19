// Нулевые и отражённые синусоиды сохраняют геометрию, новые пресеты измеряются клетками.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,mergeSettings} from '../src/core/settings.ts';
import {shapeData,shapePoints,rebuildShape} from '../src/core/shapes.ts';
import {makeStroke} from '../src/core/types.ts';
import {encodeSvg,nativeSvgData} from '../src/files/codec.ts';

test('синусоида: начальные 3 и 8 клеток применяются к старому профилю один раз',()=>{
  const fresh=defaultSettings();
  assert.equal(fresh.sine.amplitude/fresh.grid.step,3);assert.equal(fresh.sine.period/fresh.grid.step,8);
  const updated=mergeSettings({version:9,grid:{step:30},sine:{amplitude:107,period:132,width:5}});
  assert.equal(updated.sine.amplitude,90);assert.equal(updated.sine.period,240);assert.equal(updated.sine.width,5);
  updated.sine.amplitude=0;updated.sine.period=180;
  assert.deepEqual(mergeSettings(updated),updated,'следующий запуск сохраняет новые ручные настройки, включая ноль');
});
test('синусоида: отражение и нулевая амплитуда сохраняются в редактируемом SVG',async()=>{
  for(const amplitude of [0,72])for(const direction of [-1,1]){
    const shape={...shapeData('sine'),amplitude,cycles:1.75,frame:{a:1,b:0,c:0,d:direction,e:0,f:0}};
    const pts=shapePoints(shape,3);
    for(let i=0;i<pts.length;i+=3)assert.ok(Math.abs(pts[i+1]+direction*amplitude*Math.sin(pts[i]/shape.period*Math.PI*2))<.0001);
    const obj=rebuildShape({...makeStroke(1,1,20,30,pts,'#315ca8'),shape});
    const data={objects:[obj],grid:{enabled:true,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
    assert.deepEqual(await nativeSvgData(await encodeSvg(data)),data);
  }
});
