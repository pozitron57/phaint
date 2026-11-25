// V, Alt+V и перенос снимков настоящими событиями клавиатуры и пера.
const {app,test}=window.__phaint;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const key=(code,mods={})=>{test.key(code,mods);up(code);};
const wait=async check=>{for(let i=0;i<300&&!check();i++)await test.sleep(10);assert(check(),'ожидание вставки');};
const at=(o,x,y,message)=>assert(o&&Math.abs(o.ox-x)<.001&&Math.abs(o.oy-y)<.001,message+' '+JSON.stringify([o?.ox,o?.oy]));
const pointer=(type,x,y,mods={})=>{
  const p=app.view.toScreen(x,y);
  test.pointer(type,p.x,p.y,type==='pointerup'?0:.5,'pen',mods);
};
function card(width,height,color,title,formula){
  const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
  const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle=color;ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#27364b';ctx.font='16px sans-serif';ctx.fillText(title,14,26);
  ctx.font='italic 20px Georgia';ctx.fillText(formula,14,54);
  return {width,height,dataURL:canvas.toDataURL()};
}
let raster=card(212,104,'#e4ebf5','Путь','s = vt');
app.platform.clipboardImage=async()=>raster;
const paste=async(x,y,mods={})=>{
  const count=app.doc.size;
  app.input.position=app.view.toScreen(x,y);key('KeyV',mods);
  await wait(()=>!app.pasting&&app.doc.size===count+1);
  return app.selection.selected;
};
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.settings.grid.step=24;
const target=await paste(277,205,{altKey:true});
at(target,277,205,'Alt+V ставит угол точно под перо');
raster=card(160,76,'#f5eddd','Скорость','v = s / t');
const below=await paste(280,313);
at(below,277,309,'V стыкует сверху вниз и выравнивает левые края, хотя узел сетки ближе по Y');
assert(below.width===160&&below.height===76,'размер Retina в пунктах');
app.undo();
const exact=await paste(280,313,{altKey:true});at(exact,280,313,'Alt+V рядом с соседом');app.undo();
const original=await paste(753,473);at(original,744,480,'V вдали попадает на сетку');
const current=()=>app.doc.get(original.id);
const before=app.history.state;
pointer('pointerdown',776,500);pointer('pointermove',525,221);
at(current(),489,205,'перенос стыкует слева направо и выравнивает верхние края');
await test.idle();await test.shot('edges');
const live=document.querySelector('#live'),liveCtx=live.getContext('2d');
const guideAlpha=()=>liveCtx.getImageData(Math.round(340*app.view.dpr),Math.round(205*app.view.dpr),1,1).data[3];
assert(guideAlpha()>0,'направляющая проходит вдоль края соседа');
test.key('AltLeft');at(current(),493,201,'удержание Alt отпускает обе оси без движения пера');
await test.frames(2);assert(guideAlpha()===0,'свободный перенос сразу убирает направляющую');
up('AltLeft');at(current(),489,205,'отпускание Alt возвращает привязки без движения пера');
pointer('pointerup',525,221);
await test.idle();assert(guideAlpha()===0,'после отрыва направляющая исчезла');
app.undo();assert(current()===original&&app.history.state===before,'отмена всего жеста возвращает исходный объект');
app.redo();at(current(),489,205,'повтор восстанавливает стык');app.undo();
pointer('pointerdown',776,500);pointer('pointermove',525,221);key('Escape');pointer('pointerup',525,221);
assert(current()===original&&app.history.canRedo,'Esc сохраняет исходную позицию и прежний повтор');
app.selection.show(original);
pointer('pointerdown',776,500);pointer('pointermove',525,221);pointer('pointerup',783,500);
assert(current()===original&&app.history.canRedo&&app.history.state===before,'возврат в ту же клетку сохраняет историю');

// Независимые флажки и скрытая сетка. Положение задаётся в координатах холста при любом виде.
key('KeyG');key('KeyG',{shiftKey:true});
const checkbox=label=>[...app.panels.background.el.querySelectorAll('label')].find(el=>el.textContent===label).querySelector('input');
const images=checkbox('Привязывать картинки друг к другу'),grid=checkbox('Привязка к сетке по умолчанию');
assert(images.checked&&grid.checked&&!app.settings.grid.enabled,'обе привязки включены при скрытой сетке');
await test.shot('settings');
images.click();at(await paste(493,201),504,192,'при выключенных соседях используется скрытая сетка');app.undo();
grid.click();at(await paste(493,201),493,201,'при двух выключенных флажках обычная V ставит точно');app.undo();
images.click();app.closePanels();
app.view.restore({x:525,y:355,scale:1.4,rotSteps:1});
at(await paste(492,203),489,205,'при повороте и зуме края остаются в координатах холста');app.undo();
at(await paste(493,201,{altKey:true}),493,201,'Alt+V при выключенной сетке и повёрнутом виде');app.undo();
await app.applyShortcuts({'gesture.grid':['Shift'],'edit.pasteImageFree':['KeyU']});
app.selection.show(original);
pointer('pointerdown',776,500);pointer('pointermove',522,223,{shiftKey:true});at(current(),490,203,'переназначенный Shift даёт свободный перенос');
pointer('pointerup',522,223,{shiftKey:true});app.undo();
app.input.position=app.view.toScreen(492,203);key('KeyU');await wait(()=>!app.pasting);
at(app.selection.selected,492,203,'свободная вставка переназначается отдельно');
return {ok:true};
