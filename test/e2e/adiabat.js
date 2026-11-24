// Общая кнопка H и Shift+H, точные γ, живой изгиб, редактирование/Undo, SVG и ластик.
const {app,test}=window.__phaint;
// Геометрия прежних сценариев — без автоматической привязки; оба режима проверяет grid-crop.
app.settings.snapToGrid=false;
const assert=(v,message)=>{if(!v)throw new Error(message);};
const near=(a,b)=>Math.abs(a-b)<.002,tool=id=>app.selectTool(id,false),last=()=>[...app.doc.values()].at(-1);
const pointer=(type,x,y)=>test.pointer(type,x,y,type==='pointerup'?0:.5);
const drag=async(a,b)=>{pointer('pointerdown',...a);pointer('pointermove',...b);pointer('pointerup',...b);await test.idle();};
const endpoints=o=>[...o.pts.slice(0,2),...o.pts.slice(-3,-1),o.ox,o.oy];
const sameEnds=(a,b)=>endpoints(a).every((v,i)=>near(v,endpoints(b)[i]));
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.settings.grid.enabled=false;app.renderer.invalidateScene();
assert(app.settings.hyperbola.gamma===5/3,'по умолчанию точное 5/3');
test.key('KeyH',{shiftKey:true});assert(app.tool.id==='adiabat','Shift+H включает адиабату');test.key('KeyH',{shiftKey:true});assert(app.tool.id==='pen','повтор Shift+H возвращает ручку');
test.key('KeyH');test.key('KeyH',{shiftKey:true});test.key('KeyH',{shiftKey:true});assert(app.tool.id==='hyperbola','повтор Shift+H возвращает гиперболу');test.key('KeyH',{shiftKey:true});
const button=document.querySelector('[data-action="tool.hyperbola"]'),panel=app.panels.brush.el;
assert(!document.querySelector('[data-action="tool.adiabat"]'),'одна кнопка для H и Shift+H');
assert(button.classList.contains('active')&&button.dataset.mode==='adiabat'&&button.textContent==='5/3','степень на общей кнопке');
tool('pen');button.click();assert(app.tool.id==='adiabat','общая кнопка помнит режим');
test.key('KeyB');
panel.querySelector('[data-value="hyperbola"]').click();assert(app.tool.id==='hyperbola'&&!button.querySelector('.exponent-badge'),'гипербола без степени');
panel.querySelector('[data-value="adiabat"]').click();assert(app.tool.id==='adiabat','адиабата выбирается в B');
const gammaSection=[...panel.querySelectorAll('fieldset')].find(e=>e.querySelector('legend').textContent.startsWith('Адиабата'));
const number=gammaSection.querySelector('input[aria-label="Показатель γ"]');assert(number&&!gammaSection.querySelector('input[type=range]'),'число вместо ползунка');
gammaSection.querySelector('[data-value="1.4"]').click();assert(app.settings.hyperbola.gamma===7/5&&button.textContent==='7/5','быстрый выбор 7/5 и степень');
gammaSection.querySelector(`[data-value="${5/3}"]`).click();assert(app.settings.hyperbola.gamma===5/3,'быстрый выбор точного 5/3');
await test.idle();await test.shot('menu');app.closePanels();

