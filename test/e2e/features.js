// Совместные сценарии инструментов, выделения, преобразований, ползунков и SVG.
const {app,test}=window.__phaint;
// Геометрия прежних сценариев — без автоматической привязки; оба режима проверяет grid-crop.
app.settings.snapToGrid=false;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const last=()=>[...app.doc.values()].at(-1);
const tool=id=>app.selectTool(id,false);
const upKey=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const pointer=(type,x,y,mods={})=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',mods);
const drag=async(a,b,mods={})=>{pointer('pointerdown',...a,mods);pointer('pointermove',...b,mods);pointer('pointerup',...b,mods);await test.idle();};
const reset=async()=>{app.input.cancelCurrent();app.history.clear();app.doc.replace([]);app.view.reset();app.settings.grid.enabled=false;app.renderer.invalidateScene();await test.idle();};
const pixel=(x,y)=>document.getElementById('scene').getContext('2d').getImageData(Math.round(x*app.view.dpr),Math.round(y*app.view.dpr),1,1).data;
assert(!app.settings.input.predict,'прогноз выключен по умолчанию');
test.key('Tab');assert(app.ink.color==='#79ad65','Tab: синий → зелёный');test.key('Tab');assert(app.ink.color==='#c9514e','красный');test.key('Tab');assert(app.ink.color==='#315ca8','цикл из трёх');
app.palette.toggle();app.palette.el.querySelectorAll('button')[3].click();assert(app.ink.color==='#000000','чёрный в полной палитре');test.key('Tab');assert(app.ink.color==='#315ca8','из чёрного Tab начинает с синего');
test.key('KeyL');assert(app.tool.id==='line','L');test.key('KeyL');assert(app.tool.id==='pen','повтор L возвращает ручку');test.key('KeyE');test.key('KeyE');assert(app.tool.id==='pen','повтор E');
const scale=app.view.scale;test.key('Equal');assert(app.view.scale>scale,'= увеличивает');test.key('Minus');assert(app.view.scale===scale,'- уменьшает');
// Ползунок не теряет захват, когда перо далеко выше его полосы.
app.togglePanel('brush');
const label=[...app.panels.brush.el.querySelectorAll('label')].find(e=>e.textContent.includes('Сглаживание'));
const range=label.querySelector('input'),r=range.getBoundingClientRect();
range.dispatchEvent(new PointerEvent('pointerdown',{pointerId:77,button:0,clientX:r.left+20,clientY:r.top+5,bubbles:true,cancelable:true}));
window.dispatchEvent(new PointerEvent('pointermove',{pointerId:77,buttons:1,clientX:r.right-20,clientY:r.top-180,bubbles:true,cancelable:true}));
assert(app.settings.pen.smoothing>.8,'ползунок продолжает тащиться выше полосы');
window.dispatchEvent(new PointerEvent('pointerup',{pointerId:77,bubbles:true}));app.closePanels();app.settings.pen.smoothing=0;
await reset();tool('line');app.settings.line.width=4;
pointer('pointerdown',200,200);pointer('pointermove',500,270);test.key('ShiftLeft');test.key('Tab',{shiftKey:true});assert(app.palette.open&&!app.palette.el.querySelector('.palette-label').hidden,'Shift+Tab открывает палитру в фигуре');app.palette.el.querySelectorAll('button')[2].click();assert(app.settings.line.color==='#c9514e','цвет живой фигуры из полной палитры');test.key('Tab',{shiftKey:true});test.key('F2',{shiftKey:true});assert(app.settings.line.width>4,'F2 работает при удержании Shift');test.key('F1',{shiftKey:true});await test.idle();pointer('pointerup',500,270);upKey('ShiftLeft');
const snapped=last();assert(Math.abs(Math.atan2(snapped.pts[4],snapped.pts[3])*180/Math.PI-15)<.01,'Shift: угол 15°');
tool('ellipse');await drag([750,250],[830,280]);const circle=last();assert(Math.abs(circle.bbox.maxX-circle.bbox.minX-(circle.bbox.maxY-circle.bbox.minY))<.1,'O: окружность от центра');
test.key('ShiftLeft');await drag([750,450],[870,490]);upKey('ShiftLeft');const ellipse=last();assert(ellipse.bbox.maxX-ellipse.bbox.minX>2*(ellipse.bbox.maxY-ellipse.bbox.minY),'Shift: эллипс');
tool('arrow');app.settings.arrow.width=5;await drag([250,400],[550,450]);const arrow=last();
tool('select');app.selection.show(arrow);app.changeArrow('headLength',8);app.changeArrow('headWidth',5);app.changeArrow('both',true);
assert(app.selection.selected.shape.both&&app.settings.arrow.headLength===8,'головка меняется у выбранной и будущих стрелок');
tool('arrow');await drag([250,500],[550,550]);assert(last().shape.both,'следующая стрелка с двумя головками');
await test.shot('shapes');
// Временная группа, одна отмена переноса, поворот и отражение с сохранением толщины.
await reset();tool('line');app.settings.line.width=4;
await drag([250,220],[430,240]);await drag([250,320],[430,340]);await drag([800,500],[1000,600]);
tool('select');app.selection.show([...app.doc.values()][0]);await drag([340,230],[340,230],{metaKey:true});assert(app.selection.objects.length===0,'Cmd-клик в центре снимает объект, не перетаскивает центр поворота');
await drag([200,180],[500,280]);assert(app.selection.objects.length===1,'рамка выбирает только целиком попавшие объекты');await drag([200,280],[500,390],{metaKey:true});assert(app.selection.objects.length===2,'Cmd-рамка добавляет объект к группе');
const old=app.selection.objects.map(o=>({id:o.id,ox:o.ox,oy:o.oy}));
await drag([300,270],[370,310]);assert(app.selection.objects.every((o,i)=>o.ox===old[i].ox+70),'перенос всей группы за промежуток');
test.key('KeyZ',{metaKey:true});assert(app.selection.objects.every((o,i)=>o.ox===old[i].ox),'перенос отменён одним шагом');
const pivotAfterUndo=app.selection.handles().find(h=>h.name==='pivot').point,boxAfterUndo=app.selection.screenBox();assert(Math.abs(pivotAfterUndo.y-(boxAfterUndo.minY+boxAfterUndo.maxY)/2)<.01,'после отмены центр поворота остаётся в центре группы');
test.key('BracketRight');assert(app.selection.objects.length===2,'поворот сохраняет группу');
test.key('Comma');test.key('Period',{shiftKey:true});
const b=app.selection.screenBox();const oldPts=app.selection.objects[0].pts.slice();
await drag([b.maxX,b.maxY],[b.minX-120,b.maxY+50],{shiftKey:true});
assert(app.selection.objects[0].pts[2]===4,'толщина сохраняется при отражении');
assert(Math.sign(app.selection.objects[0].pts[3])!==Math.sign(oldPts[3]),'перетаскивание через угол отражает');
await test.shot('selection');test.key('Escape');assert(app.selection.objects.length===0,'Esc снимает выделение');
// Синусоида растёт до пера, неполный период сохраняется; M меняет амплитуду.
await reset();tool('sine');await drag([200,300],[450,300]);assert(Math.abs(last().shape.cycles-250/app.settings.sine.period)<1e-8,'неполный второй период');
tool('select');app.selection.show(last());const ah=app.selection.handles().find(h=>h.name==='amplitude');
await drag([ah.point.x,ah.point.y],[ah.point.x,ah.point.y-50]);assert(app.selection.selected.shape.amplitude>70,'M меняет амплитуду');
tool('parabola');await drag([600,400],[1000,500]);assert(app.tool.pending&&app.doc.size===1,'парабола ждёт второго жеста');
await drag([800,250],[800,210]);assert(app.doc.size===2&&last().shape.bend<0,'парабола фиксируется вторым жестом');
await test.shot('curves');
// Маркер: один контур не темнеет сам в себе; отдельные проходы усиливают цвет.
await reset();tool('marker');app.settings.marker.color='#79ad65';app.settings.marker.width=48;
await test.pen([[200,200,.2],[600,200,.8],[400,200,.4],[600,200,.7]],2);await test.idle();
const once=Array.from(pixel(350,200));const single=Array.from(pixel(250,200));assert(Math.abs(once[0]-single[0])<=1,'самопересечение не темнеет');
await test.pen([[200,200,.3],[600,200,.6]],2);await test.idle();const twice=Array.from(pixel(350,200));assert(twice[0]<once[0]-20,'второй проход темнее');
await test.pen([[200,200,.3],[600,200,.6]],2);await test.idle();assert(pixel(350,200)[0]<twice[0],'третий проход темнее');
test.key('ShiftLeft');await test.pen([[200,350,.2],[350,500,.8],[600,350,.5]],2);upKey('ShiftLeft');await test.idle();assert(last().pts.length===6,'Shift-маркер прямой');
await test.shot('marker');
// Разбор простого SVG: отдельные пути, выбор по контурам, фон не мешает рамке.
const native=window.phaintNative;
const source='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/><g transform="translate(20 10)"><path d="M100 100H250V120H100Z"/><path d="M400 300H550V320H400Z"/></g></svg>';
await native.testFiles('prepare',{name:'части.svg',text:source});await native.testFiles('choices',{choices:{opens:['части.svg'],unsaved:['discard']}});assert(await app.files.open(),'импорт SVG');await test.idle();
assert([...app.doc.values()].every(o=>o.kind==='vector')&&app.doc.size===3,'SVG разделён на пути');
const piece=[...app.doc.values()][1],mid=app.view.toScreen((piece.bbox.minX+piece.bbox.maxX)/2,(piece.bbox.minY+piece.bbox.maxY)/2);
tool('select');await drag([mid.x,mid.y],[mid.x+30,mid.y+10]);assert(app.selection.objects.length===1,'M выбирает отдельный путь');
app.settings.grid.enabled=true;app.settings.grid.save=true;app.renderer.invalidateScene();
test.key('Escape'); // Полный документ: новое Cmd+S с выделением сохраняет только его.
await native.testFiles('choices',{choices:{saves:['новые-функции.svg']}});assert(await app.files.save(true),'сохранение');
const saved=await native.testFiles('read',{name:'новые-функции.svg'});assert(saved.includes('data-phaint-grid'),'сетка есть в видимом SVG');
await native.testFiles('choices',{choices:{opens:['новые-функции.svg']}});assert(await app.files.open(),'повторное открытие');await test.idle();assert(app.doc.size===3,'сетка не стала дополнительным объектом');
return {ok:true,marker:{once,twice},imported:app.doc.size};
