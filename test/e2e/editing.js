// Краевые случаи: прозрачность после стирания/растяжения, головки, настройки и внешний SVG.
const {app,test}=window.__phaint;
// Геометрия прежних сценариев — без автоматической привязки; оба режима проверяет grid-crop.
app.settings.snapToGrid=false;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const tool=id=>app.selectTool(id,false);
const last=()=>[...app.doc.values()].at(-1);
const pointer=(type,x,y,mods={})=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',mods);
const drag=async(a,b,mods={})=>{pointer('pointerdown',...a,mods);pointer('pointermove',...b,mods);pointer('pointerup',...b,mods);await test.idle();};
const pixel=(x,y)=>Array.from(document.getElementById('scene').getContext('2d').getImageData(Math.round(x*app.view.dpr),Math.round(y*app.view.dpr),1,1).data);
const reset=async(grid=false)=>{app.input.cancelCurrent();app.closePanels();app.doc.replace([]);app.history.clear();app.view.reset();app.settings.grid.enabled=grid;app.settings.grid.save=false;app.renderer.invalidateScene();await test.idle();};
const rendered=async(svg,x,y)=>{
 const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
 const [left,top,w,h]=root.getAttribute('viewBox').split(' ').map(Number);
 const img=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));img.src=url;await img.decode();
 const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,w,h);g.drawImage(img,0,0);URL.revokeObjectURL(url);
 return Array.from(g.getImageData(Math.floor(x-left),Math.floor(y-top),1,1).data);
};
await reset(true);app.settings.pen.smoothing=0;
tool('line');app.settings.line.color='#000000';app.settings.line.width=5;await drag([350,180],[350,300]);
tool('marker');await test.pen([[200,240,.1],[600,240,.8],[300,240,.3],[600,240,.8]],3);await test.idle();
assert(pixel(350,240)[0]===0,'маркер не осветляет чёрные линии');
const stripe=pixel(300,245),grid=pixel(288,245);
assert(grid[0]<stripe[0],'сетка видна под маркером');
app.settings.grid.enabled=false;app.renderer.invalidateScene();await test.idle();assert(Math.abs(pixel(288,245)[0]-stripe[0])<2,'отключение сетки обновляет плитки маркера');
// Непропорциональное изменение размера растягивает всю полосу, включая концы.
tool('select');app.selection.show(last());let b=app.selection.screenBox();
await drag([b.maxX,b.maxY],[b.minX+2*(b.maxX-b.minX),b.minY+1.5*(b.maxY-b.minY)],{shiftKey:true});
const marker=app.selection.selected;assert(Math.abs(marker.matrix.a-2)<.001&&Math.abs(marker.matrix.d-1.5)<.001,'маркер растянут целиком');
const before=pixel(600,255);tool('eraser');app.settings.eraser.width=24;await drag([500,180],[500,330]);
assert(![...app.doc.values()].some(o=>o.marker)&&pixel(600,255)[0]===255,'касание удаляет весь растянутый маркер');
test.key('KeyZ');await test.idle();assert(String(pixel(600,255))===String(before),'одна отмена возвращает полосу без изменения прозрачности');
// Совместимость с масками маркера, сохранёнными до версии 0.6.1.
const matrix=marker.matrix,inv=new DOMMatrix([matrix.a,matrix.b,matrix.c,matrix.d,matrix.e+marker.ox,matrix.f+marker.oy]).inverse();
const legacy={...marker,erasures:[[500,180,500,330,12,inv.a,inv.b,inv.c,inv.d,inv.e,inv.f]]};
app.history.commit({removed:[marker],added:[legacy]});await test.idle();
const data=app.files.snapshot(),svg=await app.files.worker.run('svg',data),own=await app.files.worker.run('native',svg);
assert(own.objects.some(o=>o.marker&&o.matrix&&o.erasures?.length),'преобразование и стирание маркера сохраняются');
const outside=await rendered(svg,600,255),cut=await rendered(svg,500,255);
assert(Math.abs(outside[0]-before[0])<=2&&cut[0]===255,'обычный SVG сохраняет цвет полосы и маску');
await test.shot('marker-transform');
app.settings.eraser.width=4;await drag([500,255],[500,255]);assert([...app.doc.values()].some(o=>o.id===legacy.id),'пустое место старой маски не удаляет маркер');
await drag([600,255],[600,255]);assert(![...app.doc.values()].some(o=>o.id===legacy.id),'видимая часть старого маркера удаляет его целиком');
// Закрашенный наконечник и штриховой стержень. Настройка выбранной стрелки — один Undo.
await reset();tool('arrow');Object.assign(app.settings.arrow,{width:8,headLength:10,headWidth:8,headType:'filled',dashed:true,dashLength:4,dashGap:3,both:false});
await drag([250,220],[650,220]);assert(pixel(270,220)[0]<100&&pixel(294,220)[0]===255,'прерывистый стержень');
assert(pixel(653,220)[0]===255,'стержень не выступает из острия треугольной головки');
const head=pixel(620,230);assert(head[0]<100,'треугольный наконечник заполнен');
tool('select');app.selection.show(last());app.togglePanel('brush');
const label=[...app.panels.brush.el.querySelectorAll('label')].find(e=>e.textContent.includes('Ширина головки'));
const range=label.querySelector('input');range.scrollIntoView({block:'center'});const rect=range.getBoundingClientRect();
range.dispatchEvent(new PointerEvent('pointerdown',{pointerId:67,button:0,clientX:rect.left+60,clientY:rect.top+4,bubbles:true,cancelable:true}));
for(const x of [100,160,200])window.dispatchEvent(new PointerEvent('pointermove',{pointerId:67,buttons:1,clientX:rect.left+x,clientY:rect.top-100,bubbles:true,cancelable:true}));
window.dispatchEvent(new PointerEvent('pointerup',{pointerId:67,bubbles:true}));
const setting=app.settings.arrow.headWidth;assert(setting>8&&app.selection.selected.shape.headWidth===setting,'настройка выбранной стрелки и последующих');
test.key('KeyZ');assert(app.selection.selected.shape.headWidth===8,'одна отмена всего ползунка');app.closePanels();
tool('eraser');await drag([380,180],[380,260]);assert(pixel(380,220)[0]===255&&String(pixel(620,230))===String(head),'стирание стержня сохраняет заполненную головку');
assert(last().kind==='vector'&&last().native,'стёртая фигура становится собственным контуром');
await drag([620,200],[620,250]);assert(pixel(620,230)[0]===255,'обычный ластик стирает оставшийся наконечник');
await test.shot('arrow-erased');
// Группа: возврат указателя к началу, толщина с выключенным флажком, центр поворота.
await reset();tool('line');app.settings.line.width=4;await drag([250,250],[450,270]);await drag([250,350],[450,370]);
tool('select');await drag([200,200],[500,400]);const initial=app.selection.objects.map(o=>({ox:o.ox,oy:o.oy}));
pointer('pointerdown',300,300);pointer('pointermove',400,400);pointer('pointermove',300,300);pointer('pointerup',300,300);
assert(app.selection.objects.every((o,i)=>o.ox===initial[i].ox&&o.oy===initial[i].oy),'возврат пера к началу возвращает группу');
app.settings.selection.keepWidth=false;b=app.selection.screenBox();await drag([b.maxX,b.maxY],[b.minX+2*(b.maxX-b.minX),b.minY+2*(b.maxY-b.minY)]);
assert(app.selection.objects.every(o=>Math.abs(o.pts[2]-8)<.01),'выключенный флажок увеличивает толщину');
const pivot=app.selection.handles().find(h=>h.name==='pivot');await drag([pivot.point.x,pivot.point.y],[250,250],{altKey:true});
const old=app.selection.objects[0],offset={x:old.ox-250,y:old.oy-250};test.key('BracketRight');
assert(Math.abs(app.selection.objects[0].ox-(250-offset.y))<.01&&Math.abs(app.selection.objects[0].oy-(250+offset.x))<.01,'поворот вокруг заданной точки');
await test.shot('pivot');
// Стили исходного SVG, геометрия в отдельных путях; неподдерживаемые эффекты сохраняются целиком.
const native=window.phaintNative,source='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" style="fill:#c9514e"><path d="M100 100H300V200H100Z"/><g transform="translate(100 0)" display="none"><path d="M0 0H50V50Z"/></g><path d="M400 300H600V400H400Z"/></svg>';
await native.testFiles('prepare',{name:'стили.svg',text:source});await native.testFiles('choices',{choices:{opens:['стили.svg'],unsaved:['discard']}});assert(await app.files.open(),'открытие стилей');await test.idle();
assert(app.doc.size===2&&[...app.doc.values()].every(o=>o.kind==='vector'&&o.fill==='rgb(201, 81, 78)'),'стиль корня сохранён, невидимые пути пропущены');
app.settings.grid.enabled=true;app.settings.grid.save=true;await native.testFiles('choices',{choices:{saves:['сетка.svg']}});assert(await app.files.save(true),'сетка сохранена');
await native.testFiles('choices',{choices:{unsaved:['discard']}});assert(await app.files.newDocument()&&app.settings.grid.save,'в новом документе сохранение сетки включено');
app.settings.grid.save=true;app.view.panBy(400,300);const empty=await app.files.worker.run('svg',app.files.snapshot());assert(empty.includes('data-phaint-grid'),'сетка пустого документа сохраняется в области вида');
return {ok:true,marker:stripe,markerSvg:outside,arrowSetting:setting};
