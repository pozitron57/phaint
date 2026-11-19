// Компактное окно: прокрутка, несколько назначений, снятие и отдельный сброс.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
app.shortcuts.show();await test.frames(2);
const dialog=document.querySelector('.shortcut-dialog'),row=id=>dialog.querySelector(`[data-shortcut-id="${id}"]`),editor=dialog.querySelector('.shortcut-editor');
const inside=element=>{const r=element.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;};
assert(inside(dialog)&&inside(dialog.querySelector('footer')),'диалог и кнопки помещаются в маленькое окно');
const rows=dialog.querySelector('.shortcut-rows');
assert(rows.getBoundingClientRect().bottom<=dialog.querySelector('.shortcut-note').getBoundingClientRect().top&&rows.scrollHeight>rows.clientHeight,'список прокручивается внутри отведённой области');
await test.shot('compact');
row('tool.pen').querySelector('.shortcut-add').click();test.key('KeyU');editor.querySelector('.primary').click();
assert(row('tool.pen').querySelectorAll('.shortcut-key').length===4,'можно добавить ещё одно сочетание');
row('tool.pen').querySelector('.shortcut-key-remove').click();assert(row('tool.pen').querySelectorAll('.shortcut-key').length===3,'удаляется только одно сочетание');
const changed=dialog.querySelector('input[type=checkbox]');changed.click();assert(dialog.querySelectorAll('.shortcut-row').length===1,'фильтр изменённых назначений');
row('tool.pen').querySelector('.shortcut-default').click();assert(dialog.querySelectorAll('.shortcut-row').length===0,'сброс одного действия возвращает все стандартные сочетания');changed.click();
row('tool.pen').querySelector('.shortcut-key').click();test.key('KeyL');await test.frames(2);
assert(inside(editor)&&editor.scrollWidth<=editor.clientWidth,'окно конфликта помещается по ширине');await test.shot('compact-conflict');
return {ok:true,width:innerWidth,height:innerHeight};
