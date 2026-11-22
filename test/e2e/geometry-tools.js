// Alt/Alt+Shift на реальных событиях, гипербола, горячие клавиши и ровный стык головки.
const {app,test}=window.__phaint;
// Геометрия прежних сценариев — без автоматической привязки; оба режима проверяет grid-crop.
app.settings.snapToGrid=false;
const assert=(v,message)=>{if(!v)throw new Error(message);},close=(a,b)=>Math.abs(a-b)<.001;
const last=()=>[...app.doc.values()].at(-1),tool=id=>app.selectTool(id,false);
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const pointer=(type,x,y)=>test.pointer(type,x,y,type==='pointerup'?0:.5);
const drag=async(a,b)=>{pointer('pointerdown',...a);pointer('pointermove',...b);pointer('pointerup',...b);await test.idle();};
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const reset=async()=>{app.input.cancelCurrent();app.closePanels();app.doc.replace([]);app.history.clear();app.files.baseScale=1;origin();await test.idle();};
const ends=o=>({start:[o.ox+o.pts[0],o.oy+o.pts[1]],end:[o.ox+o.pts[3],o.oy+o.pts[4]]});
await reset();app.settings.grid.enabled=true;app.settings.grid.step=24;
for(const id of ['line','arrow']){
  tool(id);test.key('AltLeft');await drag([133,107],[281,158]);up('AltLeft');
  const e=ends(last());assert(e.start.every((n,i)=>close(n,[144,96][i]))&&e.end.every((n,i)=>close(n,[288,168][i])),`${id}: оба конца на сетке`);
  pointer('pointerdown',133,251);pointer('pointermove',281,302);test.key('ShiftLeft');test.key('AltLeft');
  test.key('F2',{shiftKey:true,altKey:true});test.key('Tab',{shiftKey:true,altKey:true});
  pointer('pointerup',281,302);up('AltLeft');up('ShiftLeft');
  const o=last(),dx=o.pts[3],dy=o.pts[4];
  assert(close(Math.atan2(dy,dx),Math.PI/12)&&close(Math.hypot(dx,dy),168),`${id}: Shift+Alt сохраняет 15° и шаг длины`);
  assert(close(o.ox,133)&&close(o.oy,251),`${id}: поздний Alt не перемещает начало`);
  pointer('pointerdown',133,395);pointer('pointermove',281,446);test.key('ShiftLeft');test.key('AltLeft');up('AltLeft');
  pointer('pointerup',281,446);up('ShiftLeft');
  assert(close(last().ox,133)&&close(last().oy,395)&&close(Math.atan2(last().pts[4],last().pts[3]),Math.PI/12),'Alt не меняет исходное начало, Shift сохраняет угол');
  test.key('AltLeft');pointer('pointerdown',133,539);pointer('pointermove',281,590);
  const preview=()=>app.tool.object(0,0);
  assert(close(preview().ox,144)&&close(preview().oy,528),`${id}: Alt при касании привязал начало`);
  up('AltLeft');
  assert(close(preview().ox,144)&&close(preview().oy,528)&&close(preview().ox+preview().pts[3],281),`${id}: после отпускания Alt начало осталось, конец свободен`);
  test.key('ShiftLeft');test.key('AltLeft');
  assert(close(preview().ox,144)&&close(preview().oy,528)&&close(Math.atan2(preview().pts[4],preview().pts[3]),Math.PI/12),`${id}: повторный Alt и Shift сохраняют начало`);
  up('AltLeft');up('ShiftLeft');test.key('F2');
  pointer('pointerup',281,590);await test.idle();
  assert(close(last().ox,144)&&close(last().oy,528)&&close(last().ox+last().pts[3],281)&&close(last().oy+last().pts[4],590),`${id}: фиксированное начало сохраняется после изменения толщины и отрыва`);
}
await test.shot('snapping');
// Сетка остаётся в мировых координатах после поворота и изменения масштаба.
app.view.restore({x:300,y:300,scale:1.7,rotSteps:1});await test.idle();
const a=app.view.toScreen(301,307),b=app.view.toScreen(469,398);tool('line');test.key('AltLeft');await drag([a.x,a.y],[b.x,b.y]);up('AltLeft');
assert(Object.values(ends(last())).flat().every(n=>close(n/24,Math.round(n/24))),'узлы повёрнутой сетки');
test.key('Digit0');assert(app.view.scale===1&&app.view.rotSteps===0,'0 сбрасывает масштаб и поворот');
app.files.baseScale=.45;app.view.zoomAt(300,300,2);test.key('Digit0');assert(close(app.view.scale,.45),'0 учитывает базовый масштаб внешнего SVG как Cmd+0');

