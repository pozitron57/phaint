// История экспорта различает документы с одинаковым именем и сохраняется между запусками.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExportHistory } from '../electron/export-history.ts';
import { repeatExportName } from '../src/files/names.ts';

test('экспорт: путь всего рисунка и выделения переживает перезапуск', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'phaint-export-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const history = new ExportHistory(dir);
  const source = '/Уроки/9 класс/Силы.svg', other = '/Уроки/10 класс/Силы.svg';
  const drawing = '/Для учеников/Задача 1.2.PDF', selection = '/Ответы/Фрагмент.svg';
  await Promise.all([history.write(source, false, drawing), history.write(source, true, selection)]);
  const reopened = new ExportHistory(dir);
  assert.equal(await reopened.read(source, false), drawing);
  assert.equal(await reopened.read(source, true), selection);
  assert.equal(await reopened.read(other, false), null);
  assert.equal(repeatExportName('Задача 1.2.PDF', 'pdf'), 'Задача 1.2.PDF');
  assert.equal(repeatExportName('Задача 1.2.PDF', 'png'), 'Задача 1.2.png');
  await reopened.write(source, false, '/Ответы/Новый.pdf');
  assert.equal(await history.read(source, false), '/Ответы/Новый.pdf');
  assert.equal(await history.read(source, true), selection);
});
