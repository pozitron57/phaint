// Переназначенные модификаторы меняют сами жесты, включая сочетание двух режимов.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);},near=(a,b)=>Math.abs(a-b)<.003;
const tool=id=>app.selectTool(id,false),last=()=>[...app.doc.values()].at(-1);
const pointer=(type,x,y,mods={})=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',mods);
const drag=async(a,b,mods={})=>{pointer('pointerdown',...a,mods);pointer('pointermove',...b,mods);pointer('pointerup',...b,mods);await test.idle();};
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const reset=async()=>{app.input.cancelCurrent();app.input.clearModifiers();tool('pen');app.doc.replace([]);app.history.clear();origin();await test.idle();};
await app.applyShortcuts({
 'gesture.grid':['Shift'],'gesture.angle':['Alt'],'gesture.marker':['Alt'],
 'gesture.ellipse':['Cmd'],'gesture.parabola':['Alt'],'gesture.addSelection':['Cmd'],
 'gesture.resizeFree':['Ctrl'],'gesture.resizeCenter':['Shift'],'gesture.rotate':['Alt'],
 'gesture.pivotFree':['Ctrl'],'gesture.zoom':['Alt'],'gesture.bezier':['Ctrl+Shift'],
});
app.settings.snapToGrid=true;app.settings.grid.enabled=false;origin();
// Центр свободен с новым Shift, Cmd задаёт независимые полуоси. Старый Alt центр не отпускает.
tool('ellipse');await drag([133,251],[253,311],{shiftKey:true,metaKey:true});
assert(near(last().ox,133)&&near(last().oy,251)&&near(last().shape.length,120)&&near(last().shape.height,60),'переназначенные сетка и эллипс совместимы');
await drag([133,251],[253,311],{altKey:true});assert(near(last().ox,144)&&near(last().oy,240),'старый модификатор сетки отключён');
// Привязка и угол по-прежнему независимы, начало после отпускания не меняется.
tool('line');pointer('pointerdown',133,251,{shiftKey:true});pointer('pointermove',333,299,{shiftKey:true,altKey:true});
let line=app.tool.object(0,0);assert(near(line.ox,133)&&near(Math.atan2(line.pts[4],line.pts[3]),Math.PI/12),'новый Alt ограничивает угол при свободном начале');
pointer('pointerup',333,299,{altKey:true});line=last();assert(near(line.ox,133)&&near(Math.hypot(line.pts[3],line.pts[4])/24,Math.round(Math.hypot(line.pts[3],line.pts[4])/24)),'возврат сетки фиксирует длину, не начало');
// Прямой маркер можно включить уже после нескольких точек, не двигая перо.
await reset();app.settings.snapToGrid=false;tool('marker');pointer('pointerdown',200,250);pointer('pointermove',250,320);pointer('pointermove',400,250);
test.key('AltLeft');pointer('pointerup',400,250);up('AltLeft');assert(last().marker&&last().pts.length===6&&near(last().pts[4],0),'новый модификатор выпрямляет маркер');
await test.pen([[200,350,.5],[250,420,.5],[400,350,.5]],2);assert(last().pts.length>6,'свободный маркер сохраняет траекторию');
// Парабола: новый модификатор работает и во втором жесте.
await reset();tool('parabola');await drag([200,350],[500,410]);
await drag([350,280],[350,220],{altKey:true});assert(near(last().shape.height,0),'новый модификатор выравнивает концы параболы');
// Группа выделяется новым Cmd; прежний Shift не добавляет объект.
await reset();tool('ellipse');await drag([300,300],[350,300]);const first=last();await drag([550,300],[600,300]);const second=last();
tool('select');app.selection.show(first);await drag([600,300],[600,300],{metaKey:true});assert(app.selection.objects.length===2,'новый модификатор добавляет объект');
await drag([350,300],[350,300],{metaKey:true});assert(app.selection.objects.length===1&&app.selection.selected.id===second.id,'повторное касание убирает объект из группы');
app.selection.show(first);let b=app.selection.screenBox(),cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;
await drag([b.maxX,b.maxY],[cx+(b.maxX-cx)*2,cy+(b.maxY-cy)*1.5],{ctrlKey:true,shiftKey:true});
let changed=app.selection.selected;assert(near(changed.shape.frame.a,2)&&near(changed.shape.frame.d,1.5)&&near(changed.ox,first.ox)&&near(changed.oy,first.oy),'размер от центра и свободные пропорции используют новые клавиши');
// Центр можно поставить рядом с углом без прилипания новым Ctrl.
b=app.selection.screenBox();let pivot=app.selection.handles().find(h=>h.name==='pivot');const target={x:b.minX+3,y:b.minY+3};
await drag([pivot.point.x,pivot.point.y],[target.x,target.y],{ctrlKey:true});assert(near(app.selection.pivot.x,target.x)&&near(app.selection.pivot.y,target.y),'новый модификатор отключает прилипание центра');
app.selection.show(changed);pivot=app.selection.center();const handle=app.selection.handles().find(h=>h.name==='rotate').point;
const angle=20*Math.PI/180,dx=handle.x-pivot.x,dy=handle.y-pivot.y;
await drag([handle.x,handle.y],[pivot.x+dx*Math.cos(angle)-dy*Math.sin(angle),pivot.y+dx*Math.sin(angle)+dy*Math.cos(angle)],{altKey:true});
changed=app.selection.selected;assert(near(Math.atan2(changed.shape.frame.b,changed.shape.frame.a),Math.PI/12),'новый модификатор ограничивает поворот');
// Колесо с новым Alt масштабирует, с прежним физическим Ctrl — прокручивает. Щипок сохранён.
app.selection.show(null);test.key('AltLeft');const scale=app.view.scale;test.wheel(500,300,0,-20);up('AltLeft');assert(app.view.scale>scale,'новый модификатор масштаба');
test.key('ControlLeft');const zoomed=app.view.scale,ty=app.view.ty;test.wheel(500,300,0,20,true);up('ControlLeft');assert(app.view.scale===zoomed&&app.view.ty!==ty,'старый физический Ctrl не масштабирует');
test.wheel(500,300,0,-20,true);assert(app.view.scale>zoomed,'щипок трекпада продолжает работать');
await test.idle();await test.shot('transformed');return {ok:true,gestures:12};
