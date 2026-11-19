// Быстрые штрихи и потеря захвата: показанная линия не пропадает при отрыве пера.
const { app, test } = window.__phaint;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
app.settings.grid.enabled = false;
app.settings.pen.smoothing = 0;
app.settings.pen.width = 5;
const scene = document.getElementById('scene');
const ink = (x,y) => scene.getContext('2d').getImageData(Math.round(x*app.view.dpr),Math.round(y*app.view.dpr),1,1).data[0] < 120;
test.pointer('pointerdown',180,180,.5);
test.pointer('pointermove',400,180,.5);
await test.frames(2); await test.shot('before-release');
test.pointer('lostpointercapture',0,0,0);
await test.idle();
await test.shot('after-release');
assert(app.doc.size === 1 && ink(280,180), 'Потеря захвата стёрла показанный штрих');
// Поздний pointerup не должен добавлять точку из (0,0) или дублировать штрих.
test.pointer('pointerup',400,180,0);
assert(app.doc.size === 1, 'Поздний отрыв продублировал штрих');
test.pointer('pointerdown',180,240,.5); test.pointer('pointermove',400,240,.5);
test.pointer('pointercancel',0,0,0);
test.pointer('pointerdown',180,300,.5); test.pointer('pointermove',400,300,.5);
window.dispatchEvent(new Event('blur'));
// Если отдельный pointerup не пришёл, первое движение без кнопок завершает штрих.
test.pointer('pointerdown',180,360,.5); test.pointer('pointermove',400,360,.5);
document.getElementById('live').dispatchEvent(new PointerEvent('pointermove', {pointerId:5,pointerType:'pen',clientX:900,clientY:700,pressure:0,buttons:0,bubbles:true}));
assert(!app.input.drawing && app.doc.size === 4, 'Перо осталось рисующим после отрыва');
// Много полных штрихов между кадрами, включая точки и короткие отрезки.
for (let i=0;i<100;i++) {
  const x=180+(i%20)*24, y=440+Math.floor(i/20)*35;
  test.pointer('pointerdown',x,y,.5); test.pointer('pointerup',x+8,y+5,0);
}
await test.idle();
assert(app.doc.size === 104,'Быстрые штрихи потерялись');
for (const y of [180,240,300,360]) assert(ink(280,y), 'Завершённый штрих исчез со сцены');
// Полная перестройка плиток тоже сохраняет линии.
app.view.panBy(80,0); await test.idle(); app.view.panBy(-80,0); await test.idle();
for (const y of [180,240,300,360]) assert(ink(280,y), 'Линия потерялась после сдвига');
await test.shot('retained');
return {objects:app.doc.size,ok:true};
