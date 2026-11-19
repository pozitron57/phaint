// Изменения палитры/подсказок и сетка с целыми клетками в обычном сохранении.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);};
// Стандартное имя нового рисунка — местная дата; расширение соответствует формату.
const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
await app.platform.files.chooseSave(null,false);
assert((await native.testFiles('lastDialog')).defaultPath===`${date}.svg`,'сохранение нового рисунка предлагает дату');
for(const format of ['svg','pdf','png','jpg']){
  await app.platform.files.chooseExport(null,format,false);
  assert((await native.testFiles('lastDialog')).defaultPath===`${date}.${format}`,'экспорт нового рисунка предлагает дату: '+format);
}
await app.platform.files.chooseSave(null,false,true);
assert((await native.testFiles('lastDialog')).defaultPath===`${date}-part.svg`,'выделение нового рисунка предлагает дату');
assert(app.settings.grid.save,'сетка сохраняется по умолчанию');
const color=app.currentColor;test.key('Tab',{shiftKey:true});
assert(app.palette.open&&!app.palette.el.querySelector('.palette-label').hidden&&app.currentColor===color,'Shift+Tab — вся палитра без смены цвета');
assert(!app.palette.el.textContent.includes('Tab')&&!app.palette.el.textContent.includes('←'),'нет устаревшей подсказки');
const custom=app.palette.el.querySelector('input[type=color]');custom.value='#8c5c8e';custom.dispatchEvent(new Event('input',{bubbles:true}));
assert(app.currentColor==='#8c5c8e'&&getComputedStyle(custom.parentElement).backgroundColor==='rgb(140, 92, 142)','плюс показывает выбранный цвет');
app.palette.el.querySelectorAll('button')[0].click();test.key('Tab',{shiftKey:true});
assert(custom.value==='#8c5c8e'&&getComputedStyle(custom.parentElement).backgroundColor==='rgb(140, 92, 142)','произвольный цвет остаётся под плюсом после выбора стандартного');
await test.shot('palette');app.palette.hide();
for(const [name,pattern] of [['dash','13 9'],['dots','0 9'],['solid',null]]){
 test.key('Digit2');const toast=document.querySelector('.toast');assert(toast.querySelector('svg path').getAttribute('stroke-dasharray')===pattern,'образец '+name);assert(!toast.textContent.trim(),'в подсказке нет названия штриха');await test.shot('style-'+name);
}
app.settings.snapToGrid=false;app.selectTool('line',false);await test.pen([[260,230,.5],[710,420,.5]],2);await test.idle();
await native.testFiles('choices',{choices:{saves:['1889p.svg']}});assert(await app.files.save(),'сохранение');
await app.platform.files.chooseSave(app.files.file,true);
assert((await native.testFiles('lastDialog')).defaultPath.endsWith('/1889p.svg'),'Сохранить как сохраняет существующее имя');
await app.platform.files.chooseExport(app.files.file,'pdf',false);
assert((await native.testFiles('lastDialog')).defaultPath.endsWith('/1889.pdf'),'экспорт сохраняет основу существующего имени');
await app.platform.files.chooseSave(app.files.file,false,true);
assert((await native.testFiles('lastDialog')).defaultPath.endsWith('/1889-part.svg'),'выделение получает суффикс -part без пробелов');
const svg=await native.testFiles('read',{name:'1889p.svg'}),root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
const values=root.getAttribute('viewBox').split(' ').map(Number);assert(values.every(n=>n%app.settings.grid.step===0),'границы и размер кратны клетке');
assert(root.querySelector('rect[stroke="#9eafc9"]').getAttribute('stroke-width')==='1.5','рамка темнее и толще');
const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await image.decode();
const preview=document.createElement('img');preview.src=image.src;preview.style.cssText='position:fixed;left:180px;top:140px;width:650px;background:white;z-index:100';document.body.append(preview);await test.shot('grid-frame');preview.remove();
const saveSettings=app.platform.saveSettings;let stored;app.platform.saveSettings=async s=>{stored=structuredClone(s);};try{await app.flushSettings();}finally{app.platform.saveSettings=saveSettings;}
assert(stored.customColor==='#8c5c8e'&&stored.grid.save,'произвольный цвет и сетка запоминаются');
return {ok:true,viewBox:values};
