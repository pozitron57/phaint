// История рабочих файлов не включает отмены, ошибки и экспорт; переживает перезапуск.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const choices=value=>native.testFiles('choices',{choices:value});
const recent=()=>native.testFiles('recent');
assert(!await app.files.open(true)&&app.doc.size===0&&!app.files.dirty,'без истории остаётся пустой холст');
const source='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M70 70H300V130H70Z" fill="#315ca8"/></svg>';
const original=await native.testFiles('prepare',{name:'исходный.svg',text:source});
await choices({opens:['исходный.svg']});assert(await app.files.open()&&await recent()===original,'удачное открытие запоминается');
await choices({opens:[null]});assert(!await app.files.open()&&await recent()===original,'отмена не меняет последний файл');
await native.testFiles('prepare',{name:'ошибка.svg',text:'<svg broken'});await choices({opens:['ошибка.svg']});assert(!await app.files.open()&&await recent()===original,'ошибка импорта не меняет последний файл');
await test.pen([[180,250,.5],[430,280,.5]],3);await choices({saves:['рабочий.svg']});assert(await app.files.save(true),'сохранён рабочий файл');
const working=await recent();assert(working.endsWith('/рабочий.svg'),'сохранение меняет последний файл');
await choices({saves:[null]});assert(!await app.files.save(true)&&await recent()===working,'отмена сохранения не меняет выбор');
app.settings.export.format='svg';await choices({saves:['экспорт.svg']});const exporting=app.files.export();
[...document.querySelector('.export-dialog').querySelectorAll('button')].find(b=>b.textContent==='Экспортировать').click();
assert(await exporting&&await recent()===working,'экспорт копии не подменяет рабочий файл');
// Сохранение другого, ещё безымянного рисунка не меняет уже выбранную цель Cmd+R.
assert(await app.files.newDocument()&&await recent()===working,'новый рисунок сохраняет историю');
await test.pen([[200,350,.5],[400,380,.5]],3);await choices({unsaved:['save'],saves:['временный.svg']});
assert(await app.files.open(true)&&app.files.name==='рабочий.svg'&&app.doc.size===2,'после сохранения текущего открыт прежний выбранный файл');
assert(await recent()===working&&!app.files.dirty,'последний файл — успешно открытый');
await test.idle();await test.shot('remembered');return {ok:true,working};
