// Жест между наконечниками, Alt, кнопки инструментов, ручки M, ластик, SVG и палитра.
const {app,test}=window.__phaint;
// Геометрия прежних сценариев — без автоматической привязки; оба режима проверяет grid-crop.
app.settings.snapToGrid=false;
const assert=(v,message)=>{if(!v)throw new Error(message);},close=(a,b)=>Math.abs(a-b)<.002;
const last=()=>[...app.doc.values()].at(-1),tool=id=>app.selectTool(id,false);
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const pointer=(type,x,y)=>test.pointer(type,x,y,type==='pointerup'?0:.5);
const drag=async(a,b)=>{pointer('pointerdown',...a);pointer('pointermove',...b);pointer('pointerup',...b);await test.idle();};
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const world=(o,x,y)=>({x:o.ox+o.shape.frame.a*x+o.shape.frame.c*y+o.shape.frame.e,y:o.oy+o.shape.frame.b*x+o.shape.frame.d*y+o.shape.frame.f});
const pixel=(x,y)=>Array.from(document.querySelector('#scene').getContext('2d').getImageData(Math.round(x*app.view.dpr),Math.round(y*app.view.dpr),1,1).data);
const white=(x,y)=>pixel(x,y).slice(0,3).every(n=>n>245);
origin();app.settings.grid.enabled=false;
Object.assign(app.settings.arrow,{width:5,color:'#315ca8',headType:'filled',headLength:6,headWidth:4,both:true,dashed:false});
test.key('KeyC');assert(app.tool.id==='coordinates','C включает координаты');test.key('KeyC');assert(app.tool.id==='pen','повтор C возвращает ручку');
test.key('Digit3',{shiftKey:true});up('ShiftLeft');test.key('KeyC');test.key('KeyC');assert(app.tool.id==='arrow','повтор C возвращает стрелку');test.key('KeyC');
const button=document.querySelector('[data-action="tool.line"]'),axesButton=document.querySelector('[data-action="tool.coordinates"]');
assert(axesButton.classList.contains('active')&&!button.classList.contains('active')&&button.dataset.mode==='arrowBoth','кнопка координат независима от линии и стрелки');
button.click();test.key('KeyB');const panel=app.panels.brush.el;
panel.querySelector('[data-value="line"]').click();assert(app.tool.id==='line','режим прямой в настройках');
panel.querySelector('[data-value="arrow"]').click();assert(app.tool.id==='arrow','режим обычной стрелки в настройках');
axesButton.click();assert(app.tool.id==='coordinates','координаты включаются с панели');
if(!app.panels.brush.open)test.key('KeyB');
const both=[...panel.querySelectorAll('label')].find(e=>e.textContent==='На обоих концах').querySelector('input');
assert(both.disabled&&!both.checked&&app.settings.arrow.both,'общий ноль без головок, настройка обычной стрелки сохранена');
await test.idle();await test.frames(2);await test.shot('menu');app.closePanels();

for(const [a,b] of [[[200,180],[450,380]],[[650,380],[900,180]],[[450,500],[200,700]],[[900,700],[650,500]]]){
  pointer('pointerdown',...a);pointer('pointermove',...b);await test.frames(2);
  pointer('pointerup',...b);await test.idle();const o=last();
  assert(o.shape.kind==='coordinates'&&o.ox===a[0]&&o.oy===b[1],'ноль: x первого наконечника, y второго');
  assert(o.pts[3]+o.ox===b[0]&&o.pts[4]+o.oy===b[1]&&o.pts[6]+o.ox===a[0]&&o.pts[7]+o.oy===a[1],'касание и отрыв задают именно наконечники');
  assert(!o.shape.both&&!white(o.ox,o.oy),'общий ноль соединяет две оси');
  assert(white((a[0]+b[0])/2,(a[1]+b[1])/2),'между осями нет диагональной линии');
}
await test.shot('directions');
// Цвет и толщина общие с обычной стрелкой, доступны до отрыва.
pointer('pointerdown',1020,200);pointer('pointermove',1200,470);test.key('F2');test.key('Tab');pointer('pointerup',1200,470);await test.idle();
assert(close(last().pts[2],app.settings.arrow.width)&&last().color===app.currentColor,'цвет и толщина обеих осей обновляются в процессе');
test.key('KeyZ');assert(app.doc.size===4,'оси отменяются целиком');
// Alt фиксирует первую точку только при касании; отпускание не сдвигает её.
app.settings.grid.step=24;test.key('AltLeft');pointer('pointerdown',1021,201);pointer('pointermove',1191,493);
let preview=app.tool.object(0,0);assert(preview.ox===1032&&preview.oy===504&&preview.pts[7]+preview.oy===192,'обе точки и ноль на сетке');
up('AltLeft');pointer('pointermove',1193,497);preview=app.tool.object(0,0);
assert(preview.ox===1032&&preview.oy===497&&preview.pts[7]+preview.oy===192,'первый наконечник остаётся привязанным');
pointer('pointerup',1193,497);await test.idle();test.key('KeyZ');
pointer('pointerdown',1021,201);pointer('pointermove',1191,493);test.key('AltLeft');preview=app.tool.object(0,0);
assert(preview.ox===1021&&preview.pts[7]+preview.oy===201&&preview.oy===504,'поздний Alt не двигает первый наконечник');
pointer('pointerup',1191,493);up('AltLeft');await test.idle();test.key('KeyZ');