// В большом масштабе края стержня ровные до головки при близких наклонах.
await reset();app.settings.grid.enabled=false;tool('arrow');Object.assign(app.settings.arrow,{width:10,headLength:8,headWidth:7,headType:'filled',headRound:.6,dashed:false});
for(let i=0;i<4;i++)await drag([180,130+155*i],[1070,130+155*i+(i-1)*24]);
await test.shot('arrow-joints');

await reset();test.key('KeyH');assert(app.tool.id==='hyperbola','H выбирает гиперболу');
test.key('KeyH');assert(app.tool.id==='arrow','повтор H возвращает предыдущий инструмент');test.key('KeyH');
pointer('pointerdown',200,150);pointer('pointermove',600,500);test.key('F2');test.key('Tab');
await test.frames(2);await test.shot('hyperbola-live');pointer('pointerup',600,500);await test.idle();
let hyperbola=last();assert(hyperbola.shape.kind==='hyperbola'&&hyperbola.shape.length===400,'гипербола фиксируется одним жестом с одинаковым масштабом осей');
assert(hyperbola.color===app.currentColor&&close(hyperbola.pts[2],app.settings.hyperbola.width),'цвет и толщина меняются до отрыва');
await drag([700,150],[880,330]);test.key('Digit2');await drag([960,150],[1140,330]);test.key('Digit2');
const data=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));
assert(data.objects.every(o=>o.shape?.kind==='hyperbola')&&data.objects[2].dash,'параметры гиперболы и штрихи восстановились из SVG');
tool('select');app.selection.show(hyperbola);test.key('Period');hyperbola=app.selection.selected;
const corner=app.selection.handles().find(h=>h.name==='resize'&&h.corner===2).point;
await drag([corner.x,corner.y],[corner.x+40,corner.y+40]);assert(app.selection.selected.shape.kind==='hyperbola','гипербола остаётся фигурой после M/поворота/размера');
tool('pen');await test.shot('hyperbolas');

// Cmd+A охватывает и внешние контуры, и картинку, и объекты за экраном.
const native=window.phaintNative,source='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/><path d="M100 100H250V120H100Z"/><path d="M5000 300H5150V320H5000Z"/></svg>';
await native.testFiles('prepare',{name:'все-объекты.svg',text:source});await native.testFiles('choices',{choices:{opens:['все-объекты.svg'],unsaved:['discard']}});await app.files.open();origin();
tool('hyperbola');await drag([350,220],[570,440]);
const canvas=document.createElement('canvas');canvas.width=canvas.height=40;const g=canvas.getContext('2d');g.fillStyle='#79ad65';g.fillRect(0,0,40,40);
const clipboard=app.platform.clipboardImage;app.platform.clipboardImage=async()=>({dataURL:canvas.toDataURL(),width:40,height:40});app.input.position={x:650,y:200};await app.pasteImage();app.platform.clipboardImage=clipboard;
tool('pen');test.key('KeyA',{metaKey:true});
assert(app.tool.id==='select'&&app.selection.objects.length===4,'Cmd+A выбирает все 4 объекта, включая невидимый за экраном, без белой подложки');
assert(app.selection.objects.some(o=>o.kind==='image')&&app.selection.objects.some(o=>o.kind==='stroke')&&app.selection.objects.some(o=>o.kind==='vector'),'выбраны все виды объектов');
const before=app.doc.size;test.key('Delete');assert(app.doc.size===1,'выделение удаляется целиком');test.key('KeyZ');assert(app.doc.size===before,'удаление отменяется одним шагом');
const field=document.createElement('input');field.value='проверка поля';document.body.append(field);field.focus();app.selectAll();assert(field.selectionStart===0&&field.selectionEnd===field.value.length,'меню выбирает текст в поле');field.remove();
tool('pen');test.key('KeyA',{metaKey:true});await test.idle();await test.shot('select-all');
return {ok:true,selected:app.selection.objects.length};
