// Уточнения 0.6.1: конец стрелки, неполная синусоида, магнит центра и временный Cmd+выбор.
const {app,test}=window.__phaint;
// Геометрия прежних сценариев — без автоматической привязки; оба режима проверяет grid-crop.
app.settings.snapToGrid=false;
const assert=(value,message)=>{if(!value)throw new Error(message);};
const close=(a,b)=>Math.abs(a-b)<.001;
const tool=id=>app.selectTool(id,false);
const last=()=>[...app.doc.values()].at(-1);
const byId=id=>[...app.doc.values()].find(o=>o.id===id);
const keyup=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const pointer=(type,x,y,mods={})=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',mods);
const drag=async(a,b,mods={})=>{pointer('pointerdown',...a,mods);pointer('pointermove',...b,mods);pointer('pointerup',...b,mods);await test.idle();};
const reset=async()=>{keyup('MetaLeft');app.input.cancelCurrent();app.closePanels();app.doc.replace([]);app.history.clear();app.view.reset();app.settings.grid.enabled=false;app.renderer.invalidateScene();await test.idle();};

// Компактная палитра без заголовка; отдельная кнопка исходного SVG только под ластиком.
test.key('Tab');assert(getComputedStyle(app.palette.el.querySelector('.palette-label')).display==='none','Tab показывает только цвета');
assert([...app.palette.el.querySelectorAll('button')].filter(b=>!b.hidden).length===3,'три быстрых цвета');
await test.shot('palette');
app.palette.toggle();assert(!app.palette.el.querySelector('.palette-label').hidden,'полная палитра сохраняет названия');app.palette.hide();
const original=app.toolbar.el.querySelector('[data-action="eraser.original"]');
const selectButton=app.toolbar.el.querySelector('[data-action="tool.select"]'),selectTop=selectButton.getBoundingClientRect().top;
assert(getComputedStyle(original).visibility==='hidden'&&original.disabled,'кнопка исходного SVG скрыта и недоступна у ручки');tool('eraser');assert(getComputedStyle(original).visibility==='visible'&&!original.disabled&&original.previousElementSibling.dataset.action==='tool.eraser','кнопка под ластиком');
assert(selectButton.getBoundingClientRect().top===selectTop,'кнопки не сдвигаются при выборе ластика');
await test.shot('eraser');tool('arrow');assert(getComputedStyle(original).visibility==='hidden'&&selectButton.getBoundingClientRect().top===selectTop,'кнопка скрывается без сдвига соседей');

// Ручка конца меняет длину и направление, но начало горизонтальной стрелки не съезжает.
await reset();tool('arrow');Object.assign(app.settings.arrow,{width:8,headLength:8,headWidth:6,headType:'filled',doubleHead:{headLength:8,headWidth:6,headType:'filled',headRound:.4},both:false});
await drag([220,160],[560,160]);const initial=last();tool('select');app.selection.show(initial);
const end=app.selection.handles().find(h=>h.name==='endpoint');assert(end,'у стрелки есть жёлтая ручка конца');
assert(close(end.point.x,496)&&close(end.point.y,160),'ручка у основания головки длиной 64');
const state=app.history.state;await drag([end.point.x,end.point.y],[end.point.x,end.point.y]);assert(app.history.state===state,'касание ручки без движения не меняет файл и историю');
await drag([end.point.x,end.point.y],[end.point.x+180,end.point.y]);
let arrow=app.selection.selected;
assert(close(arrow.ox+arrow.pts[0],220)&&close(arrow.oy+arrow.pts[1],160),'начало стрелки неподвижно');
assert(close(arrow.oy+arrow.pts[4],160)&&close(arrow.ox+arrow.pts[3],740),'конец остаётся на той же горизонтали');
test.key('KeyZ');assert(close(app.selection.selected.pts[3],initial.pts[3]),'изменение конца отменяется одним действием');
test.key('KeyA');const start=app.selection.handles().find(h=>h.name==='startpoint').point;
assert(close(start.x,284)&&close(start.y,160),'после разворота ручка переходит к основанию головки в начале');
await drag([start.x+1,start.y],[start.x+1-45,start.y+12]);arrow=app.selection.selected;
assert(close(arrow.ox+arrow.pts[0],175)&&close(arrow.oy+arrow.pts[1],172)&&close(arrow.ox+arrow.pts[3],560)&&close(arrow.oy+arrow.pts[4],160),'движется начало, дальний конец остаётся на месте');
test.key('KeyZ');test.key('KeyA');const grips=app.selection.handles();
assert(grips.find(h=>h.name==='startpoint').point.x===284&&grips.find(h=>h.name==='endpoint').point.x===496,'обе головки одновременно имеют свои ручки');
const beforeZoom=app.files.snapshot().view;app.view.restore({...beforeZoom,scale:.1});
const tiny=app.selection.handles(),tinyEnds=tiny.filter(h=>h.name==='startpoint'||h.name==='endpoint');
assert(tiny.some(h=>h.name==='resize'&&h.anchor)&&tinyEnds.every(e=>tiny.filter(h=>h.name==='resize').every(h=>Math.max(Math.abs(e.point.x-h.point.x),Math.abs(e.point.y-h.point.y))>=9)),'при малом масштабе белые и жёлтые ручки разнесены');
app.view.restore(beforeZoom);
tool('arrow');await drag([220,260],[290,260]);await drag([400,260],[420,260]);
app.settings.arrow.both=true;await drag([580,260],[620,260]);
tool('select');app.selection.show([...app.doc.values()][0]);await test.shot('arrows');
const data=app.files.snapshot(),svg=await app.files.worker.run('svg',data),native=await app.files.worker.run('native',svg);
assert(native.objects.every(o=>o.shape?.headType==='filled'),'короткие головки сохраняются как редактируемые стрелки');

