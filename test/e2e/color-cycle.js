// Настройка цикла через Cmd+,, черновик, выбор цветов на холсте и профиль нового окна.
const {app,test}=window.__phaint;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const open=()=>{
  test.key('Comma',{metaKey:true});
  document.querySelector('button[data-section="colors"]').click();
  return document.querySelector('.color-cycle-editor');
};
const inputs=editor=>[...editor.querySelectorAll('input[type=color]')];
const paint=(editor,i,color)=>{
  const input=inputs(editor)[i];input.value=color;input.dispatchEvent(new Event('input',{bubbles:true}));
};
const save=async()=>{
  document.querySelector('.shortcut-dialog footer .primary').click();
  for(let i=0;i<300&&app.shortcuts.open;i++)await test.sleep(10);
  assert(!app.shortcuts.open,'Настройки сохранены');
};
const defaults=['#315ca8','#79ad65','#c9514e'],custom='#4d9160';
let editor=open();
assert(same(inputs(editor).map(input=>input.value),defaults),'Три исходных цвета по порядку');
paint(editor,0,custom);editor.querySelector('.cycle-add').click();
editor.querySelectorAll('.cycle-up')[3].click();
const expected=[custom,defaults[1],defaults[0],defaults[2]];
assert(same(inputs(editor).map(input=>input.value),expected),'Добавлен и переставлен цвет');
document.querySelector('[data-section="keys"]').click();document.querySelector('[data-section="colors"]').click();
await test.frames(3);await test.shot('settings');
assert(same(app.settings.colorCycle,defaults),'До сохранения список остаётся черновиком');
await save();
const stored=await window.phaintNative.testKeys('settings');
assert(same(stored.colorCycle,expected),'Весь упорядоченный список сохранён на диск');
app.chooseColor('#999999');
for(const color of [...expected,custom]){
  test.key('Tab');assert(app.currentColor===color,'Перебор и возврат к первому цвету');
  assert(app.palette.el.querySelectorAll('.color-btn').length===expected.length,'Все цвета в подсказке');
}
await test.pen([[160,190,.5],[205,220,.5]],1);
assert([...app.doc.values()][0].color===custom,'Перо рисует выбранным оттенком');
await app.flushSettings();
const second=await window.phaintNative.testWindows('new');
const inherited=await window.phaintNative.testWindows('eval',{id:second,code:
  'return [window.__phaint.app.settings.colorCycle,window.__phaint.app.currentColor];'});
assert(same(inherited,[expected,custom]),'Новое окно получает цикл и точный оттенок пера');
editor=open();editor.querySelector('.cycle-reset').click();
assert(same(inputs(editor).map(input=>input.value),defaults),'Возвращены стандартные цвета в черновике');
document.querySelector('.shortcut-close').click();
assert(same(app.settings.colorCycle,expected),'Отмена сброса сохранила пользовательский цикл');
editor=open();
while(inputs(editor).length>1)editor.querySelectorAll('.cycle-remove')[1].click();
assert(editor.querySelector('.cycle-remove').disabled,'Последний цвет остаётся в цикле');
await save();test.key('KeyW');assert(app.currentColor===defaults[1],'W выбирает зелёный вне цикла');
test.key('KeyE');assert(app.currentColor===defaults[2],'E выбирает красный вне цикла');
test.key('Tab');test.key('Tab');assert(app.currentColor===custom,'Цикл из одного цвета');
test.key('Tab',{shiftKey:true});
assert(app.palette.el.querySelectorAll('.color-btn').length===8,'Полная палитра содержит свой оттенок и семь стандартных');
return {colors:expected,single:app.currentColor};
