// Настоящие независимые рендереры: Dock, буфер, история, настройки, сохранение и закрытие.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(value,message)=>{if(!value)throw new Error(message);};
const canonical=value=>value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const windows=(action,data={})=>native.testWindows(action,data);
const evaluate=(id,code)=>windows('eval',{id,code});
const list=()=>windows('list');
const wait=async condition=>{for(let i=0;i<1000;i++){if(await condition())return;await test.sleep(10);}throw new Error('Операция не завершилась');};
const first=(await list())[0].id;
assert((await list()).length===1,'первый запуск создаёт один холст');
assert(await windows('activate')===first&&(await list()).length===1,'Dock возвращает неактивный холст');
assert(await windows('second-instance')===first&&(await list()).length===1,'повторный запуск возвращает неактивный холст');
await windows('switch-app');assert((await list()).length===1,'Cmd+Tab не создаёт окно');
const second=await windows('new');
assert((await list()).length===2,'команда нового окна создала второй холст');
const firstBounds=(await list()).find(win=>win.id===first).bounds,secondBounds=(await list()).find(win=>win.id===second).bounds;
assert(firstBounds.x!==secondBounds.x||firstBounds.y!==secondBounds.y,'новое окно сдвинуто относительно первого');
await windows('focus',{id:second});
for(const action of ['activate','second-instance','activate','switch-app','activate']){
  await windows(action);assert((await list()).length===2,'повторная активация не создаёт холст');
}
await windows('focus',{id:first});
assert(await windows('activate')===first,'возврат к последнему активному, а не последнему созданному окну');
const third=await windows('new');
assert((await list()).length===3,'можно открыть ещё одно независимое окно');
assert(await windows('close',{id:third}),'пустое третье окно закрывается отдельно');
app.settings.snapToGrid=false;app.view.reset();
app.selectTool('arrow',false);app.settings.arrow.width=4;app.settings.arrow.color='#c9514e';app.setLinePattern('dots');
test.pointer('pointerdown',180,190,.5);test.pointer('pointermove',460,290,.5);test.pointer('pointerup',460,290,0);
app.selectTool('marker',false);await test.pen([[180,350,.5],[460,350,.5]],4);
app.selectTool('pen',false);await test.pen([[180,430,.2],[260,410,.8],[360,440,.5]],4);
app.selectAll();const original=[...app.doc.values()],sourceState=app.history.state;
// Искусственно медленный Worker: вставка в другом окне должна дождаться именно новой копии.
const run=app.files.worker.run.bind(app.files.worker);
app.files.worker.run=async(...args)=>{if(args[0]==='svg')await test.sleep(250);return run(...args);};
test.key('KeyC',{metaKey:true});
const pasted=await evaluate(second,`
  const {app,test}=window.__phaint;app.input.position={x:220,y:180};
  test.key('KeyV',{metaKey:true});
  for(let i=0;i<1000&&app.doc.size!==3;i++)await test.sleep(10);
  await test.idle();await test.shot('second');
  return [...app.doc.values()].map(o=>({kind:o.kind,pts:o.pts?Array.from(o.pts):null,shape:o.shape,dash:o.dash,color:o.color,marker:o.marker}));
`);
app.files.worker.run=run;
assert(pasted.length===3,'второй холст получил три объекта');
for(let i=0;i<3;i++){
  assert(JSON.stringify(pasted[i].pts)===JSON.stringify(Array.from(original[i].pts)),'нажим и точки сохранились');
  assert(same(pasted[i].shape,original[i].shape),'стрелка осталась редактируемой');
  assert(same(pasted[i].dash,original[i].dash),'точки сохранились');
  assert(pasted[i].color===original[i].color&&pasted[i].marker===original[i].marker,'цвет и маркер сохранились');
}
assert(app.doc.size===3&&app.history.state===sourceState,'копирование не изменило первый документ');
assert(await evaluate(second,`const {app,test}=window.__phaint;test.key('KeyZ',{metaKey:true});const empty=app.doc.size===0;test.key('KeyZ',{metaKey:true,shiftKey:true});return empty&&app.doc.size===3;`),'одна отмена убирает вставку, повтор возвращает');
assert(app.doc.size===3&&app.history.state===sourceState,'история второго окна независима');
await evaluate(second,`const {app,test}=window.__phaint;app.selectAll();test.key('KeyC',{metaKey:true});while(app.clipboard.busy)await test.sleep(10);`);
app.input.position={x:680,y:180};test.key('KeyV',{metaKey:true});await wait(()=>app.doc.size===6);app.undo();
assert(app.doc.size===3,'копирование обратно и отмена работают');

