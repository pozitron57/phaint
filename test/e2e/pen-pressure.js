// Нажим Wacom сохраняется, даже если после Screenshot Chromium пометил перо как mouse.
const {app,test}=window.__phaint;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const live=document.getElementById('live');
app.selectTool('pen');
Object.assign(app.settings.pen,{width:8,pressure:1,curve:0,smoothing:0,taper:0,speed:0});
app.settings.grid.enabled=false;
const pressure=[.1,.15,.3,.6,.9,.4,.15,.4,.8,.95];
function event(type,kind,x,y,p,t){
  const e=new PointerEvent(type,{pointerId:5,pointerType:kind,clientX:x,clientY:y,
    pressure:p,button:type==='pointermove'?-1:0,buttons:type==='pointerup'?0:1,
    bubbles:true,cancelable:true,isPrimary:true});
  Object.defineProperty(e,'timeStamp',{value:t});
  return e;
}
async function stroke(kind,y,coalesced=false,values=pressure){
  live.dispatchEvent(event('pointerdown',kind,120,y,values[0],1000));
  const moves=values.slice(1).map((p,i)=>event('pointermove',kind,160+i*40,y,p,1010+i*10));
  if(coalesced){
    const last=moves.at(-1);
    Object.defineProperty(last,'getCoalescedEvents',{value:()=>moves});
    live.dispatchEvent(last);
  }else for(const e of moves)live.dispatchEvent(e);
  // Отрыв в новой точке проверяет, что хвост использует последний нажим, а не 0/0.5.
  live.dispatchEvent(event('pointerup',kind,520,y,0,1100));
  await test.idle();
  return [...app.doc.values()].at(-1);
}
const pen=await stroke('pen',180);
window.dispatchEvent(new Event('blur'));
const mislabeled=await stroke('mouse',270);
const coalesced=await stroke('mouse',360,true);
const mouse=await stroke('mouse',450,false,pressure.map(()=>.5));
const same=(a,b)=>a.pts.length===b.pts.length&&a.pts.every((v,i)=>Math.abs(v-b.pts[i])<1e-5);
assert(same(pen,mislabeled),'Перо, помеченное mouse, потеряло нажим или толщину хвоста');
assert(same(pen,coalesced),'Потерян нажим промежуточных отсчётов mouse');
const widths=o=>Array.from(o.pts).filter((_,i)=>i%3===2);
const w=widths(mislabeled);
assert(Math.max(...w)>Math.min(...w)*4,'Штрих с переменным нажимом стал одинаковой толщины');
assert(widths(mouse).every(w=>Math.abs(w-8)<1e-5),'Обычная мышь изменила постоянную толщину');
assert(mislabeled.pts.at(-1)>12&&mislabeled.ox+mislabeled.pts.at(-3)===520,'Отрыв потерял сильный нажим или последнюю точку');
test.key('KeyZ');assert(app.doc.size===3,'Отмена обычной мыши не сохранила остальные штрихи');
test.key('KeyY');assert(app.doc.size===4&&same(mouse,[...app.doc.values()].at(-1)),'Повтор изменил штрих');
await test.idle();await test.shot('pressure');
return {ok:true,objects:app.doc.size,pressureWidth:[Math.min(...w),Math.max(...w)],mouseWidth:widths(mouse)[0]};