// Один объект в M: вращается вокруг нуля, длины меняются независимо после поворота.
tool('select');app.selection.show([...app.doc.values()][0]);let o=app.selection.selected,zero=world(o,0,0);
let center=app.selection.center();assert(close(center.x,zero.x)&&close(center.y,zero.y),'центр вращения в начале координат');
test.key('Period');o=app.selection.selected;assert(close(world(o,0,0).x,zero.x)&&close(world(o,0,0).y,zero.y),'поворот не сдвигает ноль');
const height=o.shape.height,length=o.shape.length,w=o.pts[2];
const screen=(o,x,y)=>{const p=world(o,x,y);return app.view.toScreen(p.x,p.y);};
const axisHandle=(o,name,x,y)=>{
  const h=app.selection.handles().find(h=>h.name===name).point,base=screen(o,x,y);
  assert(close(h.x,base.x)&&close(h.y,base.y),'ручка находится в середине основания '+name);
  return h;
};
let h=axisHandle(o,'axisX',length-Math.sign(length)*w*o.shape.headLength,0);
let tip=screen(o,length,0),target=screen(o,length+60,35);
await drag([h.x+2,h.y+1],[h.x+2+target.x-tip.x,h.y+1+target.y-tip.y]);o=app.selection.selected;
assert(close(o.shape.length,length+60)&&o.shape.height===height&&o.pts[2]===w,'ручка X меняет только длину X без скачка и утолщения');
const oldX=o.shape.length;h=axisHandle(o,'axisY',0,height-Math.sign(height)*w*o.shape.headLength);tip=screen(o,0,height);target=screen(o,30,height-50);
await drag([h.x,h.y],[h.x+target.x-tip.x,h.y+target.y-tip.y]);o=app.selection.selected;
assert(o.shape.length===oldX&&close(o.shape.height,height-50),'ручка Y меняет только длину Y');
await test.shot('selection');
const data=app.files.snapshot(),svg=await app.files.worker.run('svg',data),restored=await app.files.worker.run('native',svg);
assert(restored.objects.length===4&&restored.objects.every(o=>o.shape.kind==='coordinates'),'SVG восстанавливает четыре редактируемых системы координат');
assert(restored.objects.every((o,i)=>JSON.stringify(o.pts)===JSON.stringify(data.objects[i].pts)),'SVG сохраняет все оси после редактирования');

// У открытых головок ластик не видит выдуманную диагональ между наконечниками.
app.doc.replace([]);app.history.clear();tool('coordinates');Object.assign(app.settings.arrow,{headType:'open',width:5});
await drag([240,180],[760,600]);const axes=last();tool('eraser');app.settings.eraser.width=24;
await drag([500,390],[500,390]);assert(app.doc.size===1&&last()===axes,'пустота между осями не стирается');
await drag([500,600],[500,600]);assert(app.doc.size>1&&white(500,600)&&!white(240,390),'ластик разрезает только затронутую ось');
test.key('KeyZ');assert(app.doc.size===1&&last()===axes,'одна отмена возвращает всю систему координат');
app.doc.replace(restored.objects);app.history.clear();tool('coordinates');await test.idle();
app.palette.toggle();await test.shot('palette');app.palette.hide();
return {ok:true,systems:app.doc.size};
