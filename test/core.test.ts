// Тесты ядра: контур штриха, сборка штриха, сглаживание, упрощение, документ, хоткеи, настройки.
// Запуск: npm test (Node исполняет .ts напрямую).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Actions, comboLabel, comboOf, normalizeCombo } from '../src/core/actions.ts';
import { type PenSettings, stepWidth, widthFactor } from '../src/core/brush.ts';
import { Doc } from '../src/core/doc.ts';
import { PointFilter } from '../src/core/filter.ts';
import { History } from '../src/core/history.ts';
import { loopArea, strokeOutline } from '../src/core/outline.ts';
import { defaultSettings, mergeSettings } from '../src/core/settings.ts';
import { simplify } from '../src/core/simplify.ts';
import { StrokeBuilder } from '../src/core/stroke-builder.ts';
import { makeStroke } from '../src/core/types.ts';

const pen = (over: Partial<PenSettings> = {}): PenSettings => ({ ...defaultSettings().pen, ...over });
const identity = (x: number, y: number) => ({ x, y });

function bounds(loops: Float32Array[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of loops) {
    for (let i = 0; i < p.length; i += 2) {
      minX = Math.min(minX, p[i]);
      maxX = Math.max(maxX, p[i]);
      minY = Math.min(minY, p[i + 1]);
      maxY = Math.max(maxY, p[i + 1]);
    }
  }
  return { minX, minY, maxX, maxY };
}

test('контур: точка — один диск нужного радиуса', () => {
  const loops = strokeOutline([10, 20, 4]);
  assert.equal(loops.length, 1);
  const b = bounds(loops);
  assert.ok(Math.abs(b.maxX - b.minX - 4) < 0.3, 'ширина диска около 4');
  assert.ok(Math.abs((b.minX + b.maxX) / 2 - 10) < 1e-3);
});

test('контур: прямой отрезок — одна лента вокруг оси', () => {
  const loops = strokeOutline([0, 0, 4, 10, 0, 4]);
  assert.equal(loops.length, 1);
  assert.equal(loops[0].length, (2 * 2 + 2 * 7) * 2);
  const b = bounds(loops);
  assert.ok(Math.abs(b.maxY - 2) < 0.1 && Math.abs(b.minY + 2) < 0.1, 'полуширина 2');
  assert.ok(b.minX < -1.9 && b.maxX > 11.9, 'круглые концы выступают на радиус');
});

test('контур: все петли одной ориентации и без NaN', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 200; k++) {
    const n = 2 + Math.floor(rnd() * 40);
    const pts: number[] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      pts.push(x, y, 0.5 + rnd() * 6);
      x += (rnd() - 0.5) * 8;
      y += (rnd() - 0.5) * 8;
    }
    for (const loop of strokeOutline(pts)) {
      assert.ok(loop.every(Number.isFinite), 'конечные координаты');
      assert.ok(loopArea(loop) < 0, 'ориентация петли');
    }
  }
});

test('контур: острый угол рвёт ленту, совпадающие точки не ломают', () => {
  assert.ok(strokeOutline([0, 0, 3, 20, 0, 3, 0, 1, 3]).length >= 2);
  const same = strokeOutline([5, 5, 2, 5, 5, 3, 5, 5, 1]);
  assert.equal(same.length, 1);
  assert.ok(same[0].every(Number.isFinite));
  assert.ok(strokeOutline([0, 0, 2, 0, 0, 2, 10, 0, 2])[0].every(Number.isFinite));
});

test('толщина: нажатие и скорость', () => {
  const p = pen({ pressure: 0.5, curve: 0 });
  assert.ok(Math.abs(widthFactor(p, 0.5, 0) - 1) < 1e-9, 'среднее нажатие — базовая толщина');
  assert.ok(widthFactor(p, 1, 0) > widthFactor(p, 0.1, 0));
  assert.equal(widthFactor(pen({ pressure: 0 }), 0.9, 0), 1);
  assert.ok(widthFactor(pen({ speed: 1 }), 0.5, 3000) < 1);
  assert.ok(stepWidth(2.6, 1) > 2.6 && stepWidth(2.6, -1) < 2.6);
  assert.ok(stepWidth(0.3, -1) >= 0.3 && stepWidth(60, 1) <= 60);
});

