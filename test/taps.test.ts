// Регрессия точек над буквами: дрожь при касании не превращается в тонкий штрих.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { widthFactor, type PenSettings } from '../src/core/brush.ts';
import { StrokeBuilder } from '../src/core/stroke-builder.ts';

const settings:PenSettings={width:3.75,color:'#315ca8',pressure:.7,curve:.7,smoothing:.3,taper:.11,speed:.61};
const identity=(x:number,y:number)=>({x,y});

test('точка: настройки пользователя и дрожь при отрыве',()=>{
  for(const dx of [0,.5,1.3,1.8,2.5,3.8]){
    const b=new StrokeBuilder(settings,identity,1,100,100);
    b.add(100,100,.09,0);b.add(100+dx,100,.15,16);b.add(100+dx,100,.15,24);
    const pts=b.finish()!;
    assert.equal(pts.length,3,`касание со смещением ${dx} px остаётся точкой`);
    assert.deepEqual(Array.from(pts),[0,0,3.75],'полная толщина, центр в месте касания');
  }
});

test('точка: долгая дрожь на месте и сильное сужение не уменьшают диаметр',()=>{
  for(const smoothing of [0,.3,1]){
    const b=new StrokeBuilder({...settings,smoothing,taper:1,speed:1},identity,1,0,0);
    b.add(0,0,.09,0);
    for(let i=1;i<=80;i++)b.add(i%2?2.5:-2.5,Math.sin(i)*.5,.12,i*8);
    assert.deepEqual(Array.from(b.finish()!),[0,0,3.75]);
  }
});

test('точка: короткий пик нажима учитывается без усреднения и сужения',()=>{
  const b=new StrokeBuilder(settings,identity,1,0,0);
  b.add(0,0,.09,0);b.add(.7,.4,1,8);b.add(.1,.1,.09,16);
  const pts=b.finish()!;
  assert.equal(pts.length,3);
  assert.ok(Math.abs(pts[2]-settings.width*widthFactor(settings,1,0))<1e-6);
  assert.ok(pts[2]>settings.width,'сильным нажимом можно увеличить точку');
});

test('точка: диаметр в единицах холста при разном масштабе и отключённом нажиме',()=>{
  for(const scale of [.25,1,4])for(const pressure of [0,.7,1]){
    const b=new StrokeBuilder({...settings,pressure},(x,y)=>({x:x/scale,y:y/scale}),scale,0,0);
    b.add(0,0,.09,0);b.add(.6,.3,.09,8);
    assert.deepEqual(Array.from(b.finish()!),[0,0,3.75]);
  }
});

test('обычный штрих: выход из области касания окончателен, даже если перо вернулось',()=>{
  for(const smoothing of [0,.3,1]){
    const b=new StrokeBuilder({...settings,smoothing},identity,1,0,0);
    b.add(0,0,.1,0);b.add(20,0,.4,16);b.add(0,0,.1,32);
    assert.ok(b.finish()!.length>3,'петля не стала точкой');
  }
  const wide=new StrokeBuilder({...settings,width:60},identity,1,0,0);
  wide.add(0,0,.2,0);wide.add(10,0,.7,16);
  assert.ok(wide.finish()!.length>3,'широкая кисть не превращает явное движение в точку');
});

test('обычный штрих: сужение концов сохраняется, предпросмотр не портит геометрию',()=>{
  const b=new StrokeBuilder({...settings,smoothing:0,pressure:0,speed:0},identity,1,0,0);
  for(let i=0;i<=100;i++){b.add(i,0,.5,i*8);b.previewPoints();b.previewLoops();}
  const pts=b.finish()!;
  assert.equal(pts[2],settings.width*.25);
  assert.equal(pts.at(-1),settings.width*.25);
  assert.equal(Math.max(...Array.from(pts).filter((_,i)=>i%3===2)),settings.width);
  assert.equal(pts.at(-3),100);
});
