// Проверки сохранения без DOM: точный возврат нажима, внешние правки и атомарная запись.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodeData, decodeData, encodeSvg, nativeSvgData, type DocumentData } from '../src/files/codec.ts';
import { makeStroke, makeSvg, makeImage } from '../src/core/types.ts';
import { Doc } from '../src/core/doc.ts';
import { History } from '../src/core/history.ts';
import { atomicWrite, WriteQueue } from '../electron/storage.ts';

const fixture = (): DocumentData => ({
  objects: [makeStroke(3, 5, -132.25, 1e6, Float32Array.of(0, 0, 0.33, 12.1, -9.3, 2.27, 40, 0, 5), '#3f6fb5')],
  grid: { enabled: false, step: 37 }, view: { x: -4.5, y: 99.25, scale: 1.5, rotSteps: 3 },
});

test('SVG: точный возврат координат, нажима, цвета, сетки и вида', async () => {
  const data = fixture();
  const svg = await encodeSvg(data);
  assert.match(svg, /<path fill="#3f6fb5"/);
  assert.match(svg, /viewBox="-/);
  assert.deepEqual(await nativeSvgData(svg), data);
  assert.deepEqual(decodeData(encodeData(data)), data);
});

test('SVG: внешние правки имеют приоритет перед встроенным исходником', async () => {
  const svg = await encodeSvg(fixture());
  assert.equal(await nativeSvgData(svg.replace('fill="#3f6fb5"', 'fill="#ff0000"')), null);
  assert.equal(await nativeSvgData(svg.replace(/<metadata[\s\S]*?<\/metadata>\n/, '')), null);
  assert.equal(await nativeSvgData('<svg xmlns="http://www.w3.org/2000/svg"/>'), null);
});

test('SVG: пустой рисунок и встроенный сторонний вектор остаются читаемыми', async () => {
  const data = fixture(); data.objects = [];
  assert.deepEqual(await nativeSvgData(await encodeSvg(data)), data);
  data.objects = [makeSvg(1, 1, -20, 10, 100, 80, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><text x="2" y="20">А &amp; Б</text></svg>')];
  const svg = await encodeSvg(data);
  assert.match(svg, /<g transform="translate\(-20 10\)"><!--phaint-asset-1--><svg/);
  assert.deepEqual(await nativeSvgData(svg), data);
});

test('SVG: исходник и PNG записываются один раз; маски и масштаб переживают сохранение и восстановление', async () => {
  const source='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><path d="M0 0H800V600H0Z"/></svg>';
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6foAAAAASUVORK5CYII=';
  const data: DocumentData={...fixture(),baseScale:0.4,objects:[
    {...makeSvg(1,1,-20,30,800,600,source),erasures:[[15,20,90,45,12],[100,80,100,80,6]]},
    makeImage(2,2,40,50,250,125,png),
  ]};
  const svg=await encodeSvg(data);
  assert.equal(svg.split(source).length,2);
  assert.equal(svg.split(png).length,2);
  assert.match(svg,/<mask /); assert.match(svg,/xlink:href="data:image\/png/);
  assert.deepEqual(await nativeSvgData(svg),data);
  assert.deepEqual(decodeData(encodeData(data)),data);
  assert.equal(await nativeSvgData(svg.replace('stroke-width="24"','stroke-width="30"')),null);
});

test('документ: повреждённые данные не создают частичный рисунок', () => {
  const data = JSON.parse(encodeData(fixture()));
  data.objects.push(data.objects[0]);
  assert.throws(() => decodeData(JSON.stringify(data)), /номер/);
  data.objects.pop(); data.objects[0].pts = 'AAAA';
  assert.throws(() => decodeData(JSON.stringify(data)), /точки/);
  data.objects = []; data.view.scale = 0;
  assert.throws(() => decodeData(JSON.stringify(data)), /число/);
});

test('история: отмена к сохранённому состоянию и новая ветка имеют верные номера', () => {
  const doc = new Doc(), history = new History(doc);
  const obj = fixture().objects[0];
  history.commit({ added: [obj], removed: [] });
  const saved = history.state;
  history.commit({ added: [], removed: [obj] });
  history.undo(); assert.equal(history.state, saved);
  history.redo(); assert.notEqual(history.state, saved);
  history.undo(); history.commit({ added: [], removed: [obj] });
  assert.ok(!history.canRedo); assert.notEqual(history.state, saved);
  history.clear(); doc.replace([]);
  assert.equal(doc.size, 0); assert.ok(!history.canUndo && !history.canRedo);
  doc.replace([obj]); assert.equal(doc.query(obj.bbox).length, 1); assert.ok(doc.nextId() > obj.id);
});

test('запись: последовательные атомарные замены сохраняют права и не оставляют временных файлов', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phaint-storage-'));
  try {
    const file = join(dir, 'урок.svg');
    await atomicWrite(file, 'начало'); await chmod(file, 0o640);
    const queue = new WriteQueue();
    await Promise.all(['один', 'два', 'три'].map(value => queue.run(() => atomicWrite(file, value))));
    assert.equal(await readFile(file, 'utf8'), 'три');
    assert.equal((await stat(file)).mode & 0o777, 0o640);
    assert.deepEqual(await readdir(dir), ['урок.svg']);
    await assert.rejects(atomicWrite(join(file, 'невозможно.svg'), 'ошибка'));
    assert.equal(await readFile(file, 'utf8'), 'три');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('потоковая запись: до завершения виден старый SVG, отмена сохраняет его', async () => {
  const { AtomicWriter } = await import('../electron/storage.ts');
  const dir = await mkdtemp(join(tmpdir(), 'phaint-stream-'));
  try {
    const file = join(dir, 'урок.svg'); await atomicWrite(file, 'старый');
    const writer = await AtomicWriter.create(file);
    await writer.write(new TextEncoder().encode('<svg>'));
    assert.equal(await readFile(file, 'utf8'), 'старый');
    await writer.abort(); assert.equal(await readFile(file, 'utf8'), 'старый');
    const next = await AtomicWriter.create(file);
    await next.write(new TextEncoder().encode('<svg>'));
    await next.write(new TextEncoder().encode('А &amp; Б</svg>'));
    await next.commit(); await next.abort();
    assert.equal(await readFile(file, 'utf8'), '<svg>А &amp; Б</svg>');
    assert.deepEqual(await readdir(dir), ['урок.svg']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
