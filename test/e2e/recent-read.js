// Новый процесс с теми же данными: пустой запуск и настоящее Cmd+R через Electron.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const choices=value=>native.testFiles('choices',{choices:value});
const wait=async check=>{for(let i=0;i<500&&!check();i++)await test.sleep(10);assert(check(),'дождались открытия');};
assert(app.doc.size===0&&!app.files.file&&!app.files.dirty,'после запуска холст пуст');
assert((await app.platform.files.recent()).name==='рабочий.svg','история сохранилась между процессами');
assert(await native.testKeys('menu',{id:'file.recent'})==='Cmd+R','меню получило Cmd+R');
await native.testKeys('input',{input:{type:'keyDown',keyCode:'R',modifiers:['meta']}});
await native.testKeys('input',{input:{type:'keyUp',keyCode:'R',modifiers:['meta']}});
await wait(()=>!app.files.busy&&app.files.name==='рабочий.svg'&&app.doc.size===2);
assert(!app.files.dirty,'Cmd+R открыл файл без диалога выбора');
app.settings.export.format='jpg';
const repeat=async(format,expected)=>{
  const pending=app.files.export(),dialog=document.querySelector('.export-dialog');
  assert(dialog.querySelector('[data-format="svg"]').getAttribute('aria-checked')==='true','восстановлен формат экспорта рисунка');
  dialog.querySelector(`[data-format="${format}"]`).click();
  dialog.querySelector('.export-actions button:last-child').click();
  assert(!await pending,'отмена выбора файла');
  const working=await native.testFiles('recent'),last=await native.testFiles('lastDialog');
  assert(last.defaultPath===working.replace(/[^/]+$/,expected),'точный путь повторного экспорта: '+expected);
};
await repeat('svg','экспорт.svg');
await repeat('png','экспорт.png');
await repeat('svg','экспорт.svg');
await test.pen([[150,400,.5],[440,440,.5]],3);const count=app.doc.size;
await choices({unsaved:['cancel']});assert(!await app.files.open(true)&&app.doc.size===count&&app.files.dirty,'отмена сохраняет текущие изменения');
await choices({unsaved:['save']});assert(await app.files.open(true)&&app.doc.size===count&&!app.files.dirty,'читаем свежий файл после сохранения того же документа');
// Читается файл с диска, а не старое содержимое из памяти.
await native.testFiles('prepare',{name:'рабочий.svg',text:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M80 80H400V180H80Z" fill="#79ad65"/></svg>'});
assert(await app.files.open(true)&&app.doc.size===1,'внешнее изменение прочитано');
await test.idle();await test.shot('reopened');
const objects=[...app.doc.values()];await native.testFiles('remove',{name:'рабочий.svg'});
assert(!await app.files.open(true)&&[...app.doc.values()].every((o,i)=>o===objects[i]),'исчезнувший файл не очищает текущий рисунок');
assert((await native.testFiles('errors')).some(s=>s.includes('перемещён или удалён')),'понятная ошибка с Cmd+O');
return {ok:true,reopened:count,expectedErrors:await native.testFiles('errors')};
