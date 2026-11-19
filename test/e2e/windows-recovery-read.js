// После сбоя оба рисунка восстанавливаются в своих окнах; штатный выход сохраняет каждый.
const native=window.phaintNative,{app,test}=window.__phaint;
const windows=await native.testWindows('list');
if(windows.length!==2||app.doc.size!==1)throw new Error('Не восстановлено первое окно');
const second=windows.find(w=>w.id!==windows[0].id).id;
const count=await native.testWindows('eval',{id:second,code:'return window.__phaint.app.doc.size;'});
if(count!==2)throw new Error('Не восстановлен второй рисунок');
await test.idle();await test.shot('restored');
await native.testFiles('choices',{choices:{unsaved:['save','save'],saves:['первое-восстановлено.svg','второе-восстановлено.svg']}});
await native.testWindows('quit');
await new Promise(()=>{});
