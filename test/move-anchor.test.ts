// Перенос привязывает геометрию под пером в мировых координатах холста.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeData, rebuildShape, type ShapeKind } from '../src/core/shapes.ts';
import { rotation, transformObject } from '../src/core/transform.ts';
import { makeImage, makeStroke } from '../src/core/types.ts';
import { selectionMoveAnchor } from '../src/view/move-anchor.ts';

const shape=(kind:ShapeKind)=>rebuildShape(makeStroke(1,1,17,31,Float32Array.of(0,0,3),'black'),
  {...shapeData(kind),length:100,height:50});

test('стрелки, кривые и штрихи используют концы осевой линии, координаты также используют ноль',()=>{
  for(const kind of ['line','arrow','sine','parabola','hyperbola','adiabat','coordinates'] as const){
    const o=shape(kind),pts=o.pts;
    for(const index of kind==='coordinates'?[0,3,6]:[0,pts.length-3]){
      const end={x:o.ox+pts[index],y:o.oy+pts[index+1]};
      assert.deepEqual(selectionMoveAnchor([o],{x:end.x+2,y:end.y+3}),end);
    }
  }
  const mark={...makeStroke(3,3,5,-2,Float32Array.of(1,2,3,51,40,3),'black'),marker:true};
  const transformed=transformObject(mark,{a:0,b:2,c:-1,d:0,e:100,f:5},true);
  assert.deepEqual(selectionMoveAnchor([transformed],{x:66,y:112}),{x:62,y:117});
  const dot=makeStroke(4,4,3,4,Float32Array.of(1,2,2),'black');
  assert.deepEqual(selectionMoveAnchor([dot],{x:15,y:15}),{x:4,y:6});
});

test('у повёрнутого эллипса можно захватить центр и четыре крайние точки по осям холста',()=>{
  const o=transformObject(shape('ellipse'),rotation({x:17,y:31},Math.PI/4),true);
  const a=Math.sqrt((100**2+50**2)/2),b=(100**2-50**2)/(2*a);
  for(const [dx,dy] of [[0,0],[a,b],[-a,-b],[b,a],[-b,-a]]){
    const p=selectionMoveAnchor([o],{x:17+dx+2,y:31+dy-3});
    assert.ok(Math.hypot(p.x-17-dx,p.y-31-dy)<1e-8);
  }
});

test('смешанная группа выбирает ближайшую опору независимо от порядка объектов',()=>{
  const arrow=shape('arrow'),image=makeImage(2,2,350,280,60,50,'png');
  for(const objects of [[arrow,image],[image,arrow]]){
    assert.deepEqual(selectionMoveAnchor(objects,{x:406,y:318}),{x:410,y:330});
    assert.deepEqual(selectionMoveAnchor(objects,{x:99,y:70}),{x:117,y:81});
  }
});
