// Нагрузочный сценарий: 50 000 штрихов и замер плавности прокрутки, рисования и масштабирования.
// Запуск: npm run load — на несколько секунд появляется настоящее окно (иначе цифры нечестные).
// Итог печатается строкой RESULT: интервалы между кадрами экрана в мс (на экране 60 Гц идеал — 16.7).
const { test, app, generate, stats } = window.__phaint;
const N = 50000;
const out = {};

// Измеритель: интервалы между кадрами экрана и время работы отрисовщика в кадре.
function meter() {
  const dts = [];
  let work = 0;
  let last = 0;
  let on = true;
  const tick = (t) => {
    if (last) dts.push(t - last);
    last = t;
    work = Math.max(work, app.renderer.frameMs);
    if (on) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    on = false;
    dts.sort((a, b) => a - b);
    const q = (p) => +dts[Math.min(dts.length - 1, Math.floor(dts.length * p))].toFixed(1);
    return { frames: dts.length, median: q(0.5), p95: q(0.95), max: q(1), slow: dts.filter((d) => d > 25).length, workMax: +work.toFixed(1) };
  };
}
const timed = async (fn) => {
  const t = performance.now();
  await fn();
  return Math.round(performance.now() - t);
};

out.generateMs = await timed(async () => generate(N));
out.firstRenderMs = await timed(() => test.idle());

// 1. Прокрутка вниз через полдокумента, как двумя пальцами по трекпаду.
let stop = meter();
for (let i = 0; i < 240; i++) {
  test.wheel(600, 400, 0, 60);
  await test.frames(1);
}
out.scroll = stop();
await test.idle();

// 2. Рисование пером поверх плотно исписанного места.
const pts = [];
for (let i = 0; i <= 300; i++) pts.push([200 + i * 2.6, 400 + Math.sin(i / 9) * 120, 0.2 + 0.5 * Math.abs(Math.sin(i / 20))]);
stop = meter();
await test.pen(pts, 7);
out.draw = stop();

// 3. Щипок: уменьшение примерно до 15 % и обратно.
stop = meter();
for (let i = 0; i < 60; i++) {
  test.wheel(640, 400, 0, 3.2, true);
  await test.frames(1);
}
out.zoomOut = stop();
out.zoomOutScale = +app.view.scale.toFixed(3);
out.zoomOutSettleMs = await timed(() => test.idle());
stop = meter();
for (let i = 0; i < 60; i++) {
  test.wheel(640, 400, 0, -3.2, true);
  await test.frames(1);
}
out.zoomIn = stop();
out.zoomInSettleMs = await timed(() => test.idle());

// 4. Общий план: уменьшение до 5 %, на экране десятки тысяч штрихов.
for (let i = 0; i < 12; i++) test.key('Minus', { ctrlKey: true });
out.overviewScale = app.view.scale;
out.overviewMs = await timed(() => test.idle());
await test.shot('overview');

// 5. Отмена и повтор всей пачки.
test.key('Digit0', { metaKey: true });
await test.idle();
out.undoMs = await timed(async () => {
  test.key('KeyZ');
  test.key('KeyZ');
  await test.idle();
});
out.afterUndo = app.doc.size;
out.redoMs = await timed(async () => {
  test.key('KeyY');
  test.key('KeyY');
  await test.idle();
});

// 6. Ластик поверх плотной записи. Проверяем бюджет кадров и одну отмену всего прохода.
const beforeErase=app.doc.size;
test.key('KeyE',{metaKey:true,shiftKey:true});
const eraserPoints=[];
for(let i=0;i<=160;i++) eraserPoints.push([160+i*4,180+Math.sin(i/10)*80,.5]);
stop=meter(); await test.pen(eraserPoints,7); out.erase=stop();
out.eraseSettleMs=await timed(()=>test.idle());
await test.shot('erased');
out.eraseUndoMs=await timed(async()=>{test.key('KeyZ',{metaKey:true});await test.idle();});
if(app.doc.size!==beforeErase)throw new Error('Ластик не отменился одним шагом');
test.key('KeyD',{metaKey:true,shiftKey:true});

