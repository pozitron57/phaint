// Полное удаление маркера: проверка по контуру, непрерывный проход, масштаб и отражение.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStroke } from '../src/core/types.ts';
import { strokeIntersectsSweep } from '../src/core/hit.ts';
import { transformObject, rotation } from '../src/core/transform.ts';

const marker={...makeStroke(1,1,100,100,Float32Array.of(0,0,48,200,0,48),'#79ad65'),marker:true,opacity:.5};
test('маркер: касание полосы, пустой угол рамки и быстрый проход',()=>{
 assert.ok(strokeIntersectsSweep(marker,{x:200,y:124},{x:200,y:124},1));
 assert.ok(!strokeIntersectsSweep(marker,{x:200,y:130},{x:200,y:130},1));
 assert.ok(!strokeIntersectsSweep(marker,{x:79,y:79},{x:79,y:79},1));
 assert.ok(strokeIntersectsSweep(marker,{x:200,y:0},{x:200,y:200},1));
 assert.ok(strokeIntersectsSweep(marker,{x:200,y:100},{x:200,y:100},1));
});
test('маркер: пустое место внутри петли не считается попаданием',()=>{
 const ring={...makeStroke(2,1,0,0,Float32Array.of(0,0,10,100,0,10,100,100,10,0,100,10,0,0,10),'#79ad65'),marker:true};
 assert.ok(!strokeIntersectsSweep(ring,{x:50,y:50},{x:50,y:50},4));
 assert.ok(strokeIntersectsSweep(ring,{x:50,y:50},{x:50,y:150},4));
});
test('маркер: изменение ширины полосы, поворот и отражение учитываются при касании',()=>{
 const stretched=transformObject(marker,{a:-2,b:0,c:0,d:.5,e:0,f:0},true);
 assert.equal(stretched.kind,'stroke');if(stretched.kind!=='stroke')return;
 assert.ok(strokeIntersectsSweep(stretched,{x:-400,y:63},{x:-400,y:63},2));
 assert.ok(!strokeIntersectsSweep(stretched,{x:-400,y:70},{x:-400,y:70},2));
 const rotated=transformObject(marker,rotation({x:0,y:0},Math.PI/2),true);
 if(rotated.kind!=='stroke')return;
 assert.ok(strokeIntersectsSweep(rotated,{x:-124,y:200},{x:-124,y:200},1));
 assert.ok(!strokeIntersectsSweep(rotated,{x:-130,y:200},{x:-130,y:200},1));
});
