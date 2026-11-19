// Геометрия частичного стирания и объединённая отмена прохода ластика.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraseStroke } from '../src/core/erase.ts';
import { makeStroke } from '../src/core/types.ts';
import { Doc } from '../src/core/doc.ts';
import { History } from '../src/core/history.ts';
import { encodeSvg, nativeSvgData } from '../src/files/codec.ts';

const line=(id=1) => makeStroke(id,1,0,0,Float32Array.of(0,0,2,100,0,2),'#3f6fb5');
const near=(a: number,b: number) => assert.ok(Math.abs(a-b)<1e-4, `${a} ≈ ${b}`);

test('ластик: касание разрезает длинный отрезок между редкими точками', () => {
  const parts=eraseStroke(line(),{x:50,y:0},{x:50,y:0},10)!;
  assert.equal(parts.length,2);
  assert.deepEqual([...parts[0]],[0,0,2,39,0,2]);
  assert.deepEqual([...parts[1]],[61,0,2,100,0,2]);
  assert.equal(eraseStroke(line(),{x:50,y:20},{x:50,y:20},10),null);
  assert.deepEqual(eraseStroke(line(),{x:-20,y:0},{x:120,y:0},3),[]);
});

test('ластик: быстрый проход стирает между событиями, независимо от направления', () => {
  const a={x:50,y:-1000}, b={x:50,y:1000};
  const parts=eraseStroke(line(),a,b,10);
  assert.equal(parts?.length,2);
  assert.deepEqual(parts,eraseStroke(line(),b,a,10));
  const far=makeStroke(1,1,1e9,-1e9,line().pts,'#2f3136');
  assert.deepEqual(parts,eraseStroke(far,{x:1e9+50,y:-1e9-1000},{x:1e9+50,y:-1e9+1000},10));
});

test('ластик: точки и толщина по нажатию сохраняются на границах разреза', () => {
  const dot=makeStroke(1,1,0,0,Float32Array.of(20,0,4),'#2f3136');
  assert.deepEqual(eraseStroke(dot,{x:0,y:0},{x:40,y:0},3),[]);
  assert.equal(eraseStroke(dot,{x:0,y:10},{x:40,y:10},3),null);
  const stroke=makeStroke(2,2,0,0,Float32Array.of(0,0,2,100,0,10),'#c9514e');
  const parts=eraseStroke(stroke,{x:50,y:0},{x:50,y:0},5)!;
  assert.equal(parts.length,2);
  const left=parts[0],right=parts[1];
  near(left.at(-3)!,44/1.04); near(right[0],56/.96);
  near(left.at(-1)!,2+.08*left.at(-3)!); near(right[2],2+.08*right[0]);
  assert.equal(left[2],2); assert.equal(right.at(-1),10);
});

test('ластик: несколько пересечений петли оставляют все уцелевшие части', () => {
  const stroke=makeStroke(1,1,0,0,Float32Array.of(0,0,2,100,0,2,100,100,2,0,100,2),'#4d9160');
  const parts=eraseStroke(stroke,{x:50,y:-20},{x:50,y:120},5)!;
  assert.equal(parts.length,3);
  assert.ok(parts.every(p=>p.every(Number.isFinite)));
  near(parts[1][0],56); near(parts[1].at(-3)!,56);
});

test('ластик: все промежуточные разрезы отменяются одним шагом, SVG сохраняет результат', async () => {
  const doc=new Doc(),history=new History(doc), original=line(), group={};
  history.commit({added:[original],removed:[]}); const saved=history.state;
  const parts=eraseStroke(original,{x:50,y:-20},{x:50,y:20},5)!;
  const pieces=parts.map(pts=>makeStroke(doc.nextId(),1,0,0,pts,original.color));
  history.commit({added:pieces,removed:[original]},group);
  const state=history.state;
  history.commit({added:[],removed:[pieces[0]]},group);
  assert.notEqual(history.state,state); history.endGroup(group);
  assert.deepEqual([...doc.values()],[pieces[1]]);
  const data={objects:[...doc.values()],grid:{enabled:true,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
  assert.deepEqual(await nativeSvgData(await encodeSvg(data)),data);
  history.undo(); assert.equal(history.state,saved);
  assert.deepEqual(doc.query(original.bbox),[original]);
  history.redo(); assert.deepEqual(doc.query(original.bbox),[pieces[1]]);
});

test('ластик: Esc восстанавливает рисунок и существующую ветку повтора', () => {
  const doc=new Doc(),history=new History(doc), original=line(), other=line(2), group={};
  history.commit({added:[original],removed:[]});
  history.commit({added:[other],removed:[]}); history.undo();
  const state=history.state;
  history.commit({added:[],removed:[original]},group); history.cancelGroup(group);
  assert.equal(history.state,state); assert.ok(history.canRedo);
  assert.deepEqual(doc.query(original.bbox),[original]);
  history.redo(); assert.equal(doc.size,2);
});
