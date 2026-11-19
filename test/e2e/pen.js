// Сценарий визуальной проверки пера и вида. Выполняется внутри страницы как тело async-функции.
// Запуск: npm run e2e — снимки появятся в dist/e2e/pen.*.png, итог печатается строкой RESULT.
const { test, app, stats } = window.__phaint;

// Нажатие: плавно нарастает в начале штриха и спадает в конце, как у настоящего пера.
const P = (i, n, base = 0.42) => {
  const edge = Math.min(1, i / 3, (n - 1 - i) / 3);
  return Math.max(0.03, (base + 0.12 * Math.sin(i / 5)) * edge);
};
const home = () => {
  test.key('Digit0', { metaKey: true });
  const s = app.view.toScreen(0, 0);
  app.view.panBy(-s.x, -s.y);
};

let pts = [];
// Петли, как в прописях.
for (let i = 0; i < 220; i++) {
  const t = i / 12;
  pts.push([110 + t * 22 - 14 * Math.sin(t * 2.2), 110 - 16 * Math.cos(t * 2.2), P(i, 220)]);
}
await test.pen(pts, 6);

// Зигзаг с острыми углами.
pts = [];
for (let i = 0; i <= 120; i++) {
  const k = i % 20;
  pts.push([110 + i * 3.2, 170 + (k < 10 ? k : 20 - k) * 4, P(i, 121, 0.5)]);
}
await test.pen(pts, 6);

// Три точки (касания без движения).
for (const x of [530, 560, 590]) await test.pen([[x, 190, 0.2], [x + 0.2, 190.1, 0.55], [x + 0.1, 190, 0.3]], 8);

// Очень быстрая прямая: отсчёты через 48 px.
pts = [];
for (let i = 0; i <= 12; i++) pts.push([110 + i * 48, 250 + i * 5, P(i, 13, 0.6)]);
await test.pen(pts, 7);

// Медленная линия с дрожью ±0.45 px: проверка сглаживания.
pts = [];
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i <= 260; i++) pts.push([110 + i * 1.1 + (rnd() - 0.5) * 0.9, 340 + (rnd() - 0.5) * 0.9, P(i, 261, 0.45)]);
await test.pen(pts, 6);

// Кружки от мелких к крупным.
for (let c = 0; c < 6; c++) {
  pts = [];
  const r = 4 + c * 1.5;
  for (let i = 0; i <= 40; i++) {
    const a = (i / 36) * Math.PI * 2;
    pts.push([440 + c * 34 + r * Math.cos(a), 340 + r * Math.sin(a), P(i, 41, 0.45)]);
  }
  await test.pen(pts, 6);
}

// Мышь (без нажатия) и перо с нажимом от слабого к сильному.
pts = [];
for (let i = 0; i <= 90; i++) pts.push([110 + i * 5, 420 + Math.sin(i / 8) * 25, 0.5]);
await test.pen(pts, 6, 'mouse');
pts = [];
for (let i = 0; i <= 90; i++) pts.push([110 + i * 5, 500 + Math.sin(i / 8) * 25, 0.05 + 0.9 * (i / 90)]);
await test.pen(pts, 6);

await test.idle();
const strokes = app.doc.size;
await test.shot('1-strokes');
await test.shot('2-detail', { x: 90, y: 80, width: 330, height: 140 });

// Крупный план: видна геометрия контура.
app.view.zoomAt(250, 100, 8);
app.view.panBy(150, 250);
await test.idle();
await test.shot('3-zoom8');

// Длинное уменьшение щипком с 800 %: штрихи должны дорисовываться прямо во время жеста.
for (let i = 0; i < 56; i++) {
  test.wheel(640, 400, 0, 5, true);
  await test.sleep(16);
}
const midGesture = app.view.scale;
await test.shot('3b-pinch-out');
await test.idle();
await test.shot('3c-settled');

// Поворот на 45° и уменьшение щипком.
home();
test.key('ArrowRight', { metaKey: true });
test.key('ArrowRight', { metaKey: true });
for (let i = 0; i < 12; i++) {
  test.wheel(640, 400, 0, 6, true);
  await test.sleep(16);
}
await test.idle();
await test.shot('4-rotated');

// Панель настроек кисти и отладочная панель.
home();
test.key('KeyB');
test.key('F12');
await test.sleep(600);
await test.shot('5-panels');
test.key('Escape');
test.key('F12');

// Отмена и повтор.
test.key('KeyZ');
test.key('KeyZ');
const afterUndo = app.doc.size;
test.key('KeyY');
const afterRedo = app.doc.size;

return { strokes, afterUndo, afterRedo, midGesture, rate: app.input.rate, ...stats() };
