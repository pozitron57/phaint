// Кривые: фиксированное начало на сетке и свободная остальная геометрия. Подсказки инструмента.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);},near=(a,b)=>Math.abs(a-b)<.002;
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const pointer=(type,x,y,mods={})=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',mods);
const preview=()=>app.tool.object(0,0);
const end=o=>({x:o.ox+o.pts.at(-3),y:o.oy+o.pts.at(-2)});
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.actions.run('view.grid');assert(!app.settings.grid.enabled,'проверяем также скрытую сетку');
let cases=0;
for(const id of ['sine','parabola','hyperbola','adiabat'])for(const defaultOn of [true,false])for(const alt of [false,true]){
  app.settings.snapToGrid=defaultOn;app.selectTool(id,false);
  const anchored=defaultOn!==alt,ox=anchored?144:133,oy=anchored?240:251;
  if(alt)test.key('AltLeft');
  pointer('pointerdown',133,251);
  let o=preview();assert(near(o.ox,ox)&&near(o.oy,oy),`${id}: начало соответствует режиму привязки`);
  assert(near(end(o).x,ox)&&near(end(o).y,oy),`${id}: до движения кривая не растягивается от привязки`);
  pointer('pointermove',293,337);o=preview();
  const before=JSON.stringify(o.shape);
  if(alt)up('AltLeft');else test.key('AltLeft');
  const toggled=preview();assert(near(toggled.ox,ox)&&near(toggled.oy,oy)&&JSON.stringify(toggled.shape)===before,`${id}: поздний Alt не меняет кривую`);
  if(!alt)up('AltLeft');
  assert(near(end(o).x,293),`${id}: длина до пера не округляется к сетке`);
  if(id==='parabola')assert(near(end(o).y,337),'конец параболы свободен по обеим осям');
  if(id==='hyperbola'||id==='adiabat')assert(near(end(o).y,oy+293-ox),'масштаб обеих осей равен свободному смещению');
  pointer('pointerup',293,337);
  if(id==='parabola'){
    const mid=(ox+293)/2;pointer('pointerdown',mid,189);pointer('pointermove',mid,181);
    o=preview();assert(near(o.ox+o.pts[48*3],mid)&&near(o.oy+o.pts[48*3+1],181),'точка изгиба остаётся под пером, не на узле');
    assert(near(end(o).x,293)&&near(end(o).y,337),'изгиб не двигает конец');pointer('pointerup',mid,181);
  }
  const saved=[...app.doc.values()].at(-1);assert(near(saved.ox,ox)&&near(saved.oy,oy),`${id}: начало сохраняется после отрыва`);cases++;
}
// Shift у параболы выравнивает концы относительно уже привязанного начала.
app.settings.snapToGrid=true;app.selectTool('parabola',false);
pointer('pointerdown',397,395);pointer('pointermove',541,446,{shiftKey:true});pointer('pointerup',541,446,{shiftKey:true});
pointer('pointerdown',474.5,301);pointer('pointerup',474.5,301);
let o=[...app.doc.values()].at(-1);assert(near(o.ox,408)&&near(o.oy,384)&&near(end(o).x,541)&&near(end(o).y,384),'Shift сохраняет горизонтальные концы со свободной длиной');
// Привязка использует координаты холста после масштаба и поворота вида.
app.view.restore({x:400,y:300,scale:1.7,rotSteps:1});app.selectTool('hyperbola',false);
const a=app.view.toScreen(133,251),b=app.view.toScreen(293,337);
pointer('pointerdown',a.x,a.y);pointer('pointermove',b.x,b.y);pointer('pointerup',b.x,b.y);
o=[...app.doc.values()].at(-1);assert(near(o.ox,144)&&near(o.oy,240)&&near(end(o).x,293),'узлы остаются в системе координат холста');
// Подсказки берут собственные настройки каждого инструмента, а не предыдущего.
app.doc.replace([]);app.history.clear();app.view.reset();app.actions.run('view.grid');
const samples=[['line','#79ad65','dash'],['arrow','#c9514e','dots'],['pen','#000000','solid']];
for(const [id,color,mode] of samples){
  Object.assign(app.settings[id],{color,dashed:mode!=='solid',dotted:mode==='dots',dashLength:6,dashGap:4,dotSpacing:5,round:false});
  app.selectTool(id,false);const toast=document.querySelector('.toast');
  assert(toast.getAttribute('aria-label').includes(color),'подсказка показывает цвет '+id);
  const sample=toast.querySelector('svg path');assert(sample.getAttribute('stroke-dasharray')===(mode==='dash'?'18 12':mode==='dots'?'0 15':null),'подсказка учитывает параметры штриха '+id);
  await test.sleep(180);await test.shot('hint-'+id);
}
app.chooseColor('#ffffff');assert(document.querySelector('.toast').getAttribute('aria-label').includes('#ffffff'),'смена цвета обновляет видимую подсказку');await test.shot('hint-white');
app.selectTool('adiabat',false);await test.shot('hint-adiabat');
app.selectTool('eraser',false);assert(!document.querySelector('.toast-color'),'ластик не показывает цвет ручки');
return {ok:true,cases};
