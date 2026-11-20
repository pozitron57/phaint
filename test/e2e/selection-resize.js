// Угловые ручки ведут размер по горизонтали, в том числе у очень широкого выделения.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(ok,message)=>{if(!ok)throw new Error(message);},near=(a,b)=>Math.abs(a-b)<.001;
const pointer=(type,x,y,mods={})=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',mods);
const drag=(a,b,mods={})=>{pointer('pointerdown',a.x,a.y,mods);pointer('pointermove',b.x,b.y,mods);pointer('pointerup',b.x,b.y,mods);};
const box=()=>app.selection.screenBox();
const corner=index=>app.selection.handles().find(h=>h.name==='resize'&&h.corner===index).point;
await native.testFiles('prepare',{name:'широкие.svg',text:'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><path fill="#315ca8" d="M220 260h480v20H220Z"/><path fill="#79ad65" d="M240 300h420v12H240Z"/></svg>'});
await native.testFiles('choices',{choices:{opens:['широкие.svg']}});assert(await app.files.open(),'открытие широких объектов');
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.settings.grid.enabled=false;app.renderer.invalidateScene();app.selectTool('select',false);
const originals=[...app.doc.values()];
const reset=(objects=originals)=>{app.doc.replace(originals);app.history.clear();app.selection.showObjects(objects);};
// Все четыре угла: рост и уменьшение определяет X, даже когда Y просит больший размер.
for(const objects of [[originals[0]],originals])for(const index of [0,1,2,3])for(const factor of [.65,1.3]){
  reset(objects);const before=box(),handle=corner(index),anchor=corner((index+2)%4);
  const target={x:anchor.x+(handle.x-anchor.x)*factor,y:handle.y+(index<2?-80:80)};
  drag(handle,target);const after=box(),current=corner(index),fixed=corner((index+2)%4);
  assert(near(current.x,target.x),'выбранный угол следует за X курсора');
  assert(near(fixed.x,anchor.x)&&near(fixed.y,anchor.y),'противоположный угол неподвижен');
  assert(near((after.maxX-after.minX)/(after.maxY-after.minY),(before.maxX-before.minX)/(before.maxY-before.minY)),'пропорции сохраняются');
  assert(app.history.undo()&&objects.every(o=>app.doc.get(o.id)===o),'одна отмена восстанавливает всю группу');
  assert(!app.history.canUndo&&app.history.redo(),'один жест — один шаг с повтором');
}
// Только движение вниз не меняет размер, документ и прежний Redo.
reset([originals[0]]);let handle=corner(2);
drag(handle,{x:handle.x+100,y:handle.y});app.history.undo();const state=app.history.state;handle=corner(2);
drag(handle,{x:handle.x,y:handle.y+100});
assert(app.selection.selected===originals[0]&&app.history.state===state&&app.history.canRedo,'вертикальное движение ничего не меняет');
// Ctrl сохраняет центр, Shift разрешает независимо вести обе координаты.
for(const centered of [false,true])for(const free of [false,true]){
  reset();const before=box(),handle=corner(2),anchor=centered?{x:(before.minX+before.maxX)/2,y:(before.minY+before.maxY)/2}:corner(0);
  const target={x:handle.x+80,y:handle.y+100};drag(handle,target,{ctrlKey:centered,shiftKey:free});const after=box();
  assert(near(after.maxX,target.x),'горизонтальная координата с модификаторами');
  if(centered)assert(near((after.minX+after.maxX)/2,anchor.x)&&near((after.minY+after.maxY)/2,anchor.y),'центр неподвижен');
  else assert(near(after.minX,anchor.x)&&near(after.minY,anchor.y),'угол неподвижен');
  if(free)assert(near(after.maxY,target.y),'Shift ведёт вертикальную координату независимо');
  else assert(near((after.maxX-after.minX)/(after.maxY-after.minY),(before.maxX-before.minX)/(before.maxY-before.minY)),'Ctrl сохраняет пропорции');
}
// Пересечение противоположного угла по каждой оси сохраняет отражение.
reset([originals[0]]);handle=corner(2);let anchor=corner(0);
drag(handle,{x:anchor.x-100,y:handle.y+80});assert(near(box().minX,anchor.x-100)&&app.selection.selected.matrix.a<0,'горизонтальное отражение следует за X');
reset([originals[0]]);handle=corner(2);anchor=corner(0);
drag(handle,{x:handle.x+80,y:anchor.y-50});assert(near(box().maxX,handle.x+80)&&app.selection.selected.matrix.d<0,'вертикальное отражение сохраняется');
// После зума и поворота речь всё ещё об экранной горизонтали.
reset();app.view.restore({x:460,y:290,scale:1.4,rotSteps:2});const before=box();handle=corner(2);anchor=corner(0);
drag(handle,{x:handle.x+90,y:handle.y+120});const after=box();
assert(near(after.maxX,handle.x+90)&&near(after.minX,anchor.x)&&near(after.minY,anchor.y),'экранная горизонталь в повёрнутом виде');
assert(near((after.maxX-after.minX)/(after.maxY-after.minY),(before.maxX-before.minX)/(before.maxY-before.minY)),'зум и поворот сохраняют пропорции');
// Снимок характерного случая: низкая группа стала чуть шире при сильном движении вниз.
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});reset();handle=corner(2);
pointer('pointerdown',handle.x,handle.y);pointer('pointermove',handle.x+100,handle.y+180);await test.idle();await test.shot('horizontal');pointer('pointerup',handle.x+100,handle.y+180);
return {ok:true,objects:app.doc.size};
