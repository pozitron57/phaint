// Миграция настроек и пределы обработки картинок при векторном экспорте.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultExportSettings, exportImageSize, matrixScale, MAX_CONTOUR_TOLERANCE, compressionLevel, vectorCompression, vectorOptions, contourDetailLoss } from '../src/files/export-options.ts';
import { mergeSettings } from '../src/core/settings.ts';

test('настройки качества независимы у форматов, старые и неверные значения безопасно заменяются',()=>{
  assert.deepEqual(mergeSettings({version:8}).export,defaultExportSettings());
  const saved={format:'jpg',includeGrid:true,svg:{quality:'compact',editable:false,svgo:true},pdf:{quality:'high',layout:'pages'},png:{width:1800,compression:9},jpg:{width:1200,quality:72}};
  assert.deepEqual(mergeSettings({export:saved}).export,saved);
  const custom={...saved,svg:{quality:'compact',editable:true,svgo:false,precision:4,tolerance:.025},pdf:{quality:'high',layout:'sheet',precision:0,tolerance:0}};
  assert.deepEqual(mergeSettings({export:custom}).export,custom,'свои параметры переживают перезапуск, включая нулевой допуск');
  assert.equal(mergeSettings({export:{svg:{compactThin:true}}}).export.svg.compactThin,true);
  assert.equal(mergeSettings({export:{svg:{compactThin:'yes'}}}).export.svg.compactThin,undefined);
  assert.equal(mergeSettings({version:9,grid:{save:false}}).export.includeGrid,false,'перенос прежнего флажка');
  assert.equal(mergeSettings({version:9,grid:{save:false},export:{includeGrid:true}}).export.includeGrid,true,'новый выбор независим от рабочего SVG');
  assert.equal(mergeSettings({export:{includeGrid:false}}).export.includeGrid,false,'выключенный флажок переживает перезапуск');
  const limits=mergeSettings({export:{svg:{precision:8,tolerance:-2},pdf:{precision:1.5,tolerance:100}}}).export;
  assert.equal(limits.svg.precision,4);assert.equal(limits.svg.tolerance,0);assert.equal(limits.pdf.precision,2);assert.equal(limits.pdf.tolerance,MAX_CONTOUR_TOLERANCE);
  const bad=mergeSettings({export:{format:'exe',svg:{quality:'toString'},pdf:{quality:'unknown'},png:{scale:500},jpg:{scale:-1,quality:-8}}}).export;
  assert.equal(bad.format,'pdf');assert.equal(bad.svg.quality,'maximum');assert.equal(bad.pdf.quality,'maximum');assert.equal(bad.png.width,0);assert.equal(bad.jpg.width,0);assert.equal(bad.jpg.quality,10);
  const old=mergeSettings({export:{png:{scale:3},jpg:{scale:4,quality:72}}}).export;
  assert.deepEqual(old.png,{width:0,scale:3,compression:6});assert.deepEqual(old.jpg,{width:0,scale:4,quality:72});
  const clamped=mergeSettings({export:{png:{width:1e6,compression:50},jpg:{width:-1}}}).export;
  assert.equal(clamped.png.width,12000);assert.equal(clamped.png.compression,9);assert.equal(clamped.jpg.width,0);
});
test('целые уровни 0–20: старые настройки переводятся, новый край сильнее прежнего',()=>{
  assert.equal(compressionLevel(-1),0);assert.equal(compressionLevel(100),20);assert.equal(compressionLevel(8.8),9);
  for(let level=0;level<=20;level++){
    const options={quality:'maximum' as const,compression:level},values=vectorOptions(options);
    assert.equal(vectorCompression(options),level);
    if(level)assert.ok(values.tolerance>vectorOptions({...options,compression:level-1}).tolerance);
    assert.equal(mergeSettings({export:{svg:options}}).export.svg.compression,level);
  }
  assert.equal(vectorCompression({quality:'high'}),2);assert.equal(vectorCompression({quality:'compact'}),4);
  assert.equal(vectorCompression({quality:'maximum',tolerance:12,compactThin:true}),19);
  const previous=vectorOptions({quality:'maximum',precision:0,tolerance:12,compactThin:true}),current=vectorOptions({quality:'maximum',compression:19});
  assert.equal(current.precision,previous.precision);assert.equal(current.tolerance,previous.tolerance);assert.equal(current.compactThin,previous.compactThin);
  const max=vectorOptions({quality:'maximum',compression:20});assert.ok(max.tolerance>previous.tolerance);assert.ok(contourDetailLoss(max.tolerance)>contourDetailLoss(previous.tolerance));
  assert.equal(vectorOptions({quality:'compact',precision:0,tolerance:12,compactThin:true,compression:0}).tolerance,0,'бегунок имеет приоритет перед прежними полями');
  assert.equal(mergeSettings({export:{svg:{compression:9.4},pdf:{compression:'20'}}}).export.svg.compression,9);
  assert.equal(mergeSettings({export:{svg:{compression:NaN},pdf:{compression:'20'}}}).export.pdf.compression,undefined);
});
test('картинки в SVG/PDF: плотность по мировому размеру, без увеличения исходных пикселей',()=>{
  assert.deepEqual(exportImageSize(1600,900,240,135,'maximum'),{width:1600,height:900});
  assert.deepEqual(exportImageSize(1600,900,240,135,'high'),{width:720,height:405});
  assert.deepEqual(exportImageSize(1600,900,240,135,'compact'),{width:360,height:203});
  assert.deepEqual(exportImageSize(50,50,240,240,'high'),{width:50,height:50});
  for(const [w,h] of [[1e6,1e6],[1e6,1.1e6],[1.123e6,1e6],[1e7,200]]){
    const size=exportImageSize(w,h,w,h,'compact');assert.ok(size.width<=12000&&size.height<=12000&&size.width*size.height<=16000000);
  }
  assert.equal(matrixScale({a:0,b:-2,c:-3,d:0}),3);
  assert.ok(Math.abs(matrixScale({a:Math.cos(.3),b:Math.sin(.3),c:-Math.sin(.3),d:Math.cos(.3)})-1)<1e-12);
  assert.ok(matrixScale({a:1,b:0,c:1,d:1})>1.6);
});