// 7. Прямая поверх большого документа, с изменением цвета и толщины без фиксации.
test.key('KeyL');stop=meter();
test.pointer('pointerdown',200,300,.2);
for(let i=0;i<60;i++) {
  test.pointer('pointermove',500+i*5,400+Math.sin(i/10)*100,.8);
  if(i%10===0) {test.key('Tab');test.key(i%20===0?'F2':'F1');}
  await test.frames(1);
}
test.pointer('pointerup',795,400+Math.sin(59/10)*100,0);out.line=stop();
await test.idle();
// Изгиб той же фигуры: ищем последнюю линию за O(1), не перебирая 50 000 штрихов.
test.key('ControlLeft');stop=meter();test.pointer('pointerdown',450,220,.5);
for(let i=0;i<60;i++){test.pointer('pointermove',450+i*2,220+Math.sin(i/10)*70,.5);await test.frames(1);}
test.pointer('pointerup',568,220+Math.sin(59/10)*70,0);
window.dispatchEvent(new KeyboardEvent('keyup',{code:'ControlLeft',bubbles:true}));out.bezier=stop();
await test.idle();test.key('KeyZ',{metaKey:true});test.key('KeyZ',{metaKey:true});test.key('KeyD',{metaKey:true,shiftKey:true});await test.idle();
// 8. Две оси одним жестом на том же большом холсте.
test.key('KeyC');stop=meter();test.pointer('pointerdown',300,180,.5);
for(let i=0;i<60;i++){
  test.pointer('pointermove',450+i*6,300+i*4,.5);
  if(i%15===0)test.key('Tab');
  await test.frames(1);
}
test.pointer('pointerup',804,536,0);out.coordinates=stop();await test.idle();
test.key('KeyZ',{metaKey:true});test.key('KeyD');await test.idle();
// 9. Адиабата: масштаб и изменение γ на большом документе.
test.key('KeyA');stop=meter();test.pointer('pointerdown',300,180,.5);
for(let i=0;i<60;i++){
  test.pointer('pointermove',450+i*5,330+i*5,.5);
  if(i%15===0)app.changeGamma(1.4+i/60);
  await test.frames(1);
}
test.pointer('pointerup',745,625,0);out.adiabat=stop();await test.idle();
test.key('KeyZ',{metaKey:true});test.key('KeyD');await test.idle();
// 10. Точки обновляются во время рисования без удорожания остальных объектов.
test.key('KeyL');test.key('Digit5');stop=meter();test.pointer('pointerdown',200,300,.5);
for(let i=0;i<60;i++){test.pointer('pointermove',400+i*8,340+Math.sin(i/10)*100,.5);await test.frames(1);}
test.pointer('pointerup',872,340+Math.sin(59/10)*100,0);out.dots=stop();await test.idle();
test.key('KeyZ',{metaKey:true});test.key('Digit5');test.key('KeyD');await test.idle();
// 11. Выделить весь большой документ, включая объекты далеко за экраном.
out.selectAllMs=await timed(async()=>{test.key('KeyA',{metaKey:true});await test.idle();});
out.selectAllFrameMs=app.renderer.frameMs;
if(app.selection?.objects.length!==app.doc.size)throw new Error('Cmd+A не выбрал весь большой документ');
// 12. Перенос всех объектов сохраняет контуры и вид; отмена возвращает всю группу.
const selectedBefore=[...app.selection.objects],viewVersion=app.view.version;
out.nudgeMs=await timed(async()=>{test.key('ArrowRight');window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',bubbles:true}));await test.idle();});
if(app.view.version!==viewVersion||app.selection.objects.some((o,i)=>o.kind==='stroke'&&o.pts!==selectedBefore[i].pts))throw new Error('Перенос группы изменил вид или пересоздал точки');
out.nudgeUndoMs=await timed(async()=>{test.key('KeyZ',{metaKey:true});await test.idle();});
if(app.selection.objects.some((o,i)=>o!==selectedBefore[i]))throw new Error('Отмена переноса не вернула всю группу');
test.key('Escape');test.key('KeyD');await test.idle();
out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
return { ...out, ...stats() };
