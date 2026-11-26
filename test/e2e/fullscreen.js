const { app, test } = window.__phaint;
const assert = (ok,msg) => {if(!ok) throw new Error(msg);};
// Запускать с --visible: проверяем настоящий Space и оформление NSWindow.
const transition=async on=>{
  await window.phaintNative.toggleFullscreen();
  for(let i=0;i<100;i++){
    const state=await window.phaintNative.windowInfo();
    if(state.fullscreen===on && app.fullscreen===on){await test.sleep(700);return state;}
    await test.sleep(100);
  }
  throw new Error('Не завершился переход полного экрана');
};
await test.pen([[180,180,.2],[250,190,.9],[320,180,.4]],8);
test.key('KeyB'); test.key('F12');
const before = await window.phaintNative.windowInfo();
assert(before.native && (before.styleMask&1)!==0,'в обычном окне есть нативный заголовок');
const fullscreen = await transition(true); await test.idle();
assert(fullscreen.fullscreen && fullscreen.bounds.width===fullscreen.display.width && fullscreen.bounds.height>=fullscreen.display.height-80 && fullscreen.bounds.y+fullscreen.bounds.height===fullscreen.display.y+fullscreen.display.height,'окно занимает весь экран');
assert(!fullscreen.simpleFullscreen,'используется отдельный Space macOS');
assert((fullscreen.styleMask&1)===0 && (fullscreen.styleMask&(1<<14))!==0,'полноэкранный Space без панели заголовка');
assert(app.toolbar.el.hidden && !app.panels.brush.open && !app.settings.ui.debug,'вход в полный экран закрывает интерфейс');
await test.shot('clean');
const count=app.doc.size;
await test.pen([[200,220,.3],[280,260,.8],[340,230,.4]],8);
assert(app.doc.size===count+1,'перо работает без рамки окна');
test.key('KeyB'); test.key('KeyN'); assert(!app.panels.brush.open && app.toolbar.el.hidden,'N закрывает панель в полном экране');
test.key('KeyN'); assert(!app.toolbar.el.hidden,'повторный N показывает инструменты');
const after = await transition(false); await test.idle();
assert(!after.fullscreen && after.presentation===before.presentation,'системное меню возвращено');
assert(after.styleMask===before.styleMask,'оформление обычного окна восстановлено целиком');
assert(JSON.stringify(after.bounds)===JSON.stringify(before.bounds),'размер и положение обычного окна восстановлены');
await test.shot('windowed');
const repeated=await transition(true);
assert((repeated.styleMask&1)===0 && !repeated.simpleFullscreen,'повторный вход тоже без заголовка');
const restored=await transition(false);
assert(restored.styleMask===before.styleMask,'рамка восстановлена после повторного выхода');
return {before,fullscreen,after,repeated,restored};
