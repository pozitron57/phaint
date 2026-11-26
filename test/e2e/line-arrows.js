// Преобразования выбранной линии настоящими клавишами, с отменой, SVG и переназначением.
const {app,test}=window.__phaint;
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const selected=()=>app.selection?.selected;
const flip=()=>test.key('KeyA',{ctrlKey:true});
const mode=()=>{const s=selected().shape;return s.kind==='line'?'line':s.both?'both':s.headAtStart?'start':'end';};
const draw=async(kind,from,to,controls)=>{
  app.selectTool(kind,false);
  await test.pen([[...from,.5],[...to,.5]],1);
  for(const [x,y] of controls){
    test.pointer('pointerdown',x,y,.5,'pen',{ctrlKey:true});
    test.pointer('pointerup',x,y,0,'pen',{ctrlKey:true});
  }
  const obj=[...app.doc.values()].at(-1);
  test.key('KeyX');app.selection.show(obj);
  return obj;
};
app.setStylePerTool(true);
app.settings.snapToGrid=false;app.settings.grid.enabled=false;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
Object.assign(app.settings.arrow,{width:6,color:'#315ca8',headType:'filled',headLength:8,headWidth:4.5,headRound:.6,both:false});
Object.assign(app.settings.arrow.doubleHead,{headType:'open',headLength:3,headWidth:2,headRound:.2});
const original=await draw('arrow',[754,63],[94,609],[[597,804]]);
assert(original.shape.controls.length===1,'нарисована изогнутая стрелка');
flip();assert(selected().shape.headAtStart&&selected().pts===original.pts,'Ctrl+A разворачивает исходную стрелку');
test.key('KeyZ');assert(selected()===original,'отмена возвращает исходную стрелку');
app.settings.arrow.headLength=4;
for(const shiftKey of [false,true]){
  const order=shiftKey?['line','both','start','end']:['start','both','line','end'];
  for(const expected of order){
    const before=selected();
    test.key('KeyA',{shiftKey});
    assert(mode()===expected&&selected().pts===original.pts&&selected().shape.controls===original.shape.controls,'цикл сохраняет кривую: '+expected);
    const after=selected();test.key('KeyZ');assert(selected()===before,'отмена одного шага цикла');
    test.key('KeyY');assert(selected()===after,'повтор одного шага цикла');
    if(expected==='line'){
      const svg=await app.files.worker.run('svg',app.files.snapshot());
      const copy=(await app.files.worker.run('native',svg)).objects[0];
      const hidden=copy.shape;
      assert(hidden.savedHeadStyle&&hidden.headLength===(hidden.both?3:8)&&hidden.otherHead.headLength===(hidden.both?8:3),'в SVG сохраняются оба оформления скрытых головок');
    }else if(expected==='both'){
      assert(after.shape.headLength===3&&after.shape.headType==='open'&&after.shape.headRound===.2,'у двух головок свой вид');
    }else assert(after.shape.headLength===8&&after.shape.headType==='filled'&&after.shape.headRound===.6,'цикл возвращает исходную одиночную головку');
  }
}
const beforeL=selected();
test.key('KeyL');
const line=selected();
assert(line.shape.kind==='line'&&line.id===original.id&&line.pts===original.pts,'L сохранила ось и выбор');
assert(line.shape.controls===original.shape.controls,'L сохранила ручку');
test.key('KeyL');assert(selected()===line,'повтор L сохраняет выделение');
test.key('KeyZ');assert(selected()===beforeL,'L отменяется за один шаг');
test.key('KeyY');assert(selected()===line,'повтор возвращает линию');
flip();
assert(selected().shape.kind==='arrow'&&selected().shape.headAtStart,'Ctrl+A у линии ставит головку в начале');
assert(selected().shape.headLength===4,'после явного L берутся настройки новой головки');
const startGrip=app.selection.handles().find(h=>h.name==='startpoint').point,old=selected();
const worldControl=o=>{const f=o.shape.frame,p=o.shape.controls[0];return [o.ox+f.a*p.x+f.c*p.y+f.e,o.oy+f.b*p.x+f.d*p.y+f.f];};
test.pointer('pointerdown',startGrip.x,startGrip.y,.5);test.pointer('pointermove',startGrip.x-37,startGrip.y+15,.5);test.pointer('pointerup',startGrip.x-37,startGrip.y+15,0);
const moved=selected();assert(moved.pts[0]===old.pts[0]-37&&moved.pts[1]===old.pts[1]+15,'двигается начало изогнутой стрелки');
assert(moved.pts.at(-3)===old.pts.at(-3)&&moved.pts.at(-2)===old.pts.at(-2)&&JSON.stringify(worldControl(moved))===JSON.stringify(worldControl(old)),'дальний конец и контрольная точка остаются на холсте');
test.key('KeyZ');assert(selected()===old,'перенос за основание отменяется одним действием');
flip();assert(!selected().shape.headAtStart&&selected().pts===original.pts,'Ctrl+A поменяла только конец');
app.history.undo();assert(selected().shape.headAtStart,'отмена возвращает прежнюю сторону');
test.key('KeyA');
const both=selected();assert(both.shape.both,'A после головки в начале ставит обе');
const state=app.history.state;flip();assert(selected()===both&&app.history.state===state,'у двух головок перестановка пуста');
test.key('KeyA');assert(mode()==='line','A после двух головок снимает обе');
test.key('KeyA');assert(mode()==='end','A на линии ставит головку в точке отрыва');
await test.idle();await test.shot('curve');

Object.assign(app.settings.line,{width:9,color:'#79ad65',dashed:true,dotted:false});
const cubic=await draw('line',[920,570],[280,210],[[850,90],[270,540]]);
assert(cubic.shape.controls.length===2,'нарисована кубическая линия');
test.key('KeyA');const arrow=selected();
assert(arrow.id===cubic.id&&arrow.pts===cubic.pts&&arrow.dash===cubic.dash&&arrow.color===cubic.color,'A сохраняет геометрию и оформление');
assert(arrow.shape.headType==='filled'&&!arrow.shape.headAtStart&&!arrow.shape.both,'у линии появились головка из настроек и исходное направление');
await app.applyShortcuts({'selection.flipArrowHead':['KeyU'],'tool.line':['KeyI'],'tool.arrow':['KeyJ'],'tool.arrowBoth':['KeyK']});
flip();assert(selected()===arrow,'прежнее сочетание отключено');
test.key('KeyI');assert(selected().shape.kind==='line'&&selected().shape.controls===cubic.shape.controls,'переназначенная L сохраняет обе ручки');
test.key('KeyK');assert(selected().shape.both,'переназначенная Shift+A');
test.key('KeyJ');test.key('KeyJ');test.key('KeyU');
const reversed=selected();assert(reversed.shape.headAtStart&&!reversed.shape.both,'переназначенные A и Ctrl+A');
const svg=await app.files.worker.run('svg',app.files.snapshot());
const copy=(await app.files.worker.run('native',svg)).objects.find(o=>o.id===cubic.id);
assert(copy.shape.headAtStart&&JSON.stringify(copy.shape.controls)===JSON.stringify(cubic.shape.controls),'сторона и ручки переживают SVG');
app.selection.showObjects([app.doc.get(original.id),reversed]);
test.key('KeyU');assert(app.doc.get(cubic.id)===reversed,'группа не изменяется');
test.key('KeyJ');assert(app.tool.id==='arrow','без одиночной линии включается инструмент');
await app.applyShortcuts({});
return {ok:true};
