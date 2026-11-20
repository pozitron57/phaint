// Порядок настоящими клавишами: пиксели, выбор верхнего объекта, SVG и редактор сочетаний.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const tap=(code,mods={})=>{test.key(code,mods);up(code);};
const order=()=>[...app.doc.values()].sort((a,b)=>a.z-b.z).map(o=>o.id).join(',');
const pixel=()=>Array.from(document.querySelector('#scene').getContext('2d').getImageData(400*app.view.dpr,300*app.view.dpr,1,1).data).slice(0,3).join(',');
const commands=[['front','KeyF',false,'⌃F','Ctrl+F'],['back','KeyB',false,'⌃B','Ctrl+B'],['forward','KeyF',true,'⌃⇧F','Ctrl+Shift+F'],['backward','KeyB',true,'⌃⇧B','Ctrl+Shift+B']];
await native.testFiles('prepare',{name:'порядок.svg',text:'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="white"/><path fill="#c9514e" d="M220 180h300v200H220Z"/><path fill="#79ad65" d="M300 230h300v200H300Z"/><path fill="#315ca8" d="M380 280h300v200H380Z"/></svg>'});
await native.testFiles('choices',{choices:{opens:['порядок.svg']}});assert(await app.files.open(),'открытие трёх перекрывающихся объектов');
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});app.settings.grid.enabled=false;app.settings.snapToGrid=false;app.renderer.invalidateScene();app.selectTool('select',false);
const originals=[...app.doc.values()],background=originals[0],red=originals[1],green=originals[2],blue=originals[3];
const reset=(selected=[red])=>{app.doc.replace(originals);app.history.clear();app.selection.showObjects(selected);};
const expected={front:'1,3,4,2',back:'1,3,2,4',forward:'1,2,4,3',backward:'1,3,2,4'};
// Все четыре сочетания проходят через нативный ввод Electron, без подмены команд.
for(const [direction,code,shift] of commands){
  reset(direction==='front'?[red]:[green]);const modifiers=['control',...(shift?['shift']:[])];
  await native.testKeys('input',{input:{type:'keyDown',keyCode:code.slice(3),modifiers}});await native.testKeys('input',{input:{type:'keyUp',keyCode:code.slice(3),modifiers}});await test.idle();
  assert(order()===expected[direction],direction+': порядок '+order());
  assert(app.selection.selected.id===(direction==='front'?red.id:green.id),'выделение сохраняется');
  assert(app.doc.get(background.id)===background,'фон не заменяется');
  assert(app.history.undo()&&!app.history.canUndo&&order()==='1,2,3,4','одна отмена');assert(app.history.redo()&&order()===expected[direction],'повтор');
}
reset();await test.idle();assert(pixel()==='49,92,168','изначально спереди синий');await test.shot('before');
tap('KeyF',{ctrlKey:true});await test.idle();assert(pixel()==='201,81,78','Ctrl+F рисует красный поверх остальных');await test.shot('front');
// Выбор видит тот же верхний объект, что и отрисовка.
app.selection.show(null);test.pointer('pointerdown',400,300,.5);test.pointer('pointerup',400,300,0);assert(app.selection.selected?.id===red.id,'клик выбирает новый верхний объект');
const snapshot=app.files.snapshot(),svg=await app.files.worker.run('svg',snapshot),restored=await app.files.worker.run('native',svg);
assert(restored.objects.sort((a,b)=>a.z-b.z).map(o=>o.id).join(',')===order(),'рабочий SVG сохраняет порядок');
const visible=new DOMParser().parseFromString(svg,'image/svg+xml');assert([...visible.querySelectorAll('path[id]')].map(p=>Number(p.id.match(/\d+$/)[0])).join(',')===order(),'видимые пути SVG идут в том же порядке');
const state=app.history.state;tap('KeyF',{ctrlKey:true});assert(app.history.state===state,'повтор на верхнем краю не создаёт шаг');
// Несмежная группа сохраняет взаимный порядок и выбранные объекты.
reset([blue,red]);tap('KeyB',{ctrlKey:true});assert(order()==='1,2,4,3','группа уходит назад в прежнем порядке');
tap('KeyF',{ctrlKey:true,shiftKey:true});assert(order()==='1,3,2,4'&&app.selection.objects.map(o=>o.id).join(',')==='4,2','группа поднимается через соседа без смены состава');
// Правка одной параметрической фигуры пересобирает верхние и нижние слои кэша.
reset();app.selectTool('line',false);app.settings.line.width=12;app.chooseColor('#000000');await test.pen([[250,300,.5],[650,300,.5]],2);
app.selectTool('select',false);const line=[...app.doc.values()].at(-1);app.selection.show(line);await test.idle();assert(pixel()==='0,0,0','прямая поверх объектов');
tap('KeyB',{ctrlKey:true});await test.idle();assert(pixel()==='49,92,168','прямая ушла под объекты');
tap('KeyF',{ctrlKey:true});await test.idle();assert(pixel()==='0,0,0','кэш обновлён после подъёма прямой');
// Команды не вмешиваются в текст, незавершённый жест и заблокированный ввод.
reset();const untouched=app.history.state;
const field=document.createElement('input');document.body.append(field);field.focus();field.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',ctrlKey:true,bubbles:true,cancelable:true}));up('KeyF');field.remove();
app.input.blocked=true;tap('KeyF',{ctrlKey:true});app.input.blocked=false;
test.pointer('pointerdown',260,200,.5);tap('KeyF',{ctrlKey:true});test.pointer('pointerup',260,200,0);
assert(app.history.state===untouched&&order()==='1,2,3,4','поля и жесты защищены');
app.selection.show(null);tap('KeyF',{ctrlKey:true});assert(app.history.state===untouched,'без выделения ничего не меняется');
// Все четыре строки видны в «Выделении», их стандартные сочетания совпадают с меню macOS.
tap('Comma',{metaKey:true});assert(app.shortcuts.open,'Cmd+, открывает настройки');
const dialog=document.querySelector('.shortcut-dialog');dialog.querySelector('[data-group="selection"]').click();
const search=dialog.querySelector('input[type=search]');search.value='Порядок объектов';search.dispatchEvent(new Event('input'));
assert(dialog.querySelectorAll('.shortcut-row').length===4,'в настройках ровно четыре команды порядка');
for(const [direction,,,label,accelerator] of commands){
  const id='selection.order.'+direction,row=dialog.querySelector(`[data-shortcut-id="${id}"]`);
  assert(row?.querySelector('.shortcut-key')?.textContent===label,'сочетание видно: '+id);
  assert(await native.testKeys('menu',{id})===accelerator,'то же сочетание в системном меню: '+id);
}
await test.frames(2);await test.shot('settings');
// Переназначаем все четыре команды через редактор, сохраняем и исполняем новые клавиши.
for(let i=0;i<commands.length;i++){
  dialog.querySelector(`[data-shortcut-id="selection.order.${commands[i][0]}"] .shortcut-key`).click();
  test.key('Digit'+(i+1),{ctrlKey:true,altKey:true});up('Digit'+(i+1));
  const apply=dialog.querySelector('.shortcut-editor .primary');assert(!apply.disabled,'сочетание можно сохранить');apply.click();
}
[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Сохранить').click();
for(let i=0;i<500&&app.shortcuts.open;i++)await test.sleep(10);assert(!app.shortcuts.open,'настройки сохранены');
const stored=await native.testKeys('settings');
for(let i=0;i<commands.length;i++){
  const [direction,code,shift]=commands[i],id='selection.order.'+direction;reset(direction==='front'?[red]:[green]);
  tap(code,{ctrlKey:true,shiftKey:shift});assert(order()==='1,2,3,4','прежнее сочетание снято');
  tap('Digit'+(i+1),{ctrlKey:true,altKey:true});assert(order()===expected[direction],'новое сочетание действует');
  assert(stored.keys[id][0]===`Ctrl+Alt+Digit${i+1}`,'новое сочетание на диске');
  assert(await native.testKeys('menu',{id})===`Ctrl+Alt+${i+1}`,'системное меню обновлено');
}
await app.applyShortcuts({});reset();tap('KeyF',{ctrlKey:true});await test.idle();
return {ok:true,commands:commands.length,order:order(),pixel:pixel()};
