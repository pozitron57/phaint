// Бюджет истории: непрерывная цепочка отмены, общие данные, Esc и освобождение Redo.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {History} from '../src/core/history.ts';
import {Doc} from '../src/core/doc.ts';
import {makeStroke,makeSvg} from '../src/core/types.ts';
const stroke=(id=1,n=256)=>makeStroke(id,id,0,0,new Float32Array(n*3).fill(2),'#000000');

test('история: старые шаги удаляются по памяти, ближайшие Undo/Redo и номера состояния сохраняются',()=>{
  const doc=new Doc(),history=new History(doc,16000);let old=stroke();
  history.commit({added:[old],removed:[]});
  const states=new Map([[history.state,old]]);
  for(let i=0;i<30;i++){
    const next={...stroke(),ox:i};history.commit({added:[next],removed:[old]});old=next;states.set(history.state,old);
    assert.ok(history.bytes<=history.maxBytes);
  }
  const final=history.state,bytes=history.bytes;let count=0;
  while(history.undo()){assert.equal(doc.get(1),states.get(history.state));count++;}
  assert.ok(count>0&&count<30);assert.equal(history.bytes,bytes);
  while(history.redo())assert.equal(doc.get(1),states.get(history.state));
  assert.equal(history.state,final);history.clear();assert.equal(history.bytes,0);
});

test('история: переносы не считают общий буфер заново, разные виды Float32Array считают один ArrayBuffer',()=>{
  const doc=new Doc(),history=new History(doc,60000);let old=stroke(1,2048);
  history.commit({added:[old],removed:[]});
  for(let i=0;i<20;i++){
    const next={...old,ox:i,pts:new Float32Array(old.pts.buffer)};
    history.commit({added:[next],removed:[old]});old=next;
  }
  let count=0;while(history.undo())count++;
  assert.equal(count,21);assert.ok(history.bytes<60000);
});

test('история: Esc возвращает документ, Redo и расход памяти до большого незавершённого жеста',()=>{
  const doc=new Doc(),history=new History(doc,12000),a=stroke(),b=stroke(2);
  history.commit({added:[a],removed:[]});history.commit({added:[b],removed:[]});history.undo();
  const before=history.state,bytes=history.bytes,group={};let old=a;
  for(let i=0;i<10;i++){
    const next=stroke(1,6000);history.commit({added:[next],removed:[old]},group);old=next;
  }
  assert.ok(history.bytes>history.maxBytes);
  history.cancelGroup(group);assert.equal(doc.get(1),a);assert.equal(history.state,before);assert.equal(history.bytes,bytes);
  assert.ok(history.redo());assert.equal(doc.get(2),b);
});

test('история: после завершения жеста промежуточные массивы и прежний Redo освобождаются',()=>{
  const doc=new Doc(),history=new History(doc,20000),a=stroke(),b=stroke(2);
  history.commit({added:[a],removed:[]});history.commit({added:[b],removed:[]});history.undo();
  const group={};let old=a;
  for(let i=0;i<100;i++){const next=stroke();history.commit({added:[next],removed:[old]},group);old=next;}
  history.endGroup(group);assert.ok(history.bytes<15000);assert.equal(history.canRedo,false);
  history.undo();assert.equal(doc.get(1),a);history.redo();assert.equal(doc.get(1),old);
  history.clear();assert.equal(history.bytes,0);
});

test('история: одиночная огромная правка остаётся в документе, но не обходит бюджет',()=>{
  const doc=new Doc(),history=new History(doc,10000);let warning=false;history.onTrim=v=>warning=v;
  const svg=makeSvg(1,1,0,0,20,20,'x'.repeat(10000));
  history.commit({added:[svg],removed:[]});assert.equal(doc.get(1),svg);assert.equal(history.canUndo,false);
  assert.equal(history.bytes,0);assert.ok(warning);
  const small=stroke(2,8);history.commit({added:[small],removed:[]});assert.ok(history.undo());assert.equal(doc.get(1),svg);
});
