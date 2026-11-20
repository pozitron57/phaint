// Раздвижение: неизменный состав, точный перенос, история и координаты при прокрутке.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App } from '../src/app.ts';
import { Doc } from '../src/core/doc.ts';
import { History } from '../src/core/history.ts';
import { makeStroke, makeSvg, type Obj } from '../src/core/types.ts';
import { Viewport } from '../src/view/viewport.ts';
import { SpaceTool } from '../src/tools/space.ts';

const sample=(x:number,y:number)=>({x,y,pressure:.5,t:1});
const stroke=(id:number,y:number)=>makeStroke(id,id,40,y,new Float32Array([0,0,4,30,10,6]),'#315ca8');
function setup(objects:Obj[]){
  const doc=new Doc();doc.replace(objects);const history=new History(doc),view=new Viewport();
  view.setSize(1600,1200,2);
  const tool=new SpaceTool({doc,history,view,renderer:{setLive:()=>{},invalidateLive:()=>{}}} as unknown as App);
  view.onChange=()=>tool.viewChanged();return {doc,history,view,tool};
}

test('раздвижение: только целиком нижние объекты, включая невидимые; одна отмена',()=>{
  const above=stroke(1,30),crossing=stroke(2,95),below=stroke(3,150),far=stroke(4,8000);
  const pdf={...makeSvg(5,5,0,300,400,500,'<svg/>'),pdfPage:{index:0,transform:{a:1,b:0,c:0,d:1,e:0,f:0}}};
  const {doc,history,tool}=setup([above,crossing,below,far,pdf]);
  tool.begin(sample(200,100));tool.move([sample(310,180)]);tool.move([sample(500,240)]);tool.end();
  assert.equal(doc.get(1),above);assert.equal(doc.get(2),crossing);assert.equal(doc.get(5),pdf);
  for(const o of [below,far]){const n=doc.get(o.id)!;assert.equal(n.ox,o.ox);assert.equal(n.oy,o.oy+140);assert.ok(n.kind==='stroke'&&n.pts===o.pts);}
  history.undo();assert.equal(doc.get(3),below);assert.equal(doc.get(4),far);assert.equal(history.canUndo,false);
  history.redo();assert.equal(doc.get(4)!.oy,far.oy+140);
});

test('раздвижение: движение вверх свободно и не подхватывает новые объекты',()=>{
  const upper=stroke(1,60),lower=stroke(2,150),{doc,tool}=setup([upper,lower]);
  tool.begin(sample(200,120));tool.move([sample(200,-80)]);tool.move([sample(200,300)]);tool.end();
  assert.equal(doc.get(1),upper);assert.equal(doc.get(2)!.oy,lower.oy+180);
});

test('раздвижение: прокрутка с неподвижным пером учитывается сразу при масштабе и повороте',()=>{
  for(const scale of [.5,1,2])for(const rotSteps of [0,1,4,7]){
    const o=stroke(1,200),{doc,tool,view}=setup([o]);view.restore({x:100,y:100,scale,rotSteps});
    const start=view.toScreen(100,100);tool.begin(sample(start.x,start.y));
    view.panBy(45,-70);
    const dy=view.toWorld(start.x,start.y).y-100;
    assert.ok(Math.abs(doc.get(1)!.oy-o.oy-dy)<1e-9);
    const p=view.toScreen(200,180);tool.move([sample(p.x,p.y)]);tool.end();
    assert.ok(Math.abs(doc.get(1)!.oy-o.oy-80)<1e-9);assert.equal(doc.get(1)!.ox,o.ox);
  }
});

test('раздвижение: Esc и возврат к началу сохраняют состояние и прежний Redo',()=>{
  for(const cancel of [true,false]){
    const o=stroke(1,150),{doc,history,tool}=setup([o]);
    history.commit({added:[stroke(2,500)],removed:[]});history.undo();const state=history.state;
    tool.begin(sample(100,100));tool.move([sample(100,200)]);
    if(cancel)tool.cancel();else{tool.move([sample(100,100)]);tool.end();}
    assert.equal(doc.get(1),o);assert.equal(history.state,state);assert.equal(history.canUndo,false);assert.equal(history.canRedo,true);
    history.redo();assert.equal(doc.size,2);
  }
});

test('раздвижение: касание и пустая нижняя область не меняют историю',()=>{
  const o=stroke(1,150),{doc,history,tool}=setup([o]);const state=history.state;
  tool.begin(sample(100,100));tool.end();tool.begin(sample(100,500));tool.move([sample(100,600)]);tool.end();
  assert.equal(doc.get(1),o);assert.equal(history.state,state);assert.equal(history.canUndo,false);
});
