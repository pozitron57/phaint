// Одна роль каждой клавиши и цикл линий: переходы между инструментами, а не только таблица назначений.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);},near=(a,b)=>Math.abs(a-b)<.002;
const pointer=(type,x,y,mods={})=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',mods);
const drag=(a,b,mods={})=>{pointer('pointerdown',...a,mods);pointer('pointermove',...b,mods);pointer('pointerup',...b,mods);};
app.settings.snapToGrid=false;app.settings.grid.enabled=false;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.selectTool('line',false);drag([220,300],[620,300]);const line=[...app.doc.values()][0];
for(const id of ['pen','eraser','line','arrow','coordinates','marker','ellipse','sine','parabola','hyperbola','adiabat']){
 app.selectTool(id,false);drag([300,300],[300,300],{metaKey:true});
 assert(app.tool.id==='select'&&app.selection.selected?.id===line.id&&app.doc.size===1,`Cmd выбирает из ${id}`);
 test.key('KeyX');assert(app.tool.id===id,`X возвращает ${id}`);
}
app.selectTool('select',false);app.selection.show(line);
const b=app.selection.screenBox(),cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;
drag([b.maxX,b.maxY],[cx+(b.maxX-cx)*1.2,cy+(b.maxY-cy)*1.2],{ctrlKey:true});
const resized=app.selection.selected;assert(!resized.shape.controls&&near((resized.bbox.minX+resized.bbox.maxX)/2,cx),'Ctrl на углу меняет размер от центра, не создаёт Безье');
// Control-click с правой кнопкой macOS тоже ставит точку.
pointer('pointerdown',400,220,{ctrlKey:true,button:2,buttons:2});pointer('pointerup',400,220,{ctrlKey:true,button:2});
assert(app.selection.selected.shape.controls.length===1,'Ctrl ставит точку Безье');
for(const [key,mode] of [['Digit3','dots'],['Digit1','solid'],['Digit2','dash']]){
  test.key(key);assert(app.linePattern===mode&&app.tool.id==='select','прямой выбор штриха в X');
  const state=app.history.state;test.key(key);assert(app.history.state===state,'повтор не меняет выделение');
}
for(const [key,color] of [['KeyW','#c9514e'],['KeyQ','#315ca8'],['KeyE','#79ad65']]){
  test.key(key);assert(app.selection.selected.color===color,'цвет выделенной фигуры');
  const state=app.history.state;test.key(key);assert(app.history.state===state,'повтор цвета сохраняет историю');
}
await app.applyShortcuts({'style.dash':['KeyU']});
for(const mode of ['dots','solid','dash','dots','solid']){
  test.key('KeyU');assert(app.linePattern===mode,'переназначенный прямой цикл');
}
test.key('Digit2',{shiftKey:true});assert(app.linePattern==='dots','обратный цикл');
const dash=JSON.stringify(app.selection.selected.dash);test.key('Digit2',{shiftKey:true,repeat:true});assert(JSON.stringify(app.selection.selected.dash)===dash,'удержание не пролистывает несколько видов');
app.selectTool('arrow',false);pointer('pointerdown',250,450);pointer('pointermove',700,500);
test.key('Digit2',{altKey:true});test.key('KeyW',{altKey:true});
const preview=app.tool.object(0,0);
assert(preview.color==='#c9514e'&&preview.dash&&!preview.dash.dots&&preview.shape.kind==='arrow','прямой выбор до отрыва с удерживаемой привязкой');
test.key('KeyU');assert(app.tool.object(0,0).dash.dots,'цикл работает в незавершённой стрелке');pointer('pointerup',700,500);
await test.idle();await test.shot('scheme');return {ok:true};
