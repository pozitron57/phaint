// Тесты вида: преобразования мир ↔ экран, масштаб вокруг точки, поворот.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Viewport } from '../src/view/viewport.ts';

function view(): Viewport {
  const v = new Viewport();
  v.setSize(2000, 1200, 2);
  return v;
}

const near = (a: number, b: number, eps: number, what: string) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} ≈ ${b}`);

test('вид: туда и обратно', () => {
  const v = view();
  v.panBy(123.4, -77.7);
  v.zoomAt(300, 200, 1.7);
  v.rotate(3);
  const w = v.toWorld(410.5, 333.25);
  const s = v.toScreen(w.x, w.y);
  near(s.x, 410.5, 1e-6, 'x');
  near(s.y, 333.25, 1e-6, 'y');
  assert.ok(Number.isInteger(v.tx) && Number.isInteger(v.ty), 'сдвиг целый');
});

test('вид: масштаб держит точку под курсором', () => {
  const v = view();
  v.panBy(50, 60);
  const before = v.toWorld(400, 300);
  v.zoomAt(400, 300, 2.5);
  const after = v.toWorld(400, 300);
  // Сдвиг округляется до пикселя устройства: допуск — один такой пиксель в мировых единицах.
  near(after.x, before.x, 1 / (v.scale * v.dpr), 'x');
  near(after.y, before.y, 1 / (v.scale * v.dpr), 'y');
  near(v.scale, 2.5, 1e-9, 'масштаб');
});

test('вид: шестнадцать шагов поворота — полный оборот, центр на месте', () => {
  const v = view();
  v.panBy(10, 20);
  const center = v.toWorld(500, 300);
  for (let i = 0; i < 16; i++) {
    v.rotate(1);
    const c = v.toWorld(500, 300);
    near(c.x, center.x, 1, 'центр x');
    near(c.y, center.y, 1, 'центр y');
  }
  assert.equal(v.rotSteps, 0);
  v.rotate(4);
  const m = v.linear();
  assert.equal(m.a, 0);
  assert.equal(m.d, 0);
  near(m.b, 2, 1e-12, 'поворот на 90° точный');
});

test('вид: ступени масштаба и сброс', () => {
  const v = view();
  v.zoomStep(1);
  assert.equal(v.scale, 1.25);
  v.zoomStep(-1);
  v.zoomStep(-1);
  assert.equal(v.scale, 0.75);
  v.rotate(5);
  v.reset();
  assert.equal(v.scale, 1);
  assert.equal(v.rotSteps, 0);
  for (let i = 0; i < 40; i++) v.zoomStep(1);
  assert.equal(v.scale, 32);
});

test('вид: видимая область', () => {
  const v = view();
  const b = v.worldBounds();
  near(b.minX, 0, 1e-9, 'minX');
  near(b.maxX, 1000, 1e-9, 'maxX');
  near(b.maxY, 600, 1e-9, 'maxY');
});
