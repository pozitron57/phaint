// Настоящий Apple Vision, русские/английские строки, обрезка, отмена и общий буфер окон.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(value,message)=>{if(!value)throw new Error(message);};
const wait=async(check)=>{for(let i=0;i<1500;i++){if(await check())return;await test.sleep(10);}throw new Error('Ожидание распознавания');};
const state=()=>native.testClipboard();
const toast=()=>document.querySelector('.toast').textContent;
const key=()=>test.key('KeyC',{ctrlKey:true});
const idle=()=>wait(()=>!app.imageText.busy);
const copy=async()=>{key();await idle();return (await state()).text;};
app.settings.grid.enabled=false;app.renderer.invalidateScene();
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=480;
const g=canvas.getContext('2d');g.fillStyle='white';g.fillRect(0,0,1600,480);g.fillStyle='black';g.font='48px Arial';
g.fillText('10.3.5 [Механика] Условие задачи',60,100);g.fillText('Найдите расстояние.',60,220);g.fillText('Distance is 120 meters.',60,340);
const source=canvas.toDataURL(),originalClipboard=app.platform.clipboardImage;
const insert=async(dataURL)=>{
  app.platform.clipboardImage=async()=>({dataURL,width:800,height:240});
  app.input.position={x:160,y:200};await app.pasteImage();app.platform.clipboardImage=originalClipboard;
  return app.selection.selected;
};
const sentinel='<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
await app.platform.writeClipboardSvg(sentinel);
key();assert(!app.imageText.busy&&toast().includes('одну картинку'),'без выделения есть понятная подсказка');
assert((await state()).text===sentinel,'неподходящее выделение сохраняет буфер');
const image=await insert(source);await test.idle();
const history=app.history.state,dirty=app.files.dirty;
assert(await native.testKeys('menu',{id:'edit.copyImageText'})==='Ctrl+C','Ctrl+C есть в меню macOS');
// Настоящее событие Electron проверяет Control, не Command, и доставку в рендерер.
await native.testKeys('input',{input:{type:'keyDown',keyCode:'C',modifiers:['control']}});
await native.testKeys('input',{input:{type:'keyUp',keyCode:'C',modifiers:['control']}});
await wait(async()=>!app.imageText.busy&&(await state()).text!==sentinel);
const recognized=(await state()).text;
assert(recognized.startsWith('Условие задачи')&&recognized.includes('Найдите расстояние.')&&recognized.includes('Distance is 120 meters.'),'условие без номера и уточнения: '+recognized);
assert(recognized.indexOf('Условие')<recognized.indexOf('Найдите')&&recognized.indexOf('Найдите')<recognized.indexOf('Distance'),'строки идут сверху вниз');
assert((await state()).svg===null,'в буфере только текст, прежний SVG удалён');
assert(app.doc.get(image.id)===image&&app.doc.size===1&&app.history.state===history&&app.files.dirty===dirty,'OCR сохраняет картинку, историю и признак изменений');
assert(app.selection.selected===image,'выделение сохранено');
await test.shot('copied');
// Мелкая и повёрнутая картинка на холсте распознаётся из исходных пикселей.
app.view.restore({x:400,y:250,scale:.12,rotSteps:3});assert(await copy()===recognized,'качество не зависит от масштаба и поворота вида');
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
// Старая локальная обрезка оставляет среднюю строку и скрывает верхнюю/нижнюю.
const cropped={...image,clip:[{x:0,y:75},{x:800,y:75},{x:800,y:135},{x:0,y:135}]};
app.history.commit({added:[cropped],removed:[image]});app.selection.show(cropped);
const croppedText=await copy();assert(croppedText.includes('Найдите расстояние.')&&!croppedText.includes('Условие')&&!croppedText.includes('Distance'),'учтена обрезка: '+croppedText);
app.undo();app.selection.show(image);
// Пустая картинка и ошибка декодирования не стирают предыдущий буфер.
g.fillStyle='white';g.fillRect(0,0,1600,480);
const blank=await insert(canvas.toDataURL()),beforeBlank=(await state()).text;
await copy();assert((await state()).text===beforeBlank&&toast().includes('не найден'),'пустая картинка не меняет буфер');
app.selection.showObjects([image,blank]);key();assert(!app.imageText.busy&&toast().includes('одну картинку'),'группа не распознаётся случайно');
g.fillStyle='black';g.fillText('Задача #1869',60,100);
const headerOnly=await insert(canvas.toDataURL());
assert(await copy()===beforeBlank&&toast().includes('не найден'),'один заголовок без условия сохраняет прежний буфер');
app.doc.apply([],[headerOnly]);
app.selection.show(image);
const invalid={...image,source:'data:image/png;base64,AAAA'};app.doc.apply([invalid],[image]);app.selection.show(invalid);
await copy();assert((await state()).text===beforeBlank,'ошибка декодирования сохраняет буфер');
assert((await native.testFiles('errors')).some(error=>error.includes('картинку')),'ошибка объяснена пользователю');
app.doc.apply([image],[invalid,blank]);app.selection.show(image);
// Отмена сразу после запуска до выполнения OCR; выделение и документ остаются.
key();test.key('Escape');await idle();assert(toast().includes('отменено')&&(await state()).text===beforeBlank,'Esc отменяет без записи в буфер');
assert(app.selection.selected===image,'Esc при OCR сохраняет выделение');
// Более новое копирование из соседнего окна приоритетнее запоздавшего OCR.
const second=await native.testWindows('new');
key();await native.testWindows('eval',{id:second,code:`await window.__phaint.app.platform.writeClipboardSvg(${JSON.stringify(sentinel)});return true;`});
await idle();assert((await state()).text===sentinel,'OCR не затирает новое копирование соседнего окна');
await native.testWindows('close',{id:second});
// В поле ввода сочетание остаётся обычным событием поля.
const field=document.createElement('input');document.body.append(field);field.focus();
field.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC',ctrlKey:true,bubbles:true,cancelable:true}));
assert(!app.imageText.busy,'ввод текста не запускает OCR');field.remove();
// Переназначение обновляет меню; старое сочетание не служит запасной клавишей.
await app.applyShortcuts({...app.settings.keys,'edit.copyImageText':['Ctrl+Shift+KeyC']});
key();assert(!app.imageText.busy,'старое назначение снято');
assert(await native.testKeys('menu',{id:'edit.copyImageText'})==='Ctrl+Shift+C','новое сочетание в меню');
test.key('KeyC',{ctrlKey:true,shiftKey:true});await idle();assert((await state()).text===recognized,'работает новая клавиша');
await app.applyShortcuts({...app.settings.keys,'edit.copyImageText':['Ctrl+KeyC']});
// Медленная операция показывает кнопку; холст продолжает принимать ввод.
const recognize=app.platform.copyImageText;
app.platform.copyImageText=async(...args)=>{await test.sleep(650);return recognize(...args);};
key();await wait(()=>document.querySelector('[aria-label="Распознавание текста"]'));
const panel=document.querySelector('[aria-label="Распознавание текста"]');
assert(!app.input.blocked,'распознавание не блокирует холст');await test.shot('progress');
panel.querySelector('button').click();await idle();app.platform.copyImageText=recognize;
assert(toast().includes('отменено')&&!document.querySelector('[aria-label="Распознавание текста"]'),'кнопка отмены убирает панель');
// Новый документ отменяет ещё не закончившуюся операцию старого холста.
app.platform.copyImageText=async(...args)=>{await test.sleep(100);return recognize(...args);};
const beforeNew=(await state()).text;key();
await native.testFiles('choices',{choices:{unsaved:['discard']}});await app.files.newDocument();await idle();
assert(app.doc.size===0&&(await state()).text===beforeNew,'замена документа отменяет OCR');
app.platform.copyImageText=recognize;await insert(source);
await copy();await test.shot('result');
return {ok:true,text:recognized,cropped:croppedText};
