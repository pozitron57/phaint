// Рамки картинок, независимые оси привязки и допуски при разном масштабе.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Doc } from '../src/core/doc.ts';
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
