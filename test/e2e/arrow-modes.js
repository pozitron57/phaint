// Явные режимы стрелки: клавиши, курсор, общая кнопка, настройки и пользовательские назначения.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const key=(both)=>{test.key('Digit3',{shiftKey:both});up('Digit3');up('ShiftLeft');};
const cursor=()=>document.querySelector('#live').style.cursor;
const last=()=>[...app.doc.values()].at(-1);
const button=document.querySelector('[data-action="tool.arrow"]');
app.settings.snapToGrid=false;app.settings.grid.enabled=false;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
Object.assign(app.settings.arrow,{width:6,color:'#315ca8',both:true,headType:'open'});
key(false);assert(app.tool.id==='arrow'&&!app.settings.arrow.both,'3 явно выбирает один конец');
const single=cursor();await test.pen([[230,200,.5],[700,200,.5]],1);
assert(!last().shape.both,'рисунок с одним наконечником');const original=last(),tool=app.tool;
key(true);assert(app.tool===tool&&app.settings.arrow.both,'Shift+3 меняет режим, сохраняя последнюю фигуру');
assert(cursor()!==single&&button.dataset.mode==='arrowBoth'&&button.title.includes('⇧3'),'курсор и кнопка показывают два конца');
assert(app.doc.get(original.id)===original,'смена режима не переделывает уже готовую стрелку');
await test.pen([[230,340,.5],[700,340,.5]],1);assert(last().shape.both,'рисунок с двумя наконечниками');
const double=cursor();key(false);assert(app.tool.id==='arrow'&&!app.settings.arrow.both&&cursor()===single,'3 возвращает один конец без выхода из стрелки');
key(false);assert(app.tool.id==='pen','повтор того же режима возвращает прежний инструмент');
key(true);assert(app.tool.id==='arrow'&&cursor()===double,'Shift+3 из ручки возвращает два конца');
test.key('KeyC');assert(app.tool.id==='coordinates'&&cursor()!==double,'координаты имеют отдельный курсор');
test.key('KeyD');button.click();assert(app.tool.id==='coordinates','общая кнопка помнит координаты');
key(false);assert(app.tool.id==='arrow'&&!app.settings.arrow.both,'3 из координат выбирает одну стрелку');
app.changeArrow('both',true);assert(cursor()===double&&button.dataset.mode==='arrowBoth','галочка в настройках тоже обновляет курсор и кнопку');
key(true);assert(app.tool.id==='coordinates','повтор двустороннего режима возвращает предыдущий инструмент');
key(true);
// Прямое назначение нового действия доступно в настройках; существующее Shift+3 приоритетнее.
const saved=app.actions.preserveCustomBindings({'tool.pen':['Shift+Digit3']});
assert(saved['tool.arrowBoth'].length===0,'новая стандартная клавиша не перекрывает пользовательскую');
await app.applyShortcuts({'tool.arrowBoth':['KeyU']});
app.selectTool('pen',false);key(true);assert(app.tool.id==='pen','прежнее сочетание после переназначения не действует');
test.key('KeyU');assert(app.tool.id==='arrow'&&app.settings.arrow.both,'новое сочетание выбирает два конца');
await app.applyShortcuts({});
// Клавиши головок применяются к готовой фигуре и к одному объекту в M.
for(const kind of ['arrow','coordinates']){
  app.selectTool(kind,false);
  await test.pen([[200,140,.5],[620,450,.5]],1);
  const drawn=last(),w=drawn.shape.headWidth,l=drawn.shape.headLength;
  test.key('F2',{shiftKey:true});test.key('F1',{ctrlKey:true});
  assert(last().shape.headWidth===w+.25&&last().shape.headLength===l-.25,'ширина и длина сразу после отрыва');
  test.key('KeyG');
  const edited=last();
  test.key('F1',{shiftKey:true});assert(last()===edited,'другая команда завершает правку последней фигуры');
  app.selectTool('select',false);app.selection.show(edited);
  test.key('F1',{shiftKey:true});test.key('F2',{ctrlKey:true});
  assert(last().shape.headWidth===w&&last().shape.headLength===l,'размеры выделенной фигуры восстановлены');
  test.key('KeyZ');assert(last().shape.headLength===l-.25,'отмена длины');test.key('KeyY');
  await app.applyShortcuts({'arrowHead.wider':['KeyU']});
  test.key('KeyU');assert(last().shape.headWidth===w+.25,'новая клавиша ширины');
  await app.applyShortcuts({});
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
    if(width===16){const x=i*240+(both?120:0),y=(density-1)*150;g.fillStyle='#252a33';g.font='13px system-ui';g.fillText(both?'Shift+3':'3',x+35,y+24);g.drawImage(image,x+22,y+40,80,80);}
    count++;
  }
}
await test.shot('cursors');board.remove();app.view.dpr=dpr;app.settings.arrow.width=6;app.setLinePattern('solid');
await test.idle();await test.shot('arrows');return {ok:true,cursors:count};
