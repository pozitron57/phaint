// Вторичный щелчок и тап без pointerdown удаляют одну ручку; Ctrl-click остаётся Безье.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const last=()=>[...app.doc.values()].at(-1);
const control=(o,i)=>{const m=o.shape.frame,p=o.shape.controls[i];return app.view.toScreen(o.ox+m.a*p.x+m.c*p.y+m.e,o.oy+m.b*p.x+m.d*p.y+m.f);};
const event=(type,p,mods={})=>test.pointer(type,p.x,p.y,type==='pointerup'?0:.5,'mouse',mods);
const secondary=(p,tap=false)=>{
  if(!tap)event('pointerdown',p,{button:2,buttons:2});
  event('contextmenu',p,{button:2,buttons:tap?0:2});
  if(!tap)event('pointerup',p,{button:2,buttons:0});
};
const bend=p=>{event('pointerdown',p,{button:2,buttons:2,ctrlKey:true});event('contextmenu',p,{button:2,buttons:2,ctrlKey:true});event('pointerup',p,{button:2,buttons:0,ctrlKey:true});};
app.settings.snapToGrid=false;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
for(const [kind,y] of [['line',300],['arrow',600]]){
  app.selectTool(kind,false);await test.pen([[240,y,.5],[850,y,.5]],1);
  bend({x:420,y:y-100});bend({x:680,y:y+100});const cubic=last();
  assert(cubic.shape.controls.length===2,'Control-click macOS добавляет точки');
  secondary({x:100,y:150});assert(last()===cubic,'правый щелчок вне ручки ничего не меняет');
  const before=app.history.state;
  secondary(control(cubic,0));let quadratic=last();
  assert(quadratic.shape.controls.length===1&&quadratic.shape.controls[0]===cubic.shape.controls[1],'удаляется первая точка, вторая остаётся');
  app.undo();assert(last()===cubic&&app.history.state===before,'одно Undo возвращает точку');app.redo();assert(last()===quadratic,'Redo удаляет её вновь');
  secondary(control(quadratic,0),true);const straight=last();
  assert(!straight.shape.controls&&straight.pts.length===6,'вторичный тап убирает последнюю точку и выпрямляет');
  assert(straight.shape.length===cubic.shape.length&&straight.shape.height===cubic.shape.height&&straight.id===cubic.id,'концы и объект сохранены');
  app.undo();app.undo();assert(last()===cubic,'обе точки возвращаются');
}
const restored=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));
app.doc.replace(restored.objects);app.history.clear();app.selectTool('select',false);
for(const o of [...app.doc.values()]){
  app.selection.show(o);app.selection.rotate(25);
  const cubic=app.selection.selected;
  app.view.restore({x:o.ox+300,y:o.oy,scale:1.4,rotSteps:1});
  const p=control(cubic,1);app.input.blocked=true;secondary(p,true);app.input.blocked=false;
  assert(app.selection.selected===cubic,'заблокированный ввод не удаляет точку');
  secondary({x:p.x+3,y:p.y-2},true);const quadratic=app.selection.selected;
  assert(quadratic.shape.controls.length===1&&quadratic.shape.controls[0]===cubic.shape.controls[0],'M: удаление второй ручки после SVG, поворота фигуры и вида');
  app.undo();assert(app.selection.selected===cubic,'M: Undo возвращает выделенную кривую');app.redo();
  secondary(control(quadratic,0));assert(!app.selection.selected.shape.controls,'M: последняя ручка выпрямляет кривую');
  app.undo();app.undo();
}
app.view.restore({x:550,y:450,scale:1,rotSteps:0});await test.idle();await test.shot('restored');
return {ok:true,curves:app.doc.size,mouse:true,tap:true,undo:true,svg:true};
