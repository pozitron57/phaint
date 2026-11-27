// Смена общего языка через настройки двух окон, отмена черновика и сохранность рисунка.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const workerError=async()=>{
  try{await app.files.worker.run('png',{bytes:new Uint8Array(1),level:20});}
  catch(error){return error.message;}
  throw new Error('Ожидалась ошибка сжатия PNG');
};
const saved=()=>native.testKeys('settings');
const menu=()=>native.testKeys('menuLabels');
const choose=value=>{
  const select=document.querySelector('.settings-language select');
  select.value=value;select.dispatchEvent(new Event('change'));
};
const open=()=>test.key('Comma',{metaKey:true});
const commit=async()=>{
  document.querySelector('.shortcut-dialog footer .primary').click();
  for(let i=0;i<300&&app.shortcuts.open;i++)await test.sleep(10);
  assert(!app.shortcuts.open,'Настройки закрылись после сохранения');
};
assert(app.settings.language==='en'&&(await saved()).language==='en','Первый выбор или сохранённый язык');
assert((await menu()).includes('File'),'Меню на английском при запуске');
assert((await workerError()).includes('between 0 and 9'),'Ошибка фонового потока на английском');
await test.pen([[180,200,.5],[220,225,.5],[245,240,.5]],1);
open();
const dialog=document.querySelector('.shortcut-dialog');
const labels=dialog.cloneNode(true);
labels.querySelector('.settings-language select').remove();
assert(!/[а-яё]/i.test(labels.textContent),'Все команды и пояснения переведены');
assert(dialog.querySelector('[data-shortcut-id="tool.pen"] .shortcut-title').textContent==='Pen','Переведено название действия');
assert(!/\b(?:action|help|panel|menu|settings)\.[a-z]/.test(dialog.innerText),'Видимые подписи не содержат ключей каталога');
await test.frames(4);await test.shot('settings-en');
choose('ru');dialog.querySelector('.shortcut-close').click();
assert((await saved()).language==='en'&&(await menu()).includes('File'),'Отмена сохранила английское меню');
const second=await native.testWindows('new');
await native.testWindows('eval',{id:second,code:"await window.__phaint.app.applyShortcuts({'file.save':['Cmd+KeyU']});"});
await native.testWindows('focus',{id:second});
await native.testWindows('eval',{id:second,code:`
  window.__phaint.app.shortcuts.show();
  document.querySelector('[data-shortcut-id="tool.pen"] .shortcut-key-remove').click();
`});
const before=app.history.state;
open();choose('ru');await commit();
assert((await menu()).includes('Правка')&&(await saved()).language==='ru','Русское меню и профиль');
assert((await workerError()).includes('от 0 до 9'),'Язык повторного обращения к потоку обновлён');
assert(await native.testKeys('menu',{id:'file.save'})==='Cmd+U','Ускорители активного окна сохранены');
assert(await native.testWindows('eval',{id:second,code:"await window.__phaint.app.flushSettings();return document.documentElement.lang;"})==='ru','Язык соседнего окна');
const neighbor=await native.testWindows('eval',{id:second,code:`
  const dialog=document.querySelector('.shortcut-dialog');
  return [dialog.querySelector('h2').textContent,dialog.querySelector('.settings-language select').value,
    dialog.querySelectorAll('[data-shortcut-id="tool.pen"] .shortcut-key').length];
`});
assert(neighbor.join('|')==='Настройки|ru|1','Открытые настройки переведены, черновик сохранён');
open();choose('en');await commit();
assert(app.history.state===before&&(await menu()).includes('Bring Forward'),'Выбор языка сохраняет историю и обновляет вложенные меню');
assert(!/[а-яё]/i.test(app.panels.brush.el.textContent+app.panels.background.el.textContent),'Панели инструментов переведены');
assert(document.querySelector('[data-action="tool.pen"]').title.startsWith('Pen'),'Подсказка инструмента переведена');
const exporting=app.files.export(),exportDialog=document.querySelector('.export-dialog');
for(const format of ['svg','pdf','png','jpg']){
  exportDialog.querySelector(`[data-format="${format}"]`).click();
  assert(!/[а-яё]/i.test(exportDialog.innerText),'Переведён диалог экспорта '+format);
}
exportDialog.querySelector('.export-cancel').click();await exporting;
assert(app.doc.size===1&&app.history.state===before,'Рисунок и его история сохранены');
return {language:(await saved()).language};