// Ветви на общей рамке: гипербола, адиабаты 7/5 и 5/3.
Object.assign(app.settings.hyperbola,{color:'#315ca8',width:4,dashed:false});
tool('hyperbola');await drag([400,150],[750,500]);const hyperbola=last();
tool('adiabat');app.chooseColor('#c9514e');
pointer('pointerdown',400,150);pointer('pointermove',750,500);
const preview=app.tool.object(0,0);app.changeGamma(7/5);const adjusted=app.tool.object(0,0);
assert(sameEnds(preview,adjusted)&&adjusted.shape.gamma===7/5,'γ меняет живой изгиб без сдвига концов');
test.key('F2');test.key('Tab');await test.frames(2);await test.shot('live');pointer('pointerup',750,500);await test.idle();
assert(last().shape.kind==='adiabat'&&last().shape.gamma===7/5&&near(last().pts[2],app.ink.width)&&last().color===app.ink.color,'один жест, цвет и толщина до отрыва');
app.changeGamma(5/3);app.chooseColor('#c9514e');await drag([400,150],[750,500]);const first=last();
await test.shot('curves');
test.key('Digit2');await drag([820,170],[1090,440]);assert(last().dash&&last().shape.gamma===5/3,'штриховая адиабата');test.key('Digit1');
test.key('KeyA',{metaKey:true});assert(app.tool.id==='select'&&app.selection.objects.length===4,'Cmd+A сохраняет выделение всех и не включает адиабату');
app.selection.show(first);test.key('Period');
const transformed=app.selection.selected;test.key('KeyB');await test.idle();
// Ввод с запятой меняет выбранную кривую; серия изменений — одна отмена.
number.focus();for(const value of ['1,5','1,7']){number.value=value;number.dispatchEvent(new Event('input',{bubbles:true}));}number.blur();
const changed=app.selection.selected;
assert(near(changed.shape.gamma,1.7)&&sameEnds(transformed,changed),'γ выбранной повёрнутой кривой; концы на месте');
assert(app.doc.get(hyperbola.id)===hyperbola&&app.settings.hyperbola.gamma===1.7,'гипербола не меняется; новая γ сохранена для следующей адиабаты');
test.key('KeyZ');assert(app.selection.selected.shape.gamma===5/3,'одна отмена восстанавливает γ до ввода числа');test.key('KeyY');
await test.idle();await test.shot('selection');app.closePanels();
const saveSettings=app.platform.saveSettings;let savedSettings;
app.platform.saveSettings=async value=>{savedSettings=structuredClone(value);await saveSettings(value);};
try{await app.flushSettings();}finally{app.platform.saveSettings=saveSettings;}
assert(savedSettings.hyperbola.gamma===1.7,'γ передаётся в сохраняемые настройки');

const data=app.files.snapshot(),svg=await app.files.worker.run('svg',data),restored=await app.files.worker.run('native',svg);
assert(restored.objects.filter(o=>o.shape?.kind==='adiabat').length===3,'SVG восстанавливает три адиабаты');
assert(restored.objects.find(o=>o.id===first.id).shape.gamma===1.7,'SVG сохраняет точное значение γ после правки');
app.doc.replace(restored.objects);app.history.clear();tool('select');app.selection.show(app.doc.get(first.id));app.changeGamma(5/3);
assert(app.selection.selected.shape.gamma===5/3&&sameEnds(changed,app.selection.selected),'γ редактируется после открытия SVG');
const o=app.selection.selected,mid=(Math.floor(o.pts.length/6))*3,p=app.view.toScreen(o.ox+o.pts[mid],o.oy+o.pts[mid+1]);
tool('eraser');await drag([p.x,p.y],[p.x,p.y]);assert(!app.doc.get(o.id),'ластик режет адиабату');test.key('KeyZ');assert(app.doc.get(o.id)===o,'Undo возвращает параметры адиабаты');
tool('adiabat');await test.idle();await test.shot('final');
// H и A отражаются направлением жеста: I, II, III и IV четверти.
app.doc.replace([]);app.history.clear();
for(const kind of ['hyperbola','adiabat']){
  tool(kind);app.chooseColor(kind==='hyperbola'?'#315ca8':'#c9514e');
  for(const [a,b] of [[[300,150],[520,370]],[[950,150],[730,370]],[[950,720],[730,500]],[[300,720],[520,500]]]){
    pointer('pointerdown',...a);pointer('pointermove',...b);
    const preview=app.tool.object(0,0),x=Math.sign(b[0]-a[0]),y=Math.sign(b[1]-a[1]);
    assert(preview.shape.frame.a===x&&preview.shape.frame.d===y,'четверть видна ещё до отрыва');
    pointer('pointerup',...b);await test.idle();const o=last();
    assert(near(o.ox,a[0])&&near(o.oy,a[1])&&near(o.ox+o.pts.at(-3),b[0])&&near(o.oy+o.pts.at(-2),b[1]),'отражение сохраняет начало и масштаб');
  }
}
await test.shot('quadrants');
const quadrantData=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));
assert(quadrantData.objects.every((o,i)=>o.shape.frame.a===[...app.doc.values()][i].shape.frame.a&&o.shape.frame.d===[...app.doc.values()][i].shape.frame.d),'все четверти сохраняются в SVG');
return {ok:true,gamma:app.settings.hyperbola.gamma,objects:app.doc.size};