// Шаг клетки при рисовании определяет размер головки и сохраняется у готовых стрелок.
await reset();
const previousStep=app.settings.grid.step;
app.settings.grid.step=30;app.settings.grid.enabled=true;
Object.assign(app.settings.arrow,{width:3,headLength:6,headWidth:4,headType:'filled',both:false});
for(const [row,cells] of [.5,1,1.5,2,3].entries()){
  const x=240,y=150+row*60,tip=x+cells*30;
  tool('arrow');await drag([x,y],[tip,y]);const drawn=last();
  tool('select');app.selection.show(drawn);
  const base=app.selection.handles().find(h=>h.name==='endpoint').point;
  assert(close(tip-base.x,18*Math.min(1,cells/2)),'длина наконечника при длине стрелки в клетках: '+cells);
}
tool('pen');await test.idle();await test.shot('arrow-head-size');
app.settings.grid.step=previousStep;

// Частичная волна появляется постепенно и не удлиняется после отрыва.
await reset();tool('sine');app.settings.sine.period=144;app.settings.sine.amplitude=36;
pointer('pointerdown',200,300);pointer('pointermove',218,300);await test.idle();
const live=document.getElementById('live'),pixels=live.getContext('2d').getImageData(0,0,live.width,live.height).data;
let maxX=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])maxX=Math.max(maxX,((i-3)/4)%live.width);
assert(maxX/app.view.dpr<222,'при коротком движении нет заранее нарисованного полного периода');
pointer('pointermove',250,300);pointer('pointerup',250,300);await test.idle();
assert(close(last().pts.at(-3),50)&&close(last().shape.cycles,50/144),'отрыв оставляет неполный период до пера');
const sineSvg=await app.files.worker.run('svg',app.files.snapshot()),sineNative=await app.files.worker.run('native',sineSvg);
assert(close(sineNative.objects[0].shape.cycles,50/144),'неполная волна восстанавливается из SVG');
tool('select');app.selection.show(last());let h=app.selection.handles().find(h=>h.name==='length');
await drag([h.point.x,h.point.y],[h.point.x+190.5,h.point.y]);assert(close(app.selection.selected.shape.cycles,240.5/144),'ручка длины также сохраняет неполную волну');
await test.shot('sine');

// Центр прилипает к углам/границам, его ручку можно снова взять, Alt отключает магнит.
await reset();tool('line');app.settings.line.width=4;await drag([270,250],[560,430]);tool('select');app.selection.show(last());
const box=app.selection.screenBox();h=app.selection.handles().find(h=>h.name==='pivot');
await drag([h.point.x,h.point.y],[box.minX+5,box.minY+6]);
h=app.selection.handles().find(h=>h.name==='pivot');assert(close(h.anchor.x,box.minX)&&close(h.anchor.y,box.minY),'центр примагнитился к углу');
assert(Math.hypot(h.point.x-h.anchor.x,h.point.y-h.anchor.y)>14,'центр и ручка размера доступны отдельно');
await test.shot('pivot-corner');
const offset={x:h.point.x-h.anchor.x,y:h.point.y-h.anchor.y},edge={x:box.maxX-5,y:box.minY+.7*(box.maxY-box.minY)};
await drag([h.point.x,h.point.y],[edge.x+offset.x,edge.y+offset.y]);
h=app.selection.handles().find(h=>h.name==='pivot');assert(close(h.anchor.x,box.maxX)&&close(h.anchor.y,edge.y),'центр прилипает к границе без скачка от вынесенной ручки');
const target={x:box.maxX+4,y:box.minY+15};
await drag([h.point.x,h.point.y],[target.x+h.point.x-h.anchor.x,target.y+h.point.y-h.anchor.y],{altKey:true});
h=app.selection.handles().find(h=>h.name==='pivot');assert(close(h.anchor.x,target.x)&&close(h.anchor.y,target.y),'Alt разрешает точное свободное положение');
const old=app.selection.selected;test.key('BracketRight');
assert(close(app.selection.selected.ox,target.x-(old.oy-target.y))&&close(app.selection.selected.oy,target.y+(old.ox-target.x)),'клавиши вращают вокруг выбранного центра');
await test.shot('pivot');

