// Ctrl+перетаскивание, ручки M, неизменные концы, отмена и SVG на настоящих PointerEvent.
const {app,test}=window.__phaint;
// Геометрия прежних сценариев — без автоматической привязки; оба режима проверяет grid-crop.
app.settings.snapToGrid=false;
const assert=(v,message)=>{if(!v)throw new Error(message);},close=(a,b)=>Math.abs(a-b)<.002;
const last=()=>[...app.doc.values()].at(-1),tool=id=>app.selectTool(id,false);
const keyUp=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const pointer=(type,x,y)=>test.pointer(type,x,y,type==='pointerup'?0:.5);
const drag=async(a,b)=>{pointer('pointerdown',...a);pointer('pointermove',...b);pointer('pointerup',...b);await test.idle();};
const controlDrag=async(a,b)=>{test.key('ControlLeft');await drag(a,b);keyUp('ControlLeft');};
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.settings.grid.enabled=false;origin();
Object.assign(app.settings.line,{width:5,color:'#315ca8',dashed:false});
Object.assign(app.settings.arrow,{width:7,color:'#79ad65',dashed:false,headType:'filled',headLength:7,headWidth:5,both:false});

for(const [kind,y] of [['line',250],['arrow',580]]){
  tool(kind);await drag([260,y],[880,y]);const straight=last(),id=straight.id,before=app.history.state;
  test.key('ControlLeft');await drag([470,y-140],[470,y-140]);keyUp('ControlLeft');
  assert(last().shape.controls.length===1,'Ctrl+клик ставит контрольную точку без движения');
  test.key('KeyZ');assert(app.doc.get(id)===straight&&app.history.state===before,'одна отмена убирает поставленную точку');
  test.key('ControlLeft');pointer('pointerdown',470,y-140);pointer('pointermove',480,y-170);
  await test.idle();assert(app.doc.size===(kind==='line'?1:2),'изгиб меняет тот же объект');
  assert(last().shape.controls.length===1&&app.input.drawing,'первая точка видна ещё до отрыва');
  assert(last().id===id&&last().pts.at(-3)===620&&last().pts.at(-2)===0,'концы остаются на месте');
  if(kind==='arrow')await test.shot('arrow-live');
  keyUp('ControlLeft');pointer('pointermove',500,y-180);pointer('pointerup',500,y-180);await test.idle();
  assert(app.tool.id===kind&&last().shape.controls.length===1,'отпускание Ctrl не обрывает жест и не меняет инструмент');
  const quadratic=last();
  await controlDrag([660,y+80],[700,y+150]);const cubic=last();
  assert(cubic.shape.controls.length===2&&close(cubic.shape.controls[1].x,440),'вторая контрольная точка');
  test.key('KeyZ');assert(app.doc.get(id)===quadratic,'отмена второго жеста возвращает первую кривую');
  test.key('KeyZ');assert(app.doc.get(id)===straight,'отмена первого жеста возвращает прямую');
  test.key('KeyY');test.key('KeyY');assert(app.doc.get(id)===cubic,'повтор возвращает обе точки');
  test.key('ControlLeft');pointer('pointerdown',700,y+150);pointer('pointermove',740,y+90);test.key('Escape',{ctrlKey:true});keyUp('ControlLeft');pointer('pointerup',740,y+90);
  assert(app.doc.get(id)===cubic,'Esc отменяет только текущий изгиб');
}
await test.shot('curves');

// M: ручки переносятся с сохранением точки захвата; конец стрелки — именно конец кривой.
const arrow=last();tool('select');app.selection.show(arrow);
let handle=app.selection.handles().find(h=>h.name==='control2').point;
await drag([handle.x+2,handle.y+1],[handle.x+42,handle.y-29]);
let edited=app.selection.selected;assert(close(edited.shape.controls[1].x,480)&&close(edited.shape.controls[1].y,120),'ручка M без скачка под указатель');
const oldEnd={x:edited.pts.at(-3),y:edited.pts.at(-2)},controls=JSON.stringify(edited.shape.controls);
handle=app.selection.handles().find(h=>h.name==='endpoint').point;
await drag([handle.x,handle.y],[handle.x+50,handle.y+20]);edited=app.selection.selected;
assert(close(edited.pts.at(-3),oldEnd.x+50)&&close(edited.pts.at(-2),oldEnd.y+20)&&JSON.stringify(edited.shape.controls)===controls,'конец кривой двигается независимо от ручек');
test.key('Period');handle=app.selection.handles().find(h=>h.name==='control1').point;
await drag([handle.x,handle.y],[handle.x+30,handle.y-15]);
await test.shot('handles');

