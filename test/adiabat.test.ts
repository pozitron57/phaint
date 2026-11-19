// Адиабата: pV^γ постоянно, точные дроби, неподвижные концы и обмен через SVG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GAMMA, shapeData, shapePoints, rebuildShape } from '../src/core/shapes.ts';
import { makeStroke } from '../src/core/types.ts';
import { transformObject } from '../src/core/transform.ts';
import { mergeSettings } from '../src/core/settings.ts';
import { decodeData, encodeData, encodeSvg, nativeSvgData } from '../src/files/codec.ts';

test('адиабата: уравнение pV^γ, монотонность, γ=1 совпадает с гиперболой',()=>{
  assert.equal(shapeData('adiabat').gamma,5/3);
  for(const gamma of [1,7/5,5/3,2.37,3])for(const length of [0,60,420]){
    const p=shapePoints({...shapeData('adiabat'),gamma,length},4);
    assert.deepEqual([...p.slice(0,3)],[0,0,4]);
    assert.deepEqual([...p.slice(-3)],[length,length,4]);
    assert.ok(p.every(Number.isFinite));
    if(!length)continue;
    for(let i=0;i<p.length;i+=3){
      // Переходим из рамки рисунка в координаты p,V исходного уравнения.
      const volume=.25+3.75*p[i]/length;
      const pressure=4**gamma-(4**gamma-4**(-gamma))*p[i+1]/length;
      assert.ok(Math.abs(pressure*volume**gamma-1)<.001,'pV^γ постоянно вдоль всей ветви');
      if(i)assert.ok(p[i]>p[i-3]&&p[i+1]>p[i-2],'ветвь без петель и обратного хода');
    }
  }
  assert.deepEqual(shapePoints({...shapeData('adiabat'),gamma:1,length:300},4),shapePoints({...shapeData('hyperbola'),length:300},4));
});

test('адиабата: γ меняет изгиб без сдвига концов после отражения и поворота; SVG сохраняет γ',async()=>{
  const shape={...shapeData('adiabat'),length:300,height:300};
  const o=rebuildShape({...makeStroke(1,1,100,120,shapePoints(shape,4),'#315ca8'),shape,dash:{length:16,gap:12,round:true}});
  const transformed=transformObject(o,{a:-1.7,b:.4,c:.2,d:1.2,e:450,f:30},true);
  assert.equal(transformed.kind,'stroke');if(transformed.kind!=='stroke')return;
  const changed=rebuildShape(transformed,{...transformed.shape!,gamma:7/5});
  assert.deepEqual([...changed.pts.slice(0,3)],[...transformed.pts.slice(0,3)]);
  assert.deepEqual([...changed.pts.slice(-3)],[...transformed.pts.slice(-3)]);
  assert.notDeepEqual(changed.pts,transformed.pts);assert.equal(changed.pts[2],4);
  for(const obj of [transformed,changed]){
    const data={objects:[obj],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
    const restored=await nativeSvgData(await encodeSvg(data));
    assert.deepEqual(restored,data);
  }
});

test('адиабата: старые настройки получают 5/3, неверные показатели не попадают в геометрию',()=>{
  const old=mergeSettings({version:8,hyperbola:{width:7,color:'#000000'},input:{predict:true}});
  assert.equal(old.hyperbola.gamma,DEFAULT_GAMMA);assert.equal(old.hyperbola.width,7);assert.equal(old.input.predict,true);
  assert.equal(mergeSettings({hyperbola:{gamma:NaN}}).hyperbola.gamma,DEFAULT_GAMMA);
  assert.equal(mergeSettings({hyperbola:{gamma:0}}).hyperbola.gamma,1);
  assert.equal(mergeSettings({hyperbola:{gamma:100}}).hyperbola.gamma,3);
  assert.equal(mergeSettings({hyperbola:{gamma:7/5}}).hyperbola.gamma,7/5);
  const shape=shapeData('adiabat'),o=rebuildShape({...makeStroke(1,1,0,0,shapePoints(shape,4),'#315ca8'),shape});
  const data={objects:[o],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
  for(const gamma of [undefined,null,0,-1,3.1,'5/3']){
    const raw=JSON.parse(encodeData(data));raw.objects[0].shape.gamma=gamma;
    assert.throws(()=>decodeData(JSON.stringify(raw)));
  }
});
