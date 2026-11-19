// Общая привязка, компактный шаблон сетки и сохранение целых выбранных объектов.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);},near=(a,b)=>Math.abs(a-b)<.002;
const tool=id=>app.selectTool(id,false),last=()=>[...app.doc.values()].at(-1);
const pointer=(type,x,y)=>test.pointer(type,x,y,type==='pointerup'?0:.5);
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const drag=async(a,b)=>{pointer('pointerdown',...a);pointer('pointermove',...b);pointer('pointerup',...b);await test.idle();};
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const choose=choices=>native.testFiles('choices',{choices}),read=name=>native.testFiles('read',{name});
const approveSvg=()=>{const dialog=document.querySelector('.export-dialog');assert(dialog,'показаны настройки SVG');[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Сохранить').click();};
const saveSelected=()=>{const saving=app.files.save();approveSvg();return saving;};
const prepare=(name,text)=>native.testFiles('prepare',{name,text});
const reset=async()=>{app.input.cancelCurrent();tool('pen');app.doc.replace([]);app.history.clear();origin();await test.idle();};
const worldPixel=(x,y)=>{const p=app.view.toScreen(x,y);return [...document.querySelector('#scene').getContext('2d').getImageData(Math.round(p.x*app.view.dpr),Math.round(p.y*app.view.dpr),1,1).data];};
const white=(x,y)=>worldPixel(x,y).slice(0,3).every(n=>n>245);
const check=(label)=>[...app.panels.background.el.querySelectorAll('label')].find(e=>e.textContent===label).querySelector('input');
assert(app.settings.snapToGrid,'привязка по умолчанию');origin();
test.key('F5');const snap=check('Привязка к сетке по умолчанию');
snap.click();assert(!app.settings.snapToGrid&&!app.files.dirty,'режим привязки — настройка приложения, не изменение документа');
const saveSettings=app.platform.saveSettings;let stored;
app.platform.saveSettings=async value=>{stored=structuredClone(value);};await app.flushSettings();app.platform.saveSettings=saveSettings;
assert(stored.snapToGrid===false,'обратный режим передаётся в сохранение настроек');
snap.click();app.closePanels();app.settings.grid.enabled=false;
for(const id of ['line','arrow','coordinates','ellipse']){
 tool(id);pointer('pointerdown',133,251);pointer('pointermove',281,302);
 let preview=app.tool.object(0,0);
 assert(near(preview.ox,144)&&near(preview.oy+(id==='coordinates'?preview.shape.height:0),240),`${id}: начало/центр на скрытой сетке`);
 test.key('AltLeft');preview=app.tool.object(0,0);
 assert(near(preview.ox,144)&&near(preview.oy+(id==='coordinates'?preview.shape.height:0),240),`${id}: Alt после касания не меняет начало`);
 if(id==='line'||id==='arrow'){
  assert(near(preview.ox+preview.pts[3],281)&&near(preview.oy+preview.pts[4],302),'Alt отпускает конец');
  test.key('ShiftLeft');
  preview=app.tool.object(0,0);const snappedAngle=Math.atan2(preview.pts[4],preview.pts[3]);up('AltLeft');
  preview=app.tool.object(0,0);assert(near(snappedAngle,Math.PI/12)&&near(Math.atan2(preview.pts[4],preview.pts[3]),snappedAngle),'Shift держит 15° при переключении сетки');
  assert(near(Math.hypot(preview.pts[3],preview.pts[4]),168),'длина с Shift кратна клетке');up('ShiftLeft');
 }else if(id==='ellipse'){
  test.key('ShiftLeft');preview=app.tool.object(0,0);
  assert(near(preview.shape.length,137)&&near(preview.shape.height,62),'Shift задаёт полуоси от привязанного центра');up('ShiftLeft');up('AltLeft');
 }else up('AltLeft');
 pointer('pointerup',281,302);await test.idle();
 // Свободное начало остаётся свободным при отпускании Alt.
 test.key('AltLeft');pointer('pointerdown',397,395);pointer('pointermove',541,446);up('AltLeft');preview=app.tool.object(0,0);
 assert(near(preview.ox,397)&&near(preview.oy+(id==='coordinates'?preview.shape.height:0),395),`${id}: позднее включение привязки не двигает начало`);
 pointer('pointerup',541,446);await test.idle();
}
app.settings.snapToGrid=false;tool('ellipse');test.key('AltLeft');await drag([613,251],[760,300]);up('AltLeft');assert(near(last().ox,624)&&near(last().oy,240),'обратный режим: Alt привязывает центр окружности');
// F5 управляет видом; выбор включения сетки в экспорт перенесён в Cmd+E.
test.key('F5');check('Показывать сетку').click();assert(!document.body.textContent.includes('Сохранять сетку в файл'),'в F5 нет настройки экспорта');
assert(app.settings.grid.save,'рабочий SVG сохраняет сетку по умолчанию');await choose({saves:['сетка.svg']});assert(await app.files.save(),'сетка сохранена');
let svg=await read('сетка.svg');assert(svg.includes('data-phaint-grid="true"')&&svg.includes('<pattern'),'сетка записана компактным шаблоном');
assert((await app.files.worker.run('native',svg)).grid.save,'metadata содержит флажок');
check('Показывать сетку').click();
await choose({saves:['без-сетки.svg']});assert(await app.files.save(true),'SVG без сетки');assert(!(await read('без-сетки.svg')).includes('data-phaint-grid'),'скрытой сетки нет в файле');app.closePanels();
await choose({opens:['сетка.svg']});assert(await app.files.open()&&app.settings.grid.save,'открытие восстанавливает флажок');
// Рамка выбирает только целые объекты; сохранение не обрезает пересекающие.
await reset();app.settings.grid.enabled=false;
tool('line');await drag([120,240],[820,240]);const crossing=last();
tool('arrow');await drag([330,330],[650,330]);const arrow=last();
tool('pen');await test.pen([[420,190,.5],[500,200,.5]],3);await test.idle();const ink=last();
await choose({saves:['полный.svg']});assert(await app.files.save(true),'сохранён полный рисунок');
const full=await read('полный.svg'),state=app.history.state,name=app.files.name;
tool('select');await drag([210,175],[760,380]);
assert(app.selection.objects.length===2&&!app.selection.objects.includes(crossing),'рамка выбирает целые объекты');
assert(!app.selection.exportArea,'область экспорта не сохраняется');await test.shot('selected');
await choose({saves:[null]});assert(!await saveSelected()&&!app.files.dirty&&app.selection.objects.length===2,'отмена не меняет выделение и документ');
await choose({saves:['полный.svg']});assert(!await saveSelected()&&(await read('полный.svg'))===full,'выделение не затирает полный файл');
await choose({saves:['выделение.svg']});test.key('KeyS',{metaKey:true});approveSvg();for(let i=0;i<500&&app.files.busy;i++)await test.sleep(10);
assert(!app.files.busy&&app.files.name===name&&!app.files.dirty&&app.history.state===state&&app.doc.size===3,'экспорт не меняет полный документ');
svg=await read('выделение.svg');let restored=await app.files.worker.run('native',svg);
assert(restored.objects.length===2&&restored.objects.every(o=>!o.clip),'только целые выбранные объекты');
assert(restored.objects.some(o=>o.id===arrow.id&&o.shape.kind==='arrow')&&restored.objects.some(o=>o.id===ink.id),'параметры стрелки и пера сохранены');
assert((await read('полный.svg'))===full,'исходный файл не изменён');
// Начало рамки дальше расширенного допуска клика по тонкой линии.
test.key('Escape');await drag([250,205],[650,275]);assert(!app.selection.objects.length&&!app.selection.exportArea,'пустая рамка исчезла');
assert(await app.files.save()&&!app.files.dirty,'без выбранных объектов обычное сохранение');
restored=await app.files.worker.run('native',await read('полный.svg'));assert(restored.objects.length===3,'сохранены все объекты');
app.selection.show(arrow);test.key('KeyA',{metaKey:true});assert(app.selection.objects.length===3,'Cmd+A выбирает всё');
await choose({saves:['все.svg']});assert(await saveSelected(),'всё выделенное — отдельный SVG');
restored=await app.files.worker.run('native',await read('все.svg'));assert(restored.objects.length===3,'все объекты целиком');
// Сохранение при закрытии/создании нового всегда записывает полный рисунок.
app.selection.show(arrow);app.selection.recolor('#c9514e');await choose({unsaved:['save']});assert(await app.files.newDocument(),'новый после сохранения');
restored=await app.files.worker.run('native',await read('полный.svg'));assert(restored.objects.length===3,'сохранение по запросу закрытия — весь документ');
return {ok:true,expectedErrors:await native.testFiles('errors')};
