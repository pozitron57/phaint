// Рамки картинок, независимые оси привязки и допуски при разном масштабе.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Doc } from '../src/core/doc.ts';
import { matBBox } from '../src/core/geom.ts';
import { ImageSnap } from '../src/core/image-snap.ts';
import { mergeSettings } from '../src/core/settings.ts';
import { makeImage, makeStroke, makeSvg } from '../src/core/types.ts';
import { transformObject } from '../src/core/transform.ts';

const image = (id:number,x:number,y:number,w=100,h=60) => makeImage(id,id,x,y,w,h,'png');

test('только края рамок совпадают по каждой оси, сосед имеет приоритет перед сеткой',()=>{
  const doc=new Doc(), moving=image(1,0,0,80,40), target=image(2,203,151,120,80);
  doc.replace([moving,target]);
  // Сверху, снизу, слева и справа, с выравниванием по одноимённому краю другой оси.
  for(const [x,y] of [[203,111],[243,231],[123,151],[323,191]]){
    const snap=ImageSnap.forSelection([moving])!;
    assert.deepEqual(snap.move(doc,{x:x+3,y:y-4},1,24,true),{x,y});
    assert.equal(snap.guides.length,2);
  }
  const snap=ImageSnap.forSelection([moving])!;
  assert.deepEqual(snap.move(doc,{x:319,y:132},1,24,true),{x:323,y:144});
  assert.equal(snap.guides.length,1);
  assert.deepEqual(snap.move(doc,{x:225,y:174},1,null,true),{x:225,y:174});
  assert.equal(snap.guides.length,0,'близость центров не притягивает картинки');

  const left=image(2,76,95,100,80),above=image(3,210,5,100,60);
  doc.replace([moving,left,above]);
  const corner=new ImageSnap(moving.bbox,[moving.id]);
  assert.deepEqual(corner.move(doc,{x:180,y:69},1,24,true),{x:176,y:65},'две оси могут совпасть с краями разных соседей');
});

test('порог захвата, отпускание и поиск ближайших картинок заданы в экранных пикселях',()=>{
  const doc=new Doc(), moving=image(1,0,0), target=image(2,203,157);
  doc.replace([moving,target]);
  for(const scale of [.5,1,2]){
    const snap=ImageSnap.forSelection([moving])!;
    const place=(px:number,y=157)=>snap.move(doc,{x:303+px/scale,y},scale,null,true).x;
    assert.equal(place(9),303+9/scale);
    assert.equal(place(7),303);
    assert.equal(place(11),303);
    assert.equal(place(13),303+13/scale);
    assert.equal(place(4,217+80/scale),303+4/scale);
  }
});

test('у группы общая рамка, свои картинки и подложки исключены, обрезка и отражение учитываются',()=>{
  const doc=new Doc(), first=image(1,-30,-10), second=image(2,100,20);
  const reflected=transformObject(image(3,400,200,100,60),{a:-1,b:0,c:0,d:1,e:800,f:0},true);
  const page={...image(4,120,120),pdfPage:{index:0,transform:{a:1,b:0,c:0,d:1,e:0,f:0}}};
  const stroke=makeStroke(5,5,0,0,Float32Array.of(0,0,2),'black');
  const svg=makeSvg(6,6,120,120,100,60,'svg');
  doc.replace([first,second,reflected,page,stroke,svg]);
  const snap=ImageSnap.forSelection([first,second])!;
  assert.deepEqual(snap.move(doc,{x:3,y:4},1,null,true),{x:3,y:4});
  assert.deepEqual(snap.move(doc,{x:103,y:121},1,null,true),{x:100,y:120});
  const fresh=ImageSnap.forSelection([first,second])!;
  assert.deepEqual(fresh.move(doc,{x:149,y:129},1,null,true),{x:149,y:129});
  assert.equal(ImageSnap.forSelection([first,stroke]),null);
  assert.equal(ImageSnap.forSelection([page]),null);
  const clipped={...first,clip:[{x:20,y:10},{x:40,y:10},{x:20,y:30}],bbox:{minX:-10,minY:0,maxX:10,maxY:20}};
  assert.deepEqual(ImageSnap.forSelection([clipped])!.move(doc,{x:16,y:-13},1,24,false),{x:10,y:-24});
});

