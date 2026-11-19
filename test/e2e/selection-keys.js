// Стрелки двигают выделение, не вид; шаг в клетках/пикселях и одна отмена удержания.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);},near=(a,b)=>Math.abs(a-b)<.0001;
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const tap=(code,mods={})=>{test.key(code,mods);up(code);};
const pointer=(type,x,y,mods={})=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',mods);
const snapshot=()=>[...app.selection.objects];
const moved=(before,dx,dy)=>{
  for(const o of before){
    const n=app.doc.get(o.id),a=app.view.toScreen(o.ox,o.oy),b=app.view.toScreen(n.ox,n.oy);
    assert(near(b.x-a.x,dx)&&near(b.y-a.y,dy),'сдвиг по экрану '+o.kind);
    assert(o.pts===n.pts&&o.shape===n.shape&&o.matrix===n.matrix&&o.erasures===n.erasures&&o.clip===n.clip&&o.source===n.source,'перенос сохраняет геометрию и ресурсы '+o.kind);
  }
};
await native.testFiles('prepare',{name:'контур.svg',text:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><path fill="#c9514e" d="M180 290h100v70H180Z"/></svg>'});
await native.testFiles('choices',{choices:{opens:['контур.svg']}});assert(await app.files.open(),'исходный вектор');
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.settings.snapToGrid=false;
app.selectTool('arrow',false);await test.pen([[300,200,.5],[610,260,.5]],3);const arrow=[...app.doc.values()].at(-1);
app.selectTool('marker',false);await test.pen([[340,360,.5],[570,370,.5]],3);
const canvas=document.createElement('canvas');canvas.width=100;canvas.height=60;const ctx=canvas.getContext('2d');ctx.fillStyle='#315ca8';ctx.fillRect(0,0,100,60);
const clipboard=app.platform.clipboardImage;app.platform.clipboardImage=async()=>({dataURL:canvas.toDataURL(),width:100,height:60});app.input.position={x:650,y:320};await app.pasteImage();app.platform.clipboardImage=clipboard;
const group=[...app.doc.values()];
app.selectTool('pen',false);await test.pen([[780,210,.5],[850,240,.5]],3);const untouched=[...app.doc.values()].at(-1);
app.selectTool('select',false);app.selection.show(arrow);app.settings.snapToGrid=true;
let before=snapshot(),version=app.view.version;
const step=app.settings.grid.step/5;
for(const [key,dx,dy] of [['ArrowUp',0,-1],['ArrowDown',0,1],['ArrowLeft',-1,0],['ArrowRight',1,0]]){
  before=snapshot();tap(key);moved(before,dx*step,dy*step);assert(app.view.version===version,'стрелки не двигают вид');
}
before=snapshot();for(let i=0;i<5;i++)tap('ArrowRight');moved(before,app.settings.grid.step,0);
before=snapshot();const state=app.history.state;test.key('ArrowUp');for(let i=0;i<7;i++)test.key('ArrowUp',{repeat:true});up('ArrowUp');moved(before,0,-8*step);
tap('KeyZ',{metaKey:true});moved(before,0,0);assert(app.history.state===state,'одна отмена возвращает всё удержание');
tap('KeyZ',{metaKey:true,shiftKey:true});moved(before,0,-8*step);
tap('ArrowDown');tap('ArrowDown');tap('KeyZ',{metaKey:true});moved(before,0,-7*step);tap('KeyZ',{metaKey:true});moved(before,0,-8*step);
// Смешанная группа, собственный центр вращения, масштаб и повёрнутый вид.
app.selection.showObjects(group.map(o=>app.doc.get(o.id)));app.view.restore({x:460,y:300,scale:1.7,rotSteps:2});
const pivot=app.selection.handles().find(h=>h.name==='pivot').point;
pointer('pointerdown',pivot.x,pivot.y,{altKey:true});pointer('pointermove',pivot.x+35,pivot.y-20,{altKey:true});pointer('pointerup',pivot.x+35,pivot.y-20,{altKey:true});
const center=app.view.toScreen(app.selection.pivot.x,app.selection.pivot.y);
const fastStep=app.settings.grid.step*2*app.view.scale;
before=snapshot();version=app.view.version;tap('ArrowRight',{shiftKey:true});moved(before,fastStep,0);
const nextCenter=app.view.toScreen(app.selection.pivot.x,app.selection.pivot.y);assert(near(nextCenter.x-center.x,fastStep)&&near(nextCenter.y-center.y,0),'центр вращения следует за группой');
assert(app.view.version===version&&app.doc.get(untouched.id)===untouched,'вид и невыбранный объект неподвижны');
// Все режимы независимы от зума; Alt остаётся ровно одним экранным пикселем.
for(const scale of [.5,2]){
  app.view.restore({x:460,y:300,scale,rotSteps:2});version=app.view.version;
  for(const [mods,units] of [[{},step],[{ctrlKey:true},app.settings.grid.step/2],[{metaKey:true},app.settings.grid.step*2],[{shiftKey:true},app.settings.grid.step*2],[{altKey:true},1/scale],[{ctrlKey:true,metaKey:true,shiftKey:true},app.settings.grid.step*2],[{altKey:true,ctrlKey:true,metaKey:true,shiftKey:true},1/scale]]){
    before=snapshot();tap('ArrowLeft',mods);moved(before,-units*scale,0);assert(app.view.version===version,'модификаторы не поворачивают и не двигают вид');
  }
}
app.settings.grid.step=30;before=snapshot();for(let i=0;i<5;i++)tap('ArrowRight');moved(before,30*app.view.scale,0);
// Поля настроек, диалоги и перетаскивание не получают перемещение по стрелкам.
before=snapshot();const field=document.createElement('input');document.body.append(field);field.focus();field.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp',bubbles:true,cancelable:true}));up('ArrowUp');field.remove();moved(before,0,0);
app.input.blocked=true;tap('ArrowUp');app.input.blocked=false;moved(before,0,0);
pointer('pointerdown',450,300);tap('ArrowUp');moved(before,0,0);pointer('pointerup',450,300);
app.selection.showObjects(before);
// Пользовательское назначение работает с тем же приоритетом и группировкой повторов.
const keys={...app.settings.keys,'view.up':['KeyU']};await app.applyShortcuts(keys);
before=snapshot();tap('ArrowUp');moved(before,0,0);test.key('KeyU');test.key('KeyU',{repeat:true});up('KeyU');moved(before,0,-2*app.settings.grid.step/5*app.view.scale);
tap('KeyZ',{metaKey:true});moved(before,0,0);await app.applyShortcuts({});
// Потеря фокуса завершает удержание; новая серия отменяется отдельно.
test.key('ArrowDown');window.dispatchEvent(new Event('blur'));test.key('ArrowDown',{repeat:true});up('ArrowDown');tap('KeyZ',{metaKey:true});moved(before,0,app.settings.grid.step/5*app.view.scale);
// Переназначенные модификаторы работают; явная команда на Cmd+стрелку приоритетна.
await app.applyShortcuts({'gesture.nudgeFine':['Ctrl'],'gesture.nudgeMedium':['Alt']});before=snapshot();tap('ArrowUp',{ctrlKey:true});moved(before,0,-1);await app.applyShortcuts({});
await app.applyShortcuts({'view.rotateCcw':['Cmd+ArrowLeft']});version=app.view.version;tap('ArrowLeft',{metaKey:true});assert(app.view.version!==version,'явное назначение поворота сохранено');await app.applyShortcuts({});
const saved=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));
for(const o of app.doc.values()){const n=saved.objects.find(n=>n.id===o.id);assert(n&&near(n.ox,o.ox)&&near(n.oy,o.oy),'сдвиг сохраняется в SVG');}
await test.idle();await test.shot('moved');
// Без выделения обычная прокрутка сохраняется, документ не изменяется.
tap('Escape');const p=app.view.toScreen(0,0),history=app.history.state;tap('ArrowUp');const q=app.view.toScreen(0,0);
assert(near(q.x,p.x)&&near(q.y-p.y,80)&&app.history.state===history,'пустое выделение: прокрутка вида на прежние 80 px');
version=app.view.version;tap('ArrowLeft',{metaKey:true});assert(app.view.version!==version,'без выделения Cmd+стрелка по-прежнему поворачивает вид');
return {ok:true,objects:app.doc.size,selectedKinds:group.map(o=>o.kind)};
