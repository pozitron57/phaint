// Последовательная проверка Electron. Каждый обычный сценарий использует отдельные временные данные.
// Три последних запуска проверяют восстановление после сбоя и штатное закрытие настоящего процесса.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electron from 'electron';
import {verifyVectorPdf} from '../test/verify-vector-pdf.mjs';

const data = mkdtempSync(join(tmpdir(), 'phaint-lifecycle-'));
const recentData=mkdtempSync(join(tmpdir(),'phaint-recent-'));
const windowsData=mkdtempSync(join(tmpdir(),'phaint-windows-'));
const run = (name, extra = [], close = false) => {
  const result = spawnSync(electron, ['.', `--run=test/e2e/${name}.js`, `--shot=dist/e2e/${name}.png`, ...extra], { encoding:'utf8', timeout:120000 });
  process.stdout.write(result.stdout ?? '');
  if (result.status !== 0 || (!close && !result.stdout?.includes('"ok":true'))) {
    process.stderr.write(result.stderr ?? '');
    throw result.error ?? new Error(`Сценарий ${name} завершился с кодом ${result.status}`);
  }
  const row=result.stdout?.split('\n').find(line=>line.startsWith('RESULT '));return row?JSON.parse(row.slice(7)).result:undefined;
};
try {
  run('pen'); run('pen-taps'); run('pen-pressure'); run('files'); run('file-cancel'); run('input'); run('stroke-lifecycle'); run('tools'); run('line'); run('media'); run('features'); run('sine'); run('editing'); run('refinements'); run('polish'); run('geometry-tools'); run('bezier'); run('coordinates'); run('adiabat'); run('grid-crop');
  run('clipboard-export'); run('image-text'); run('windows'); run('windows-files'); run('export-quality'); run('shortcuts'); run('shortcut-gestures'); run('shortcut-layout',['--size=520x650']);
  run('modifier-scheme');for(const path of run('pdf-grid').paths)await verifyVectorPdf(path);await verifyVectorPdf(run('pdf-eraser').path);await verifyVectorPdf(run('contour-curves',['--size=520x650']).path);run('raster-options');run('svg-minify');
  run('ui-files');run('tool-hints-grid');run('selection-keys');run('selection-hit');run('selection-nearest');run('selection-resize');run('selection-order');run('space');run('svg-parts');run('svg-opening');run('pdf-import');run('arrow-modes');run('bezier-redraw');run('bezier-selection');run('bezier-remove');run('shape-redraw');
  run('recent-write',[`--test-data=${recentData}`]);run('recent-read',[`--test-data=${recentData}`]);
  run('recovery-write', [`--test-data=${data}`]);
  run('recovery-read', [`--test-data=${data}`, '--recover']);
  run('close', [`--test-data=${data}`], true);
  if (existsSync(join(data,'recovery.json'))) throw new Error('Резервная копия не удалена после закрытия');
  if (!readFileSync(join(data,'files','при-закрытии.svg'),'utf8').includes('<path ')) throw new Error('Закрытие не сохранило SVG');
  run('fresh', [`--test-data=${data}`, '--recover']);
  run('windows-recovery-write',[`--test-data=${windowsData}`]);
  run('windows-recovery-read',[`--test-data=${windowsData}`,'--recover'],true);
  if(readdirSync(windowsData).some(name=>/^recovery.*\.json$/.test(name)))throw new Error('Остались резервные копии закрытых окон');
  for(const name of ['первое-восстановлено.svg','второе-восстановлено.svg'])if(!readFileSync(join(windowsData,'files',name),'utf8').includes('<path '))throw new Error('Не сохранён рисунок окна: '+name);
  console.log('Проверены SVG, отмена диалогов, внешние правки, восстановление, закрытие и пустой запуск.');
} finally { rmSync(data, { recursive:true, force:true });rmSync(recentData,{recursive:true,force:true});rmSync(windowsData,{recursive:true,force:true}); }
