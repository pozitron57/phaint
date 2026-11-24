// Явные режимы стрелки: клавиши, курсор, общая кнопка, настройки и пользовательские назначения.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const key=(both)=>{test.key('KeyA',{shiftKey:both});up('KeyA');up('ShiftLeft');};
const cursor=()=>document.querySelector('#live').style.cursor;
const last=()=>[...app.doc.values()].at(-1);
const button=document.querySelector('[data-action="tool.line"]');
app.settings.snapToGrid=false;app.settings.grid.enabled=false;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
Object.assign(app.settings.arrow,{width:6,color:'#315ca8',both:true,headType:'open'});
key(false);assert(app.tool.id==='arrow'&&!app.settings.arrow.both,'A явно выбирает один конец');
const single=cursor();await test.pen([[230,200,.5],[700,200,.5]],1);
assert(!last().shape.both,'рисунок с одним наконечником');const original=last(),tool=app.tool;
key(true);assert(app.tool===tool&&app.settings.arrow.both,'Shift+A меняет режим, сохраняя последнюю фигуру');
assert(cursor()!==single&&button.dataset.mode==='arrowBoth'&&button.title.includes('⇧A'),'курсор и кнопка показывают два конца');
assert(app.doc.get(original.id)===original,'смена режима не переделывает уже готовую стрелку');
const panel=app.panels.brush.el;
const filled=panel.querySelector('[data-value="filled"]'),open=panel.querySelector('[data-value="open"]');
test.key('KeyB');filled.click();
app.changeArrow('headLength',8);app.changeArrow('headWidth',5);app.changeArrow('headRound',.75);
await test.pen([[230,340,.5],[700,340,.5]],1);
const two=last();
assert(two.shape.both&&two.shape.headLength===8&&two.shape.headWidth===5&&two.shape.headRound===.75&&two.shape.headType==='filled','две головки рисуются с выбранными параметрами');
const double=cursor();key(false);assert(app.tool.id==='arrow'&&!app.settings.arrow.both&&cursor()===single,'A возвращает один конец без выхода из стрелки');
assert(open.getAttribute('aria-pressed')==='true','панель показывает форму для одного конца');
await test.pen([[230,460,.5],[700,460,.5]],1);
assert(last().shape.headType==='open'&&last().shape.headLength===original.shape.headLength,'следующая одиночная стрелка сохраняет свой вид');
app.closePanels();
key(false);assert(app.tool.id==='pen','повтор того же режима возвращает прежний инструмент');
key(true);assert(app.tool.id==='arrow'&&cursor()===double,'Shift+A из ручки возвращает два конца');
test.key('KeyC');assert(app.tool.id==='coordinates'&&cursor()!==double,'координаты имеют отдельный курсор');
test.key('KeyD');button.click();assert(app.tool.id==='arrow'&&button.dataset.mode==='arrowBoth','общая кнопка помнит последнюю стрелку');
button.click();assert(app.tool.id==='line'&&button.dataset.mode==='line','повторный щелчок выбирает прямую');
button.click();assert(app.tool.id==='arrow'&&cursor()===double,'из прямой снова доступна стрелка');
document.querySelector('[data-action="tool.coordinates"]').click();assert(app.tool.id==='coordinates','отдельная кнопка координат');
key(false);assert(app.tool.id==='arrow'&&!app.settings.arrow.both,'A из координат выбирает одну стрелку');
app.changeArrow('both',true);assert(cursor()===double&&button.dataset.mode==='arrowBoth','галочка в настройках тоже обновляет курсор и кнопку');
assert(filled.getAttribute('aria-pressed')==='true','галочка возвращает вид двух головок');
key(true);assert(app.tool.id==='coordinates','повтор двустороннего режима возвращает предыдущий инструмент');
key(true);
// Прямое назначение нового действия доступно в настройках; существующее Shift+A приоритетнее.
const saved=app.actions.preserveCustomBindings({'tool.pen':['Shift+KeyA']});
assert(saved['tool.arrowBoth'].length===0,'новая стандартная клавиша не перекрывает пользовательскую');
await app.applyShortcuts({'tool.arrowBoth':['KeyU']});
app.selectTool('pen',false);key(true);assert(app.tool.id==='pen','прежнее сочетание после переназначения не действует');
test.key('KeyU');assert(app.tool.id==='arrow'&&app.settings.arrow.both,'новое сочетание выбирает два конца');
await app.applyShortcuts({});
app.selectTool('select',false);app.selection.show(two);
app.changeArrow('headWidth',7);
app.changeArrow('both',false);
assert(app.selection.selected.shape.headType==='open','флажок у выбранной стрелки применяет второй набор');
app.changeArrow('both',true);
assert(app.selection.selected.shape.headWidth===7&&app.selection.selected.shape.headType==='filled','возврат флажка восстанавливает оформление');

