// Профили и резервные копии нескольких окон не перезаписывают друг друга.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WindowSettings } from '../electron/settings.ts';
import { recoverySlots } from '../electron/recovery.ts';

test('окна: старый снимок настроек сохраняет независимые изменения соседнего окна', async () => {
  const root=await mkdtemp(join(tmpdir(),'phaint-windows-'));
  try {
    const path=join(root,'settings.json'),store=new WindowSettings(path,true);
    const a=await store.load(1),b=await store.load(2);
    a.pen.color='#c9514e';a.keys['tool.line']=['KeyJ'];await store.save(1,a);
    b.pen.width=8;b.keys['tool.ellipse']=['KeyK'];await store.save(2,b);
    await store.save(1,a); // Штатное закрытие пишет даже неизменившийся снимок.
    const saved=JSON.parse(await readFile(path,'utf8'));
    assert.equal(saved.pen.color,'#c9514e');assert.equal(saved.pen.width,8);
    assert.deepEqual(saved.keys,{'tool.line':['KeyJ'],'tool.ellipse':['KeyK']});
    const c=await store.load(3);assert.deepEqual(c,saved);
    delete a.keys['tool.line'];await store.save(1,a);
    assert.deepEqual((await store.load(4)).keys,{'tool.ellipse':['KeyK']});
    b.pen.color='#79ad65';await store.save(2,b);
    assert.equal((await store.load(5)).pen.color,'#79ad65','явная новая правка имеет приоритет');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('окна: восстановление подхватывает все рисунки и прежний recovery.json', async () => {
  const root=await mkdtemp(join(tmpdir(),'phaint-recoveries-'));
  try {
    assert.deepEqual(await recoverySlots(root),['recovery.json']);
    for(const name of ['recovery.json','recovery-abcd-1234.json','settings.json','.recovery-dead.json.tmp'])await writeFile(join(root,name),'{}');
    assert.deepEqual(await recoverySlots(root),['recovery.json','recovery-abcd-1234.json']);
    await rm(join(root,'recovery.json'));
    assert.deepEqual(await recoverySlots(root),['recovery-abcd-1234.json']);
  } finally { await rm(root,{recursive:true,force:true}); }
});
