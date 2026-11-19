// Проверка настоящих событий macOS. Запускать отдельно с --visible.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(value,message)=>{if(!value)throw new Error(message);};
const windows=(action,data={})=>native.testWindows(action,data);
const list=()=>windows('list');
const close=async id=>{
  await windows('eval',{id,code:'return true;'}); // Сначала дождаться обработчика закрытия рендерера.
  return windows('close',{id});
};
const wait=async(condition,message)=>{
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){if(await condition())return;await test.sleep(10);}
  throw new Error('Не дождались: '+message);
};
const first=(await list())[0].id;
const state=async()=> (await list()).find(win=>win.id===first);
await windows('focus',{id:first});await wait(async()=> (await state()).focused,'фокус первого окна');
await test.pen([[170,190,.5],[360,220,.8],[500,180,.5]],5);
const history=app.history.state;
await test.sleep(600);
await windows('background');await wait(async()=> !(await state()).focused,'переход в другое приложение');
await windows('reopen-native');await wait(async()=> (await state()).focused,'возврат через Launch Services');
await test.sleep(100);
assert((await list()).length===1,'запуск из фона только показывает рисунок');
assert(app.doc.size===1&&app.history.state===history,'возврат сохраняет рисунок и историю');
await windows('reopen-native');await wait(async()=> (await list()).length===2,'второй запуск при активном холсте');
const second=(await list()).find(win=>win.id!==first).id;
assert(await windows('eval',{id:second,code:'return window.__phaint.app.doc.size===0;'}),'новый холст пуст');
await windows('focus',{id:first});
await windows('background');await wait(async()=> !(await state()).focused,'первое из двух окон ушло в фон');
await windows('reopen-native');await wait(async()=> (await state()).focused,'возврат к последнему активному окну');
assert((await list()).length===2,'возврат при двух окнах не создаёт третье');
await close(second);

await windows('minimize',{id:first});await wait(async()=> (await state()).minimized&&!(await state()).focused,'сворачивание');
await windows('reopen-native');await wait(async()=> !(await state()).minimized&&(await state()).focused,'восстановление свёрнутого окна');
assert((await list()).length===1,'свёрнутое окно восстановлено без нового холста');
await windows('hide');await wait(async()=> !(await state()).visible,'скрытие Phaint');
await windows('reopen-native');await wait(async()=> (await state()).visible&&(await state()).focused,'возврат скрытого окна');
assert((await list()).length===1,'скрытое окно восстановлено без нового холста');

assert(await native.testKeys('menu',{id:'app.newWindow'})==='Cmd+T','Cmd+T показан в меню');
await native.testKeys('input',{input:{type:'keyDown',keyCode:'T',modifiers:['meta']}});
await native.testKeys('input',{input:{type:'keyUp',keyCode:'T',modifiers:['meta']}});
await wait(async()=> (await list()).length===2,'новое окно по настоящему Cmd+T');
const fromKey=(await list()).find(win=>win.id!==first).id;
await close(fromKey);
await windows('focus',{id:first});
await app.applyShortcuts({...app.settings.keys,'app.newWindow':['Cmd+Shift+KeyN']});
test.key('KeyT',{metaKey:true});await test.sleep(100);
assert((await list()).length===1,'после переназначения Cmd+T не остаётся запасным');
test.key('KeyN',{metaKey:true,shiftKey:true});await wait(async()=> (await list()).length===2,'переназначенное новое окно');
await close((await list()).find(win=>win.id!==first).id);
await app.applyShortcuts({});
assert(app.doc.size===1&&app.history.state===history,'исходный рисунок и история не изменились');
await windows('focus',{id:first});
await test.idle();await test.shot('restored');
return {ok:true,background:true,active:true,lastWindow:true,minimized:true,hidden:true,shortcut:true,remapping:true};