test('сборка штриха: волна, точка, нажим', () => {
  const b = new StrokeBuilder(pen(), identity, 1, 100, 100);
  for (let i = 0; i <= 80; i++) b.add(100 + i * 4, 100 + Math.sin(i / 6) * 30, 0.2 + 0.6 * Math.abs(Math.sin(i / 10)), i * 7.5);
  assert.ok(b.previewLoops().length >= 1);
  const pts = b.finish();
  assert.ok(pts && pts.length % 3 === 0 && pts.length / 3 > 10);
  const last = pts.length - 3;
  assert.ok(Math.abs(pts[last] - 320) < 1 && Math.abs(pts[last + 1] - Math.sin(80 / 6) * 30) < 1.5, 'штрих доходит до точки отрыва');
  for (let i = 2; i < pts.length; i += 3) assert.ok(pts[i] > 0.3 && pts[i] < 6);

  const dot = new StrokeBuilder(pen(), identity, 1, 5, 5);
  dot.add(5, 5, 0.05, 0);
  dot.add(5.1, 5, 0.6, 8);
  const d = dot.finish();
  assert.ok(d && d.length === 3 && d[2] >= pen().width-1e-6, 'точка не тоньше выбранной толщины');

  const light = new StrokeBuilder(pen(), identity, 1, 0, 0);
  const hard = new StrokeBuilder(pen(), identity, 1, 0, 0);
  for (let i = 0; i <= 20; i++) {
    light.add(i * 5, 0, 0.1, i * 8);
    hard.add(i * 5, 0, 0.95, i * 8);
  }
  const lw = light.finish() as Float32Array;
  const hw = hard.finish() as Float32Array;
  assert.ok(hw[hw.length - 1] > lw[lw.length - 1] * 1.5);
});

test('сглаживание: выключено — точка в точку, включено — гасит дрожь', () => {
  const off = new PointFilter();
  off.configure(0);
  assert.deepEqual(off.filter(1, 2, 0), { x: 1, y: 2 });
  assert.deepEqual(off.filter(5, 7, 8), { x: 5, y: 7 });

  const on = new PointFilter();
  on.configure(0.5);
  let raw = 0;
  let out = 0;
  for (let i = 0; i < 200; i++) {
    const jitter = i % 2 ? 0.5 : -0.5;
    const p = on.filter(100 + jitter, 100, i * 7.5);
    raw += Math.abs(jitter);
    if (i > 20) out += Math.abs(p.x - 100);
  }
  assert.ok(out < raw * 0.4, 'дрожь на месте заметно меньше');
  // Быстрое движение: отставание ограничено.
  const fast = new PointFilter();
  fast.configure(0.25);
  let p = { x: 0, y: 0 };
  for (let i = 0; i < 60; i++) p = fast.filter(i * 10, 0, i * 7.5);
  assert.ok(590 - p.x < 4, `отставание ${590 - p.x} px`);
});

test('упрощение: прямая сжимается, угол и перепад толщины остаются', () => {
  const line: number[] = [];
  for (let i = 0; i <= 20; i++) line.push(i, 0, 2);
  assert.equal(simplify(line, 0.1).length, 6);
  const corner = simplify([0, 0, 2, 5, 0, 2, 10, 0, 2, 10, 5, 2, 10, 10, 2], 0.1);
  assert.equal(corner.length, 9);
  const bump = simplify([0, 0, 2, 5, 0, 4, 10, 0, 2], 0.1);
  assert.equal(bump.length, 9);
});

test('документ: запрос по области, отмена, признак «поверх»', () => {
  const doc = new Doc();
  const history = new History(doc);
  const changes: boolean[] = [];
  doc.onChange((c) => changes.push(c.top));
  const mk = (x: number) => makeStroke(doc.nextId(), doc.topZ(), x, 0, Float32Array.from([0, 0, 2, 10, 0, 2]), '#000');
  const a = mk(0);
  history.commit({ added: [a], removed: [] });
  const b = mk(1000);
  history.commit({ added: [b], removed: [] });
  assert.equal(doc.size, 2);
  assert.deepEqual(doc.query({ minX: -5, minY: -5, maxX: 20, maxY: 5 }).map((o) => o.id), [a.id]);
  assert.equal(doc.query({ minX: 400, minY: -5, maxX: 500, maxY: 5 }).length, 0);
  assert.ok(history.undo());
  assert.equal(doc.size, 1);
  assert.ok(history.redo());
  assert.equal(doc.size, 2);
  history.commit({ added: [], removed: [a] });
  assert.ok(history.undo(), 'возврат стёртого');
  // Повтор возвращает объект с прежним z, поэтому идёт обычным путём (перерисовка плиток), а не «поверх».
  assert.deepEqual(changes, [true, true, false, false, false, false]);
  assert.ok(history.canUndo && history.canRedo);
});