test('привязки к картинкам и сетке сохраняются независимо в старом и новом профиле',()=>{
  assert.equal(mergeSettings({version:13,snapToGrid:false}).snapToImages,true);
  const settings=mergeSettings({snapToImages:false});
  assert.equal(settings.snapToGrid,true);
  assert.equal(mergeSettings(settings).snapToImages,false);
});

test('левое поле доступно на любой высоте только для левого края другой картинки',()=>{
  const doc=new Doc(),moving=image(1,-500,50),left=image(2,-107,-8000),right=image(3,107,3000);
  const page={...image(4,-200,-100),pdfPage:{index:0,transform:{a:1,b:0,c:0,d:1,e:0,f:0}}};
  doc.replace([moving,left,right,page]);
  const snap=ImageSnap.forSelection([moving])!;
  assert.deepEqual(snap.move(doc,{x:396,y:10},2,24,true),{x:393,y:22});
  assert.deepEqual(snap.guides,[{columnX:-107}]);
  assert.equal(snap.move(doc,{x:398,y:11},2,null,true).x,393,'удержание до 12 экранных пикселей');
  assert.equal(snap.move(doc,{x:400,y:12},2,null,true).x,400);
  assert.equal(snap.move(doc,{x:296,y:13},2,null,true).x,296,'правый край не примагничивается к далёкой вертикали');
  assert.equal(snap.move(doc,{x:609,y:14},2,null,true).x,609,'другие картинки не создают дальних вертикалей');
  assert.equal(snap.move(doc,{x:396,y:15},2,null,false).x,396);
  assert.deepEqual(snap.guides,[]);
  doc.replace([moving]);
  const single=ImageSnap.forSelection([moving])!;
  assert.deepEqual(single.move(doc,{x:3,y:300},1,null,true),{x:3,y:300});
});

test('размер за угол выбирает меньшую поправку масштаба и рисует только достигнутые края',()=>{
  const box={minX:101,minY:99,maxX:301,maxY:199},pivot={x:101,y:99},corner={x:301,y:199};
  const doc=new Doc(),target=image(2,307,203,70,40);
  doc.replace([target]);
  const snap=new ImageSnap(box);
  const resized=(independent:boolean,align:boolean)=>matBBox(snap.resize(doc,box,pivot,corner,independent,1,24,align),box);
  const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);
  let b=resized(false,true);
  near(b.minX,101);near(b.minY,99);near(b.maxX,307);near(b.maxY,202);
  assert.equal(snap.guides.length,1);
  b=resized(true,true);near(b.maxX,307);near(b.maxY,203);assert.equal(snap.guides.length,2);
  b=resized(false,false);near(b.maxX,312);near(b.maxY,204.5);assert.equal(snap.guides.length,0);
  b=resized(true,false);near(b.maxX,312);near(b.maxY,192);
});

test('при размере от центра левой колонки может достигнуть сторона напротив ручки',()=>{
  const box={minX:83,minY:150,maxX:317,maxY:250};
  const doc=new Doc();doc.replace([image(1,79,6000)]);
  const snap=new ImageSnap(box),pivot={x:200,y:200},corner={x:317,y:250};
  const m=snap.resize(doc,box,pivot,corner,false,1,24,true),b=matBBox(m,box);
  assert.ok(Math.abs(b.minX-79)<1e-8&&Math.abs(b.maxX-321)<1e-8&&m.a===m.d);
  assert.deepEqual(snap.guides,[{columnX:79}]);
  // Угол захвата перешёл влево и вверх. Сетка не должна схлопывать объект в точку.
  const tiny={minX:-1,minY:-2,maxX:0,maxY:0};
  const after=new ImageSnap(tiny).resize(doc,tiny,{x:0,y:0},{x:-1,y:-2},true,1,24,false);
  assert.deepEqual(matBBox(after,tiny),tiny);
});

test('при растяжении длинной строки почти неподвижный край не вытягивает ручку далеко от пера',()=>{
  const doc=new Doc(),box={minX:0,minY:0,maxX:1200,maxY:20};
  doc.replace([image(1,450,24)]);
  const snap=new ImageSnap(box),m=snap.resize(doc,box,{x:0,y:0},{x:1200,y:20},false,1,null,true);
  assert.deepEqual(matBBox(m,box),box);
  assert.equal(snap.guides.length,0);
});
