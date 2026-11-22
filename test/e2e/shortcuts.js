// Редактор назначений настоящими событиями, затем рисунок с изменёнными клавишами.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const wait=async(check,why='состояние')=>{for(let i=0;i<500&&!check();i++)await test.sleep(10);assert(check(),'ожидаемое состояние: '+why);};
const up=(code,mods={})=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true,...mods}));
const row=id=>document.querySelector(`[data-shortcut-id="${id}"]`);
const dialog=()=>document.querySelector('.shortcut-dialog');
const editor=()=>dialog().querySelector('.shortcut-editor');
const search=value=>{const input=dialog().querySelector('input[type=search]');input.value=value;input.dispatchEvent(new Event('input'));};
const clickText=(root,text)=>{const button=[...root.querySelectorAll('button')].find(b=>b.textContent===text);assert(button,'кнопка '+text);button.click();};
const bind=async(id,code,mods={},index=0)=>{
  search('');const r=row(id);assert(r,'действие есть в полном списке: '+id);
  (index<0?r.querySelector('.shortcut-add'):r.querySelectorAll('.shortcut-key')[index]).click();
  const before=app.tool.id;test.key(code,mods);assert(app.tool.id===before,'запись не выполняет действие');
  const apply=editor().querySelector('.primary');assert(!apply.disabled,'можно назначить клавишу');apply.click();
};
test.key('Comma',{metaKey:true});assert(app.shortcuts.open,'Cmd+, открывает настройки');
assert(document.querySelectorAll('.shortcut-row').length===app.actions.list().length,'все действия включены');
assert(row('gesture.pan')&&row('gesture.bezier')&&row('app.quit')&&row('file.export'),'включены удержание, модификаторы и системные команды');
search('+');assert(document.querySelectorAll('.shortcut-row').length===1&&row('view.zoomIn'),'поиск плюса находит увеличение масштаба');
const zoomKeys=()=>Array.from(row('view.zoomIn').querySelectorAll('.shortcut-key'),b=>b.textContent);
assert(zoomKeys().join('|')==='⇧=|⌃⇧=|⌃+ (Num)','показаны только сочетания с клавишей плюс');
row('view.zoomIn').querySelector('.shortcut-key-remove').click();search('');
assert(zoomKeys().includes('=')&&!zoomKeys().includes('⇧='),'снимается именно выбранное назначение из полного списка');
row('view.zoomIn').querySelector('.shortcut-default').click();
await test.frames(2);await test.shot('all');
// Запись настоящего Cmd+Q не должна завершить приложение через меню macOS.
row('width.thicker').querySelector('.shortcut-key').click();
await native.testKeys('input',{input:{type:'keyDown',keyCode:'Q',modifiers:['meta']}});await test.frames(2);
assert(editor().querySelector('[data-recorded]').dataset.recorded==='Cmd+KeyQ','Cmd+Q дошёл до записи, не перехвачен меню');
await native.testKeys('input',{input:{type:'keyUp',keyCode:'Q',modifiers:['meta']}});
clickText(editor(),'Отмена записи');
// Конфликт явно переносит клавишу, а не оставляет два случайных действия.
row('tool.pen').querySelector('.shortcut-key').click();test.key('KeyL');
assert(editor().textContent.includes('Прямая')&&editor().textContent.includes('Переназначить'),'виден конфликт с прямой');await test.shot('conflict');clickText(editor(),'Переназначить');
assert(row('tool.line').textContent.includes('Не назначено'),'прежнее назначение снято');
await bind('tool.line','KeyU',{},-1);await bind('width.thinner','KeyJ');await bind('color.palette','KeyT');
await bind('gesture.angle','ControlLeft',{ctrlKey:true});await bind('gesture.pan','Backquote');
await bind('tool.line','NumpadAdd',{altKey:true},-1);
search('+');assert(row('tool.line')&&row('view.zoomIn')&&document.querySelectorAll('.shortcut-row').length===2,'поиск учитывает новое назначение в черновике');
await bind('gesture.select','AltLeft',{altKey:true});await bind('gesture.bezier','ShiftLeft',{shiftKey:true},-1);
await bind('edit.copy','KeyC',{metaKey:true,shiftKey:true});await bind('file.save','KeyK',{metaKey:true,shiftKey:true});
// Не сохраняем при отмене, включая присвоенные конфликтующие клавиши.
clickText(dialog(),'Отмена');assert(app.actions.keysOf('tool.line').includes('KeyL')&&app.actions.keysOf('width.thinner')[0]==='F1','отмена сохранила действующие назначения');
// Сохраняем набор для проверки ввода. Повторно редактируем через видимые строки.
app.shortcuts.show();await bind('tool.line','KeyU');await bind('width.thinner','KeyJ');await bind('color.palette','KeyT');
await bind('gesture.angle','ControlLeft',{ctrlKey:true});await bind('gesture.pan','Backquote');await bind('gesture.select','AltLeft',{altKey:true});
await bind('gesture.bezier','ShiftLeft',{shiftKey:true},-1);await bind('edit.copy','KeyC',{metaKey:true,shiftKey:true});await bind('file.save','KeyK',{metaKey:true,shiftKey:true});
search('⇧⌘K');assert(document.querySelectorAll('.shortcut-row').length===1&&row('file.save'),'поиск по сочетанию');await test.shot('search');
clickText(dialog(),'Сохранить');await wait(()=>!app.shortcuts.open,'закрытие настроек');
assert(app.actions.keysOf('tool.line')[0]==='KeyU'&&app.settings.keys['gesture.angle'][0]==='Ctrl','настройки применены');
assert(await native.testKeys('menu',{id:'file.save'})==='Shift+Cmd+K','системное меню получило новое назначение');
assert(document.querySelector('[data-action="tool.line"]').title.includes('(U)'),'подсказка панели обновилась');
app.settings.snapToGrid=false;app.settings.grid.enabled=false;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
test.key('KeyL');assert(app.tool.id==='pen','старое назначение не действует');test.key('KeyU');assert(app.tool.id==='line','новое назначение выбирает прямую');
test.pointer('pointerdown',200,200,.5);test.pointer('pointermove',400,270,.5);test.key('ControlLeft',{ctrlKey:true});
let preview=app.tool.object(0,0),angle=Math.atan2(preview.pts[4],preview.pts[3]);assert(Math.abs(angle/Math.PI*180-15)<.01,'новый Ctrl ограничивает угол');
const width=app.settings.line.width;test.key('KeyJ',{ctrlKey:true});assert(app.settings.line.width<width,'новая клавиша толщины работает во время жеста с модификатором');
const color=app.currentColor;test.key('KeyT',{ctrlKey:true});assert(app.currentColor!==color,'новая клавиша цвета работает во время жеста');
test.pointer('pointerup',400,270,0);up('ControlLeft');await test.idle();let line=[...app.doc.values()].at(-1);
// Безье теперь на Shift. Переделка старой линии через M тоже работает.
test.key('ShiftLeft',{shiftKey:true});test.pointer('pointerdown',310,130,.5,'pen',{shiftKey:true});test.pointer('pointermove',310,120,.5,'pen',{shiftKey:true});test.pointer('pointerup',310,120,0,'pen',{shiftKey:true});up('ShiftLeft');
line=app.doc.get(line.id);assert(line.shape.controls?.length===1,'новый модификатор ставит точку Безье');
// Новое удержание панорамирует без клика; старый пробел не активен.
test.key('Space');assert(!app.input.panReady,'пробел отключён');up('Space');const tx=app.view.tx;
test.key('Backquote');assert(app.input.panReady,'панорамирование по новой клавише');test.pointer('pointermove',350,140,0);up('Backquote');assert(!app.input.panReady&&app.view.tx!==tx,'панорамирование работает и отпускается');
app.resetView();app.selectTool('pen',false);test.key('AltLeft',{altKey:true});assert(document.querySelector('#live').style.cursor==='pointer','новый модификатор меняет курсор');
const p=app.view.toScreen(line.ox,line.oy);test.pointer('pointerdown',p.x,p.y,.5,'pen',{altKey:true});test.pointer('pointerup',p.x,p.y,0,'pen',{altKey:true});up('AltLeft');assert(app.tool.id==='select'&&app.selection.objects.length===1,'новый модификатор переключает на M');
// Старое Cmd+C не пробивает новое назначение через меню; новое и клик меню действуют.
const write=app.platform.writeClipboardSvg;let copies=0;app.platform.writeClipboardSvg=async()=>{copies++;};
await native.testKeys('input',{input:{type:'keyDown',keyCode:'C',modifiers:['meta']}});await test.sleep(50);assert(copies===0,'старое системное сочетание не копирует объекты');
await native.testKeys('input',{input:{type:'keyDown',keyCode:'C',modifiers:['meta','shift']}});await wait(()=>copies===1,'новый хоткей копирования');await wait(()=>!app.clipboard.busy);
await native.testFiles('edit',{name:'copy'});await wait(()=>copies===2,'копирование из меню');await wait(()=>!app.clipboard.busy);app.platform.writeClipboardSvg=write;
// Вырезание — одна отменяемая операция после успешной записи в буфер.
test.key('KeyX',{metaKey:true});await wait(()=>app.doc.size===0,'вырезание');app.undo();assert(app.doc.size===1,'одна отмена возвращает вырезанный объект');
// Отдельное сохранение по новому сочетанию. Без выделения — обычный рабочий SVG.
app.selectTool('pen',false);await native.testFiles('choices',{choices:{saves:['клавиши.svg']}});test.key('KeyK',{metaKey:true,shiftKey:true});await wait(()=>!app.files.busy);assert(app.files.name==='клавиши.svg','новый хоткей сохраняет файл');
const stored=await native.testKeys('settings');assert(stored.keys['file.save'][0]==='Shift+Cmd+KeyK','назначения записаны на диск');
app.shortcuts.show();dialog().querySelector('[data-group="gestures"]').click();await test.shot('gestures');
clickText(dialog(),'Вернуть стандартные');clickText(editor(),'Вернуть стандартные');clickText(dialog(),'Сохранить');await wait(()=>!app.shortcuts.open,'закрытие настроек');
assert(app.actions.keysOf('tool.line')[0]==='KeyL'&&app.actions.keysOf('gesture.pan')[0]==='Space'&&Object.keys(app.settings.keys).length===0,'полный сброс восстановил все назначения');
// Поле настройки не блокирует команду окна, но обычные клавиши остаются текстом.
const field=document.createElement('input');document.body.append(field);field.focus();const appAction=app.platform.appAction;let command;
app.platform.appAction=id=>{command=id;};field.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',metaKey:true,bubbles:true,cancelable:true}));
assert(command==='minimize','команда окна доступна из текстового поля');app.platform.appAction=appAction;
const beforeTool=app.tool.id;field.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyL',bubbles:true,cancelable:true}));assert(app.tool.id===beforeTool,'буква в поле не меняет инструмент');field.remove();
return {ok:true,actions:app.actions.list().length};