test('хоткеи: сочетания, повтор, переопределения', () => {
  const key = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; repeat: boolean }> = {}) => ({
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });
  assert.equal(comboOf(key('KeyE', { metaKey: true, shiftKey: true })), 'Shift+Cmd+KeyE');
  assert.equal(normalizeCombo('Cmd+Shift+KeyE'), 'Shift+Cmd+KeyE');
  assert.equal(comboLabel('Cmd+Shift+KeyE'), '⇧⌘E');
  assert.equal(comboLabel('F11'), 'F11');
  assert.equal(comboLabel('Digit1'), '1');

  const log: string[] = [];
  const a = new Actions();
  a.register({ id: 'pen', title: 'Ручка', keys: ['Digit1', 'Cmd+Shift+KeyD'], run: () => log.push('pen') });
  a.register({ id: 'thin', title: 'Тоньше', keys: ['F1'], repeat: true, run: () => log.push('thin') });
  assert.ok(a.handle(key('Digit1')));
  assert.ok(a.handle(key('KeyD', { metaKey: true, shiftKey: true })));
  assert.ok(!a.handle(key('KeyD')));
  assert.ok(a.handle(key('Digit1', { repeat: true })), 'удержание гасится, но действие не повторяется');
  assert.ok(a.handle(key('F1', { repeat: true })));
  assert.deepEqual(log, ['pen', 'pen', 'thin']);
  a.setOverrides({ pen: ['KeyP'] });
  assert.ok(!a.handle(key('Digit1')) && a.handle(key('KeyP')));
  assert.equal(a.hint('pen'), 'P');
});

test('настройки: слияние отбрасывает мусор', () => {
  const s = mergeSettings({ pen: { width: 5, color: 12, smoothing: 'x' }, grid: { step: 40 }, palette: ['#111'], keys: { 'tool.pen': ['KeyP'], bad: 5 }, extra: 1 });
  const d = defaultSettings();
  assert.equal(s.pen.width, 5);
  assert.equal(s.pen.color, d.pen.color);
  assert.equal(s.pen.smoothing, d.pen.smoothing);
  assert.equal(s.grid.step, 40);
  assert.deepEqual(s.palette, d.palette);
  assert.deepEqual(s.keys, { 'tool.pen': ['KeyP'] });
  assert.deepEqual(mergeSettings(null), d);
});

test('цвет и штрих: перенос старых пресетов и независимое сохранение обоих режимов', () => {
  const s = mergeSettings({
    version: 10,
    pen: { width: 7, color: '#4d9160', dashed: true, dashGap: 9, round: false },
    arrow: { width: 6, color: '#aa3322', dotted: true, dashed: true, dotSpacing: 28 },
    hyperbola: { width: 4, color: '#654321', dashLength: 8 },
  });
  assert.equal(s.stylePerTool, false);
  assert.deepEqual(s.sharedStyle, { ...defaultSettings().sharedStyle, color: '#79ad65', dashed: true, dashGap: 9, round: false });
  assert.equal(s.coordinates.color, s.arrow.color);
  assert.equal(s.coordinates.dotSpacing, 20);
  assert.equal(s.adiabat.color, s.hyperbola.color);
  assert.equal(s.adiabat.dashLength, 8);
  for (const style of [s.sharedStyle, s.coordinates, s.adiabat]) assert.ok(!('width' in style));

  s.stylePerTool = true;
  s.sharedStyle.color = '#ffffff';
  s.coordinates.dotSpacing = 3;
  s.adiabat.dashLength = 2;
  assert.equal(s.pen.color, '#79ad65');
  assert.equal(s.arrow.dotSpacing, 20);
  assert.equal(s.hyperbola.dashLength, 8);
  assert.deepEqual(mergeSettings(JSON.parse(JSON.stringify(s))), s);
});

test('цикл цветов: прежние настройки, разная длина и точные оттенки после записи', () => {
  const defaults=defaultSettings().colorCycle;
  assert.deepEqual(mergeSettings({version:13}).colorCycle,defaults);
  assert.deepEqual(mergeSettings({colorCycle:[null,'white']}).colorCycle,defaults);
  for(const colors of [['#4d9160'],['#abcdef','#444444','#abcdef','#111111','#000000']]){
    const profile={...defaultSettings(),colorCycle:colors.map(c=>c.toUpperCase())};
    profile.sharedStyle.color=colors[0];
    const merged=mergeSettings(profile);
    assert.deepEqual(merged.colorCycle,colors);
    assert.equal(merged.sharedStyle.color,colors[0]);
    assert.deepEqual(mergeSettings(merged),merged);
  }
});
