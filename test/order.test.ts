// Перестановка слоёв: группы, общие z после ластика, подложки и отмена без правки геометрии.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reorderObjects, type ObjectOrder } from '../src/core/order.ts';
import { Doc } from '../src/core/doc.ts';
import { History } from '../src/core/history.ts';
import { makeStroke, makeSvg, type Obj, type VectorObj } from '../src/core/types.ts';
import { encodeSvg, nativeSvgData } from '../src/files/codec.ts';

const stroke=(id:number,z=id)=>makeStroke(id,z,100,100,Float32Array.of(0,0,4,100,0,4),'#315ca8');
const ids=(objects:Iterable<Obj>)=>[...objects].sort((a,b)=>a.z-b.z).map(o=>o.id);
const setup=(objects:Obj[])=>{const doc=new Doc();doc.replace(objects);return {doc,history:new History(doc)};};
test('порядок: четыре команды сохраняют порядок выбранных и невыбранных объектов',()=>{
  const objects=Array.from({length:7},(_,i)=>stroke(i+1));
  const cases:[ObjectOrder,number[]][]=[['front',[1,4,6,7,2,3,5]],['back',[2,3,5,1,4,6,7]],['forward',[1,4,2,3,6,5,7]],['backward',[2,3,1,5,4,6,7]]];
  for(const [direction,expected] of cases){
    const {doc,history}=setup(objects);history.commit(reorderObjects(doc.values(),new Set([5,3,2]),direction));
    assert.deepEqual(ids(doc.values()),expected,direction);
    for(const o of objects){const next=doc.get(o.id)!;assert.deepEqual({...next,z:o.z},o);if(next.kind==='stroke')assert.equal(next.pts,o.pts);}
    assert.equal(history.undo(),true);assert.deepEqual(ids(doc.values()),[1,2,3,4,5,6,7]);assert.equal(history.canUndo,false);
    for(const o of objects)assert.equal(doc.get(o.id),o);
    assert.equal(history.redo(),true);assert.deepEqual(ids(doc.values()),expected);
    assert.ok(doc.topZ()>Math.max(...[...doc.values()].map(o=>o.z)));
  }
});
test('порядок: фрагменты с одинаковым z получают устойчивые целые слои и сохраняются в SVG',async()=>{
  for(const [selected,direction,expected] of [[2,'forward',[1,3,2,4]],[3,'back',[3,1,2,4]]] as [number,ObjectOrder,number[]][]){
    const objects=[stroke(1,1),stroke(2,1),stroke(3,1),stroke(4,8)];
    const {doc,history}=setup(objects);history.commit(reorderObjects(doc.values(),new Set([selected]),direction));
    assert.deepEqual(ids(doc.values()),expected);
    const next=[...doc.values()].sort((a,b)=>a.z-b.z);
    assert.ok(next.every((o,i)=>Number.isSafeInteger(o.z)&&o.z>=0&&(!i||o.z>next[i-1].z)));
    const data={objects:[...doc.values()],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
    const restored=await nativeSvgData(await encodeSvg(data));assert.ok(restored);assert.deepEqual(ids(restored.objects),expected);
    history.undo();assert.deepEqual(ids(doc.values()),[1,2,3,4]);
    for(const o of objects)assert.equal(doc.get(o.id),o);
  }
});
test('порядок: фон и PDF неподвижны, ресурсы SVG и маски сохраняются по ссылке',()=>{
  const background:VectorObj={kind:'vector',id:1,z:1,ox:0,oy:0,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},d:'M0 0H500V500H0Z',fill:'#fff',stroke:'none',strokeWidth:0,fillRule:'nonzero',linecap:'butt',linejoin:'miter',opacity:1,bounds:{minX:0,minY:0,maxX:500,maxY:500},bbox:{minX:0,minY:0,maxX:500,maxY:500},background:true};
  const pdf={...makeSvg(2,2,0,0,500,500,'<svg/>'),pdfPage:{index:0,transform:background.matrix}};
  const masked={...makeSvg(3,3,0,0,500,500,'<svg/>'),erasures:[[10,20,30,40,5]],clip:[{x:0,y:0},{x:500,y:0},{x:500,y:500},{x:0,y:500}]};
  const objects=[background,pdf,masked,stroke(4),stroke(5)],{doc,history}=setup(objects);
  history.commit(reorderObjects(doc.values(),new Set([1,2,5]),'back'));
  assert.deepEqual(ids(doc.values()),[1,2,5,3,4]);assert.equal(doc.get(1),background);assert.equal(doc.get(2),pdf);
  const next=doc.get(3)!;assert.equal(next.kind,'svg');if(next.kind!=='svg')return;
  assert.equal(next.erasures,masked.erasures);assert.equal(next.clip,masked.clip);assert.equal(next.bbox,masked.bbox);
});
test('порядок: пустое выделение, вся группа и край не создают Undo и сохраняют Redo',()=>{
  for(const [selection,direction] of [[[],'front'],[[1,2,3],'back'],[[3],'front'],[[3],'forward'],[[1],'back'],[[1],'backward']] as [number[],ObjectOrder][]){
    const {doc,history}=setup([stroke(1),stroke(2),stroke(3)]);history.commit({added:[stroke(4)],removed:[]});history.undo();const state=history.state;
    history.commit(reorderObjects(doc.values(),new Set(selection),direction));
    assert.equal(history.state,state);assert.equal(history.canUndo,false);assert.equal(history.canRedo,true);
  }
});
