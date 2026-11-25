// Привязка вершины и свободное перетаскивание за оба конца в M настоящими событиями пера.
const {app,test}=window.__phaint;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const near=(a,b,msg)=>assert(Math.hypot(a.x-b.x,a.y-b.y)<.001,msg+' '+JSON.stringify([a,b]));
const pt=(x,y)=>({x,y}),screen=p=>app.view.toScreen(p.x,p.y);
const pointer=(type,p,mods={})=>test.pointer(type,p.x,p.y,type==='pointerup'?0:.5,'pen',mods);
const down=(p,mods)=>pointer('pointerdown',p,mods),move=(p,mods)=>pointer('pointermove',p,mods),lift=(p,mods)=>pointer('pointerup',p,mods);
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const grid=p=>pt(Math.round(p.x/24)*24,Math.round(p.y/24)*24);
const ends=o=>[pt(o.ox+o.pts[0],o.oy+o.pts[1]),pt(o.ox+o.pts.at(-3),o.oy+o.pts.at(-2))];
const controls=o=>(o.shape.controls??[]).map(p=>{const f=o.shape.frame;return pt(o.ox+f.a*p.x+f.c*p.y+f.e,o.oy+f.b*p.x+f.d*p.y+f.f);});
const normalView=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const selected=()=>app.selection.selected,byId=id=>app.doc.get(id);
normalView();app.settings.grid.step=24;app.settings.snapToGrid=false;
const a=pt(237,205),b=pt(481,319);
app.selectTool('line',false);down(a);move(b);lift(b);
const line=[...app.doc.values()].at(-1);
app.selectTool('select',false);app.settings.snapToGrid=true;app.settings.grid.enabled=false;
down(a);move(pt(239,206));assert(selected()===line,'дрожание при первом выборе не сдвигает конец');
const free=pt(265,229);move(free);near(ends(selected())[0],grid(free),'начало прямой на скрытой сетке');
near(ends(selected())[1],b,'второй конец остался между узлами');
test.key('AltLeft');near(ends(selected())[0],free,'Alt освобождает без движения пера');
up('AltLeft');near(ends(selected())[0],grid(free),'отпускание возвращает привязку');
app.settings.grid.enabled=true;app.renderer.invalidateScene();await test.idle();
await test.shot('line',{x:190,y:170,width:340,height:195});
lift(free);const edited=selected();app.undo();assert(selected()===line,'одна отмена за жест');
app.redo();assert(selected()===edited,'повтор возвращает конец на узел');app.undo();
const state=app.history.state;
down(b);move(pt(540,360));move(b);lift(b);
assert(selected()===line&&app.history.canRedo&&app.history.state===state,'возврат к исходной точке сохраняет прежний повтор');
down(b);move(pt(540,360));test.key('Escape');lift(pt(540,360));
assert(byId(line.id)===line&&app.history.canRedo&&app.history.state===state,'Esc возвращает геометрию и историю');
app.selection.show(line);
app.settings.snapToGrid=false;
down(b);move(free,{altKey:true});lift(free,{altKey:true});near(ends(selected())[1],free,'при выключенной настройке Alt также свободен');app.undo();

app.settings.snapToGrid=true;down(b);test.key('ShiftLeft');const raw=pt(a.x+140,a.y+40);move(raw);
const ray=r=>pt(a.x+Math.cos(Math.PI/12)*r,a.y+Math.sin(Math.PI/12)*r);
near(ends(selected())[1],ray(144),'Shift даёт 15 градусов и длину в шесть клеток');
test.key('AltLeft',{shiftKey:true});near(ends(selected())[1],ray(Math.hypot(140,40)),'Alt освобождает длину под Shift');
up('ShiftLeft');near(ends(selected())[1],raw,'с одним Alt конец следует за пером');
up('AltLeft');lift(raw);app.undo();assert(selected()===line,'переключение клавиш входит в один жест');

// У изогнутой стрелки оставляем на месте также обе точки Безье. Проверяем сохранённую и повёрнутую фигуру.
app.settings.snapToGrid=false;Object.assign(app.settings.arrow,{both:false,width:6,headLength:9,headWidth:6,headType:'filled'});
app.selectTool('arrow',false);down(pt(347,496));move(pt(715,447));lift(pt(715,447));
for(const c of [pt(424,318),pt(619,610)]){down(c,{ctrlKey:true});lift(c,{ctrlKey:true});}
const arrow=[...app.doc.values()].at(-1);
app.selectTool('select',false);app.selection.show(arrow);app.selection.rotate(15);
const saved=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));
app.doc.replace(saved.objects);app.history.clear();app.selection.show(byId(arrow.id));
app.view.restore({x:505,y:418,scale:1.3,rotSteps:2});app.settings.snapToGrid=true;
for(const head of ['end','start','both']){
  if(head!=='end')test.key('KeyA');
  const original=selected(),tips=ends(original),before=controls(original);
  assert(before.length===2,'две восстановленные точки Безье');
  for(const index of [0,1]){
    const h=app.selection.handles().find(h=>h.name===(index===0?'startpoint':'endpoint'));
    const tip=screen(tips[index]);
    const headed=head==='both'||(head==='start')===(index===0);
    if(headed)assert(Math.hypot(h.point.x-tip.x,h.point.y-tip.y)>10,'основание отдельно от вершины');
    for(const grip of headed?[h.point,tip]:[tip]){
      const grab=pt(grip.x+1.5,grip.y-2),raw=pt(tips[index].x+37,tips[index].y-19);
      const rawScreen=screen(raw),end=pt(grab.x+(rawScreen.x-tip.x),grab.y+(rawScreen.y-tip.y));
      down(grab);move(end);
      near(ends(selected())[index],grid(raw),'узел под вершиной, независимо от места захвата и поворота');
      near(ends(selected())[1-index],tips[1-index],'дальний конец на месте');
      controls(selected()).forEach((p,i)=>near(p,before[i],'точка Безье на месте'));
      test.key('AltLeft');near(ends(selected())[index],raw,'свободный конец сохраняет смещение до пера');
      up('AltLeft');lift(end);app.undo();assert(selected()===original,'одна отмена восстанавливает прежнюю стрелку');
    }
  }
}

await app.applyShortcuts({'gesture.grid':['Ctrl']});
normalView();app.settings.grid.enabled=true;app.renderer.invalidateScene();
const tip=ends(selected())[1],grip=app.selection.handles().find(h=>h.name==='endpoint').point;
const end=pt(grip.x+47,grip.y-21),target=pt(tip.x+47,tip.y-21);
down(grip);move(end,{altKey:true});near(ends(selected())[1],grid(target),'после переназначения Alt оставляет привязку');
test.key('ControlLeft');near(ends(selected())[1],target,'новый модификатор действует в M');
up('ControlLeft');await test.idle();await test.shot('tip');lift(end);
return {ok:true};