// В M Cmd выбирает, Ctrl добавляет точки старой прямой после открытия SVG.
tool('line');await drag([180,780],[620,780]);
const oldDrawing=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));
app.doc.replace(oldDrawing.objects);app.history.clear();let selected=last();tool('select');app.selection.show(selected);
test.key('MetaLeft');await drag([300,780],[300,780]);keyUp('MetaLeft');assert(!app.selection.objects.length,'Cmd+клик снимает выделение');
app.selection.show(selected);test.key('MetaLeft');await drag([300,780],[340,650]);keyUp('MetaLeft');
assert(!app.doc.get(selected.id).shape.controls,'Cmd+перетаскивание в M не изгибает линию');
app.selection.show(selected);
await controlDrag([310,700],[340,650]);const first=app.selection.selected;
assert(first.id===selected.id&&first.shape.controls.length===1&&app.doc.size===3,'Ctrl добавляет первую точку старой выбранной прямой');
test.key('ControlLeft');pointer('pointerdown',480,790);keyUp('ControlLeft');pointer('pointermove',500,830);pointer('pointerup',500,830);await test.idle();
const second=app.selection.selected;
assert(second.shape.controls.length===2&&close(second.shape.controls[1].x,320),'вторая точка M продолжает двигаться после отпускания Ctrl');
test.key('KeyZ');assert(app.selection.selected===first,'одна отмена второго жеста в M');test.key('KeyY');
test.key('ControlLeft');pointer('pointerdown',500,830);pointer('pointermove',540,780);test.key('Escape',{ctrlKey:true});keyUp('ControlLeft');pointer('pointerup',540,780);
assert(app.doc.get(second.id)===second,'Ctrl+Esc откатывает текущую правку выбранной кривой');
app.selection.show(second);app.view.panBy(0,-300);await test.idle();await test.shot('old-line-controls');origin();await test.idle();
const snapshot=app.files.snapshot(),svg=await app.files.worker.run('svg',snapshot),restored=await app.files.worker.run('native',svg);
assert(restored.objects.length===3&&restored.objects.every(o=>o.shape.controls.length===2),'обе точки всех кривых восстановлены из SVG');
assert(restored.objects.every((o,i)=>Object.entries(snapshot.objects[i].shape).every(([key,value])=>JSON.stringify(o.shape[key])===JSON.stringify(value))),'матрицы, головки и ручки не потеряны');
app.doc.replace(restored.objects);tool('select');app.selection.show([...app.doc.values()][1]);await test.idle();await test.shot('reopened');
// Поворот и масштаб вида не влияют на координаты ручек.
app.view.restore({x:600,y:500,scale:1.6,rotSteps:1});await test.idle();
handle=app.selection.handles().find(h=>h.name==='control2').point;
await drag([handle.x,handle.y],[handle.x+40,handle.y+20]);assert(app.selection.selected.shape.controls.length===2,'ручки работают после поворота вида');
origin();await test.idle();
// Shift с самого касания продолжает ограничивать угол, Alt — привязывать начало к сетке.
const curveCount=app.doc.size;tool('line');await drag([220,160],[480,160]);
test.key('ShiftLeft');await drag([220,340],[510,401]);keyUp('ShiftLeft');
assert(app.doc.size===curveCount+2&&!last().shape.controls&&close(Math.atan2(last().pts[4],last().pts[3]),Math.PI/12),'Shift при начале следующей линии сохраняет шаг угла');
app.settings.grid.step=24;test.key('AltLeft');await drag([221,481],[509,553]);keyUp('AltLeft');
assert(app.doc.size===curveCount+3&&last().ox===216&&last().oy===480&&!last().shape.controls,'Alt при начале следующей линии сохраняет сетку');
test.key('ShiftLeft');await drag([220,640],[510,670]);keyUp('ShiftLeft');
assert(app.doc.size===curveCount+4&&!last().shape.controls,'Shift в L больше не создаёт контрольные точки');
// Реальный флаг macOS в PointerEvent работает и без отдельного события клавиатуры.
test.pointer('pointerdown',400,570,.5,'pen',{ctrlKey:true});test.pointer('pointermove',430,560,.5,'pen',{ctrlKey:true});test.pointer('pointerup',430,560,0,'pen',{ctrlKey:true});await test.idle();
assert(last().shape.controls.length===1,'Ctrl распознаётся непосредственно из события пера');
for(let i=0;i<5;i++)test.key('KeyZ');
assert(app.doc.size===curveCount,'проверка сочетаний не меняет исходные кривые');
tool('select');app.selection.show([...app.doc.values()][1]);await test.idle();return {ok:true,curves:app.doc.size};
