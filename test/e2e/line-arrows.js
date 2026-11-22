// Преобразования выбранной линии настоящими клавишами, с отменой, SVG и переназначением.
const {app,test}=window.__phaint;
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const selected=()=>app.selection?.selected;
const flip=()=>test.key('Digit3',{ctrlKey:true});
const draw=async(kind,from,to,controls)=>{
  app.selectTool(kind,false);
  await test.pen([[...from,.5],[...to,.5]],1);
  for(const [x,y] of controls){
    test.pointer('pointerdown',x,y,.5,'pen',{ctrlKey:true});
    test.pointer('pointerup',x,y,0,'pen',{ctrlKey:true});
  }
  const obj=[...app.doc.values()].at(-1);
  test.key('KeyM');app.selection.show(obj);
  return obj;
};
app.settings.snapToGrid=false;app.settings.grid.enabled=false;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
Object.assign(app.settings.arrow,{width:6,color:'#315ca8',headType:'filled',headLength:8,headWidth:4.5,headRound:.6,both:false});
const original=await draw('arrow',[754,63],[94,609],[[597,804]]);
assert(original.shape.controls.length===1,'нарисована изогнутая стрелка');
flip();assert(selected().shape.headAtStart&&selected().pts===original.pts,'Ctrl+3 разворачивает исходную стрелку');
test.key('KeyZ');assert(selected()===original,'отмена возвращает исходную стрелку');
test.key('KeyL');
const line=selected();
assert(line.shape.kind==='line'&&line.id===original.id&&line.pts===original.pts,'L сохранила ось и выбор');
assert(line.shape.controls===original.shape.controls,'L сохранила ручку');
test.key('KeyZ');assert(selected()===original,'L отменяется за один шаг');
test.key('KeyY');assert(selected()===line,'повтор возвращает линию');
flip();
assert(selected().shape.kind==='arrow'&&selected().shape.headAtStart,'Ctrl+3 у линии ставит головку в начале');
flip();assert(!selected().shape.headAtStart&&selected().pts===original.pts,'Ctrl+3 поменяла только конец');
app.history.undo();assert(selected().shape.headAtStart,'отмена возвращает прежнюю сторону');
test.key('Digit3',{shiftKey:true});
const both=selected();assert(both.shape.both,'Shift+3 ставит обе головки');
const state=app.history.state;flip();assert(selected()===both&&app.history.state===state,'у двух головок перестановка пуста');
test.key('Digit3');assert(!selected().shape.both&&!selected().shape.headAtStart,'3 возвращает одну головку в точке отрыва');
await test.idle();await test.shot('curve');

Object.assign(app.settings.line,{width:9,color:'#79ad65',dashed:true,dotted:false});
const cubic=await draw('line',[920,570],[280,210],[[850,90],[270,540]]);
assert(cubic.shape.controls.length===2,'нарисована кубическая линия');
test.key('Digit3');const arrow=selected();
assert(arrow.id===cubic.id&&arrow.pts===cubic.pts&&arrow.dash===cubic.dash&&arrow.color===cubic.color,'3 сохраняет геометрию и оформление');
assert(arrow.shape.headType==='filled'&&!arrow.shape.headAtStart&&!arrow.shape.both,'у линии появились головка из настроек и исходное направление');
await app.applyShortcuts({'selection.flipArrowHead':['KeyU'],'tool.line':['KeyI'],'tool.arrow':['KeyJ'],'tool.arrowBoth':['KeyK']});
flip();assert(selected()===arrow,'прежнее сочетание отключено');
test.key('KeyI');assert(selected().shape.kind==='line'&&selected().shape.controls===cubic.shape.controls,'переназначенная L сохраняет обе ручки');
test.key('KeyK');assert(selected().shape.both,'переназначенная Shift+3');
test.key('KeyJ');test.key('KeyU');
const reversed=selected();assert(reversed.shape.headAtStart&&!reversed.shape.both,'переназначенные 3 и Ctrl+3');
const svg=await app.files.worker.run('svg',app.files.snapshot());
const copy=(await app.files.worker.run('native',svg)).objects.find(o=>o.id===cubic.id);
assert(copy.shape.headAtStart&&JSON.stringify(copy.shape.controls)===JSON.stringify(cubic.shape.controls),'сторона и ручки переживают SVG');
app.selection.showObjects([app.doc.get(original.id),reversed]);
test.key('KeyU');assert(app.doc.get(cubic.id)===reversed,'группа не изменяется');
test.key('KeyJ');assert(app.tool.id==='arrow','без одиночной линии включается инструмент');
await app.applyShortcuts({});
return {ok:true};
