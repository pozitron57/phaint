// Ближайший видимый контур в допуске 10 px, независимо от слоя, масштаба и поворота.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const line=(id,y,width=1)=>({kind:'stroke',id,z:id,ox:100,oy:y,pts:Float32Array.of(0,0,width,600,0,width),color:'#315ca8',
  bbox:{minX:99,minY:y-width/2-1,maxX:701,maxY:y+width/2+1}});
const lower=line(1,300),upper=line(2,320);
const thick=line(1,300,20);
const dotted={...line(2,300,2),dash:{length:2,gap:60,round:true,dots:true}};
const erased={...line(2,300,4),erasures:[[250,0,350,0,30]]};
const clipped={...line(2,300,2),clip:[{x:0,y:-20},{x:250,y:-20},{x:250,y:20},{x:0,y:20}],bbox:{minX:100,minY:299,maxX:350,maxY:301}};
const vector={kind:'vector',id:2,z:2,ox:100,oy:300,matrix:{a:1,b:0,c:0,d:4,e:0,f:0},d:'M0 0H600',fill:'none',stroke:'#315ca8',strokeWidth:1,
  fillRule:'nonzero',linecap:'round',linejoin:'round',opacity:1,bounds:{minX:-.5,minY:-.5,maxX:600.5,maxY:.5},bbox:{minX:99,minY:298,maxX:701,maxY:302}};
const marker={...line(2,300),marker:true,opacity:.4,matrix:vector.matrix,bbox:vector.bbox};
const hollow={...line(2,300,2),pts:Float32Array.of(-100,-90,2,700,-90,2,700,90,2,-100,90,2,-100,-90,2),bbox:{minX:-2,minY:208,maxX:802,maxY:392}};
const cases=[
  ['нижний ближе',[lower,upper],400,303,1],
  ['верхний ближе',[lower,upper],400,317,2],
  ['равный промах — верхний',[lower,line(2,308)],400,304,2],
  ['прямое попадание — верхний',[line(1,300,8),line(2,302,8)],400,301,2],
  ['расстояние до края толстой линии',[thick,upper],400,314,1],
  ['пустота внутри рамки',[lower,hollow],400,302,1],
  ['разрыв между точками',[line(1,304),dotted],130,300,1],
  ['стёртая часть',[line(1,304),erased],400,300,1],
  ['видимый край обрезки',[line(1,320),clipped],354,302,2],
  ['растянутый маркер',[line(1,320),marker],400,315,1],
  ['растянутая обводка SVG',[line(1,320),vector],400,315,1],
  ['вне допуска',[lower,upper],400,380,null],
];
let checks=0;
for(const [name,objects,x,y,expected] of cases)for(const scale of [.5,1,2])for(const rotSteps of [0,2])for(const cmd of [false,true]){
  app.selectTool('select',false);app.doc.replace(objects);app.history.clear();
  app.view.restore({x,y,scale,rotSteps});if(cmd)app.selectTool('pen',false);
  const p=app.view.toScreen(x,y),state=app.history.state;
  test.pointer('pointerdown',p.x,p.y,.5,'mouse',{metaKey:cmd});test.pointer('pointerup',p.x,p.y,0,'mouse',{metaKey:cmd});
  assert((app.selection.selected?.id??null)===expected,`${name}, масштаб ${scale}, поворот ${rotSteps}, Cmd ${cmd}: выбран ${app.selection.selected?.id}`);
  assert(app.history.state===state,'выбор не меняет историю');checks++;
}
// Бесконечный холст: расстояния не округляются до Float32 мировых координат.
const far=1e9,shifted=[lower,upper].map(o=>({...o,ox:o.ox+far,oy:o.oy+far,bbox:{minX:o.bbox.minX+far,minY:o.bbox.minY+far,maxX:o.bbox.maxX+far,maxY:o.bbox.maxY+far}}));
app.doc.replace(shifted);app.history.clear();app.selectTool('select',false);app.view.restore({x:far+400,y:far+303,scale:2,rotSteps:0});
let click=app.view.toScreen(far+400,far+303);test.pointer('pointerdown',click.x,click.y,.5);test.pointer('pointerup',click.x,click.y,0);
assert(app.selection.selected?.id===1,'ближайшая тонкая линия далеко от начала координат');
// Cmd в уже активном M меняет состав по ближайшему объекту, даже если он ниже другого.
app.doc.replace([lower,upper]);app.history.clear();app.selectTool('select',false);app.selection.show(lower);
app.view.restore({x:400,y:310,scale:1,rotSteps:0});let p=app.view.toScreen(400,303);
test.pointer('pointerdown',p.x,p.y,.5,'mouse',{metaKey:true});test.pointer('pointerup',p.x,p.y,0,'mouse',{metaKey:true});
assert(!app.selection.objects.length,'Cmd снимает ближайший выбранный объект');
app.selection.show(upper);test.pointer('pointerdown',p.x,p.y,.5,'mouse',{metaKey:true});test.pointer('pointerup',p.x,p.y,0,'mouse',{metaKey:true});
assert(app.selection.objects.length===2,'Cmd добавляет ближайший нижний объект');
app.selection.show(lower);await test.idle();await test.shot('nearest');
return {ok:true,checks,additive:true};