app.selectTool('coordinates',false);test.key('KeyB');
const slider=name=>[...panel.querySelectorAll('label')].find(row=>row.textContent.startsWith(name)).querySelector('input');
const headLength=slider('Длина головки'),headWidth=slider('Ширина головки');
const setSlider=(input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));};
assert(open.getAttribute('aria-pressed')==='true'&&Number(headLength.value)===5,'панель координат показывает свои головки при активном режиме двух концов');
filled.click();setSlider(headLength,10);setSlider(slider('Скругление углов'),.25);
await test.pen([[230,515,.5],[500,625,.5]],1);
app.selectTool('select',false);app.selection.show(last());setSlider(headWidth,6);
const axes=app.selection.selected;app.closePanels();
await app.flushSettings();
const savedSettings=await app.platform.loadSettings();
const matchesHead=(a,b)=>['headType','headLength','headWidth','headRound'].every(field=>a[field]===b[field]);
assert(matchesHead(savedSettings.arrow,original.shape)&&matchesHead(savedSettings.arrow.doubleHead,app.doc.get(two.id).shape),'панель координат сохраняет настройки обеих стрелок');
assert(matchesHead(savedSettings.coordinates,{headType:'filled',headLength:10,headWidth:6,headRound:.25})&&matchesHead(axes.shape,savedSettings.coordinates),'панель инструмента и выделенных координат сохраняет их собственные головки');

// Клавиши головок применяются к готовой фигуре и к одному объекту в M.
const cases=[[original,savedSettings.arrow],[app.doc.get(two.id),savedSettings.arrow.doubleHead],[axes,savedSettings.coordinates]];
for(const [row,[reference,preset]] of cases.entries()){
  const {kind,both}=reference.shape;
  const choose=()=>kind==='coordinates'?app.selectTool(kind,false):app.selectArrow(both);
  const draw=async x=>{
    const y=200+row*170;
    await test.pen([[x,y,.5],[x+200,y+(kind==='coordinates'?85:0),.5]],1);
    return last();
  };
  choose();const drawn=await draw(730),w=preset.headWidth,l=preset.headLength;
  assert(matchesHead(drawn.shape,preset),'новая фигура использует свой набор из меню');
  test.key('F2',{shiftKey:true});test.key('F1',{ctrlKey:true});
  const edited=app.doc.get(drawn.id);
  assert(edited.shape.headWidth===w+.25&&edited.shape.headLength===l-.25,'ширина и длина сразу после отрыва');
  assert(Number(headWidth.value)===w&&Number(headLength.value)===l&&app.doc.get(reference.id)===reference,'после правки недавней фигуры меню и соседняя фигура сохраняют свои размеры');
  test.key('KeyG');
  test.key('F1',{shiftKey:true});assert(app.doc.get(drawn.id)===edited,'другая команда завершает правку последней фигуры');
  app.selectTool('select',false);app.selection.show(reference);
  test.key('F1',{shiftKey:true});test.key('F2',{ctrlKey:true});
  const resized=app.selection.selected;
  assert(resized.shape.headWidth===w-.25&&resized.shape.headLength===l+.25,'клавиши меняют размеры выбранной фигуры');
  test.key('KeyZ');assert(app.selection.selected.shape.headLength===l,'отмена длины');test.key('KeyY');
  assert(app.selection.selected===resized,'повтор длины');
  await app.applyShortcuts({'arrowHead.wider':['KeyU']});
  test.key('KeyU');assert(app.selection.selected.shape.headWidth===w,'новая клавиша ширины');
  await app.applyShortcuts({});
  choose();const next=await draw(990);
  assert(matchesHead(next.shape,preset)&&app.doc.get(drawn.id)===edited,'после правки выделения новая фигура берёт размеры из меню, соседняя сохраняет свои');
}
await test.idle();await test.shot('head-shortcuts');
app.selectTool('arrow',false);
// Реальные PNG курсора: две головки при любых ободках, размерах и плотности экрана.
const board=document.createElement('canvas');board.width=1440;board.height=600;
board.style.cssText='position:fixed;left:100px;top:80px;width:720px;height:300px;z-index:99999;background:white';
document.body.append(board);
const g=board.getContext('2d');g.scale(2,2);g.fillStyle='#eef1f6';g.fillRect(0,0,720,300);
const dpr=app.view.dpr;let count=0;
for(const density of [1,2])for(const both of [false,true])for(const [i,pattern] of ['solid','dash','dots'].entries()){
  app.settings.arrow.both=both;app.view.dpr=density;app.setLinePattern(pattern);
  for(const width of [6,16,48,100]){
    app.settings.arrow.width=width;app.updateCursor();
    const url=cursor().match(/url\(["']?(data:image\/png;base64,[A-Za-z0-9+/=]+)/)?.[1];assert(url,'курсор принят');
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    for(let x=0;x<canvas.width;x++)assert(!data[x*4+3]&&!data[((canvas.height-1)*canvas.width+x)*4+3],'головки не обрезаны по вертикали');
    for(let y=0;y<canvas.height;y++)assert(!data[y*canvas.width*4+3]&&!data[(y*canvas.width+canvas.width-1)*4+3],'головки не обрезаны по горизонтали');
    if(width===16){const x=i*240+(both?120:0),y=(density-1)*150;g.fillStyle='#252a33';g.font='13px system-ui';g.fillText(both?'Shift+A':'A',x+35,y+24);g.drawImage(image,x+22,y+40,80,80);}
    count++;
  }
}
await test.shot('cursors');board.remove();app.view.dpr=dpr;app.settings.arrow.width=6;app.setLinePattern('solid');
await test.idle();await test.shot('arrows');return {ok:true,cursors:count};