// Маркер удаляется по реальному контуру, весь быстрый проход проверяется непрерывно.
await reset();tool('marker');app.settings.pen.smoothing=0;
await test.pen([[200,200,.5],[600,200,.5],[600,500,.5]],2);await test.idle();const marker=last();
tool('eraser');app.settings.eraser.width=24;
await drag([350,400],[450,400]);assert(byId(marker.id),'пустота внутри рамки маркера не считается касанием');
await drag([300,100],[300,300]);assert(app.doc.size===0,'быстрый проход удаляет весь штрих маркера');
test.key('KeyZ');assert(app.doc.size===1&&byId(marker.id)===marker,'Undo возвращает исходный маркер целиком');

// Cmd+касание переводит ручку/ластик в обычный M. Отпускание Cmd не сбрасывает выбор.
await reset();tool('line');await drag([220,220],[560,220]);const line=last();tool('pen');
test.key('MetaLeft');assert(live.style.cursor==='pointer','Cmd показывает курсор pointer');
await drag([350,220],[350,220]);assert(app.tool.id==='select'&&app.selection.selected.id===line.id&&app.doc.size===1,'Cmd+тап выбирает без штриха ручки');
const color=app.selection.selected.color;test.key('Tab',{metaKey:true});assert(app.selection.selected.color!==color,'Tab работает, пока Cmd ещё удерживается');
keyup('MetaLeft');assert(app.tool.id==='select'&&app.selection.selected.id===line.id,'отпускание Cmd сохраняет M и выбранный объект');
assert(document.querySelector('[data-action="tool.select"]').classList.contains('active'),'кнопка M остаётся активной после отпускания Cmd');
await test.shot('ctrl-selection');
test.key('KeyM');assert(app.tool.id==='pen','M возвращает ручку после Cmd+тапа');
tool('eraser');test.key('MetaLeft');pointer('pointerdown',350,220);pointer('pointermove',420,260);
keyup('MetaLeft');assert(app.tool.id==='select'&&app.input.drawing&&app.doc.size===1,'Cmd отпущен во время переноса: M продолжает жест без стирания');
pointer('pointermove',440,280);pointer('pointerup',440,280);assert(close(byId(line.id).oy,280)&&!app.input.drawing,'перенос продолжается после отпускания Cmd');
test.key('KeyM');assert(app.tool.id==='eraser','M возвращает ластик после переноса');
test.key('MetaLeft');await drag([440,280],[440,280]);window.dispatchEvent(new Event('blur'));assert(app.tool.id==='select'&&app.selection.selected.id===line.id&&!app.input.meta,'потеря фокуса сохраняет M и выбранный объект');
test.key('KeyM');assert(app.tool.id==='eraser','после потери фокуса M также возвращает ластик');
test.key('MetaLeft');pointer('pointerdown',440,280,{button:2,buttons:2,metaKey:true});
pointer('pointermove',470,300,{buttons:2,metaKey:true});pointer('pointerup',470,300,{button:2,metaKey:true});keyup('MetaLeft');
assert(app.tool.id==='select'&&app.doc.size===1&&close(byId(line.id).oy,300),'Касание с модификатором с правой кнопкой переносит объект и сохраняет M');
test.key('MetaLeft');await drag([470,300],[470,300]);keyup('MetaLeft');test.key('KeyM');
assert(app.tool.id==='eraser','повторный Cmd+тап в M не теряет предыдущий инструмент');
tool('pen');pointer('pointerdown',750,400);test.key('MetaLeft');pointer('pointermove',780,430);pointer('pointerup',810,405);keyup('MetaLeft');
assert(app.tool.id==='pen'&&app.doc.size===2,'Cmd посреди обычного письма не переключает инструмент');
test.key('KeyL');test.key('KeyL');assert(app.tool.id==='pen','возврат предыдущего инструмента сохраняется');
test.key('MetaLeft');await drag([1100,650],[1100,650]);keyup('MetaLeft');assert(app.tool.id==='select'&&!app.selection.objects.length&&app.doc.size===2,'Cmd+тап по пустому месту включает M без нового штриха');
test.key('KeyM');assert(app.tool.id==='pen','M возвращает ручку и после выбора пустого места');
await test.shot('ctrl');
return {ok:true,arrows:native.objects.length,sineCycles:sineNative.objects[0].shape.cycles};