// Более позднее Cmd+C имеет приоритет, даже если ранняя большая копия готовится дольше.
app.files.worker.run=async(...args)=>{if(args[0]==='svg')await test.sleep(250);return run(...args);};
app.selectAll();test.key('KeyC',{metaKey:true});
await evaluate(second,`const {app,test}=window.__phaint;app.selectAll();app.chooseColor('#cf914d');test.key('KeyC',{metaKey:true});while(app.clipboard.busy)await test.sleep(10);`);
test.key('KeyV',{metaKey:true});await wait(()=>app.doc.size===6);
assert(app.selection.objects.every(o=>o.color==='#cf914d'),'буфер содержит последнее Cmd+C');
app.undo();await evaluate(second,'window.__phaint.app.undo();');app.files.worker.run=run;

// Одновременно две резервные копии. Чистое новое окно не предлагает чужое восстановление.
await app.files.backup();await evaluate(second,'await window.__phaint.app.files.backup();');
const backupA=await app.platform.files.recoveryRead();
const backupB=await evaluate(second,'return window.__phaint.app.platform.files.recoveryRead();');
assert(backupA&&backupB&&backupA.data!==backupB.data,'раздельные копии содержат свои координаты');
const fresh=await windows('new');
assert(await evaluate(fresh,'return window.__phaint.app.doc.size===0;'),'новое окно пустое');
await windows('close',{id:fresh});
assert((await app.platform.files.recoveryRead()).data===backupA.data,'закрытие пустого окна не удаляет копию первого');

// Запись из старого окна не возвращает чужие настройки назад; меню следует активному окну.
app.settings.pen.color='#c9514e';await app.flushSettings();
await app.applyShortcuts({...app.settings.keys,'tool.line':['KeyJ']});
await evaluate(second,`const {app}=window.__phaint;app.settings.pen.width=8;await app.applyShortcuts({...app.settings.keys,'tool.line':['KeyK']});`);
await app.flushSettings();
const settings=await native.testKeys('settings');
assert(settings.pen.color==='#c9514e'&&settings.pen.width===8,'независимые изменения пресетов сохраняются');
await windows('focus',{id:first});assert(await native.testKeys('menu',{id:'tool.line'})===null,'отсутствующий пункт меню не появляется');
await app.applyShortcuts({...app.settings.keys,'file.save':['Cmd+KeyU']});
await evaluate(second,`await window.__phaint.app.applyShortcuts({...window.__phaint.app.settings.keys,'file.save':['Cmd+KeyI']});`);
assert(await native.testKeys('menu',{id:'file.save'})==='Cmd+U','фон не меняет меню первого окна');
await windows('focus',{id:second});assert(await native.testKeys('menu',{id:'file.save'})==='Cmd+I','меню переключилось вместе с окном');

// Отмена Cmd+Q оставляет оба окна; следующее закрытие второго сохраняет только его файл.
await native.testFiles('choices',{choices:{unsaved:['cancel']}});
await windows('quit');await test.sleep(150);
assert((await list()).length===2&&app.doc.size===3,'отмена общего выхода не закрыла окна');
await native.testFiles('choices',{choices:{unsaved:['save'],saves:[null]}});
assert(!await windows('close',{id:second}),'отмена диалога сохранения оставляет второе окно');
await native.testFiles('choices',{choices:{unsaved:['save'],saves:['второе-окно.svg']}});
assert(await windows('close',{id:second}),'второе окно сохранено и закрыто');
assert((await list()).length===1&&app.doc.size===3,'первое окно продолжает работать');
const decoded=await app.files.worker.run('native',await native.testFiles('read',{name:'второе-окно.svg'}));
assert(decoded.objects.length===3,'сохранён рисунок второго окна');
assert((await app.platform.files.recoveryRead()).data===backupA.data,'сохранение второго не тронуло копию первого');
const newWindow=await windows('new');
assert(await evaluate(newWindow,'return window.__phaint.app.settings.pen.width===8;'),'новое окно читает последние общие пресеты');
await windows('close',{id:newWindow});
await test.idle();await test.shot('first');
assert((await native.testFiles('errors')).length===0,'нет ошибок файлов');
return {ok:true,windows:2,copiedObjects:3};
