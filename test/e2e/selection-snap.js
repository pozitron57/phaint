// Дальняя колонка, размер снимка и перенос объектов через настоящие события пера и клавиатуры.
const {app,test}=window.__phaint;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const near=(v,w)=>Math.abs(v-w)<.001;
const up=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const pointer=(type,x,y,mods={})=>{
  const p=app.view.toScreen(x,y);
  test.pointer(type,p.x,p.y,type==='pointerup'?0:.5,'pen',mods);
};
const down=(x,y,mods)=>pointer('pointerdown',x,y,mods),move=(x,y,mods)=>pointer('pointermove',x,y,mods);
const lift=(x,y,mods)=>pointer('pointerup',x,y,mods);
const assertBox=(o,x1,y1,x2,y2,label)=>{
  const b=o.bbox;
  assert(near(b.minX,x1)&&near(b.minY,y1)&&near(b.maxX,x2)&&near(b.maxY,y2),label+' '+JSON.stringify(b));
};
async function card(x,y,w,h,title,formula,free=true){
  const c=document.createElement('canvas');c.width=w*2;c.height=h*2;
  const ctx=c.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#f8f5e9';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#263042';ctx.font='15px sans-serif';ctx.fillText(title,10,23);
  ctx.font='italic 19px Georgia';ctx.fillText(formula,10,49);
  app.platform.clipboardImage=async()=>({width:w,height:h,dataURL:c.toDataURL()});
  app.input.position=app.view.toScreen(x,y);await app.pasteImage(free?'free':'snap');
  return app.selection.selected;
}
app.settings.grid.step=24;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const first=await card(277,100,240,70,'Задача 1. Путь','s = v₀t + at² / 2');
const second=await card(370,440,200,80,'Задача 2. Энергия','E = mv² / 2');
const current=()=>app.doc.get(second.id);
const state=app.history.state;
const d=app.view.dpr,ctx=document.querySelector('#live').getContext('2d');
const dash=()=>{
  const p=app.view.toScreen(277,225),h=Math.round(60*d);
  const data=ctx.getImageData(Math.floor(p.x*d),Math.floor(p.y*d),1,h).data;
  let colored=0;
  for(let i=0;i<data.length;i+=4)if(data[i]>data[i+1]*1.4&&data[i+3]>40)colored++;
  return colored;
};
down(401,461);move(305,476);
assertBox(current(),277,456,477,536,'левое поле и сетка независимо');
await test.idle();assert(dash()>8*d&&dash()<48*d,'в промежутке видны штрихи и просветы');
await test.shot('column');
test.key('AltLeft');assertBox(current(),274,455,474,535,'свободный перенос ровно под пером');
await test.frames(2);assert(dash()===0,'Alt убирает пунктир без движения пера');
up('AltLeft');lift(305,476);await test.frames(2);assert(dash()===0,'при отрыве пунктир исчезает');
app.undo();assert(current()===second&&app.history.state===state,'одна отмена для всего переноса');

// Левый верхний угол подводим к колонке; нижний правый сохраняет положение.
down(370,440);move(281,410);
assertBox(current(),277,402.8,570,520,'при размере левое поле важнее ближайшего узла');
await test.idle();assert(dash()>8*d&&dash()<48*d,'пунктир при изменении размера');
await test.shot('resize');
test.key('ShiftLeft');assertBox(current(),277,408,570,520,'Shift независимо ставит верх на сетку');
test.key('AltLeft',{shiftKey:true});assertBox(current(),281,410,570,520,'Alt+Shift освобождает оба края');
up('AltLeft');up('ShiftLeft');lift(281,410);app.undo();
assert(current()===second&&app.history.state===state,'все модификаторы — одна отмена размера');
down(370,440);move(281,410);move(370,440);lift(370,440);
assert(current()===second&&app.history.canRedo&&app.history.state===state,'возврат угла сохраняет прежний повтор');

// Видимый сосед конкурирует с сеткой по двум осям, дальний задаёт только колонку.
const neighbor=await card(615,573,150,70,'Задача 3. Сила','F = ma');
app.selection.show(second);
down(570,520);move(612,571,{shiftKey:true});
assertBox(current(),370,440,615,573,'обе стороны пристыкованы к соседу');
const attached=current();move(613,572,{shiftKey:true});assert(current()===attached,'дрожание у стыка сохраняет готовый объект');
lift(613,572,{shiftKey:true});app.undo();
app.settings.snapToImages=false;app.settings.grid.enabled=false;
down(570,520);move(612,571,{shiftKey:true});
assertBox(current(),370,440,624,576,'скрытая сетка действует при выключенных соседях');
lift(612,571,{shiftKey:true});app.undo();
app.settings.snapToImages=true;
const far=await card(281,8100,160,65,'Задача 4. Ток','I = U / R',false);
assertBox(far,277,8112,437,8177,'V выравнивает снимок на много экранов ниже');
const leftPage={...first,id:app.doc.nextId(),ox:-900,bbox:{...first.bbox,minX:-900,maxX:-660},pdfPage:{index:0,transform:{a:1,b:0,c:0,d:1,e:0,f:0}}};
app.doc.replace([far,second,leftPage]);app.selection.show(second);
down(401,461);move(305,476);assertBox(current(),277,456,477,536,'учтён снимок за экраном, подложка пропущена');
await test.frames(2);assert(dash()>8*d,'пунктир от невидимой картинки проходит через окно');
lift(305,476);

// Стрелку берём около разных концов. Рядом лежит картинка, сетка скрыта.
app.doc.replace([first,neighbor]);app.history.clear();app.selectTool('arrow',false);
app.settings.snapToGrid=false;down(383,301);move(557,347);lift(557,347);
const arrow=[...app.doc.values()].find(o=>o.kind==='stroke'),getArrow=()=>app.doc.get(arrow.id);
const ends=(o)=>[o.ox+o.pts[0],o.oy+o.pts[1],o.ox+o.pts.at(-3),o.oy+o.pts.at(-2)];
const check=(actual,expected,label)=>assert(expected.every((v,i)=>near(v,actual[i])),label+' '+JSON.stringify(actual));
app.settings.snapToGrid=true;app.selectTool('select',false);
down(405,307);move(426,323);
check(ends(getArrow()),[408,312,582,358],'захват у хвоста ставит хвост на узел');
test.key('AltLeft');check(ends(getArrow()),[404,317,578,363],'Alt освобождает стрелку сразу');
up('AltLeft');move(588,367);
check(ends(getArrow()),[576,360,750,406],'та же опора после прохода пером мимо исходного наконечника');
lift(588,367);app.undo();assert(getArrow()===arrow,'один шаг на весь перенос стрелки');
app.selection.show(null);down(538,342);move(559,358);
check(ends(getArrow()),[402,314,576,360],'захват у наконечника ставит его на узел');
lift(559,358);app.undo();
app.selection.showObjects([first,arrow]);down(540,344);move(561,360);
check(ends(getArrow()),[402,314,576,360],'у смешанной группы ближайшим был наконечник');
assert(near(app.doc.get(first.id).ox-first.ox,19)&&near(app.doc.get(first.id).oy-first.oy,13),'группа движется целиком');
lift(561,360);app.undo();

// Концы внешнего SVG-пути расходятся с углами его рамки, в том числе после преобразования.
const path={kind:'vector',id:app.doc.nextId(),z:10,ox:200,oy:200,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},
  d:'M13 61q90 -133 170 0',fill:'none',stroke:'#315ca8',strokeWidth:4,opacity:1,
  fillRule:'nonzero',linecap:'round',linejoin:'round',bounds:{minX:5,minY:-14,maxX:191,maxY:69},
  bbox:{minX:205,minY:186,maxX:391,maxY:269}};
app.doc.replace([path]);app.selection.show(path);
down(225,247);move(246,263);const moved=app.doc.get(path.id);
check([moved.ox+13,moved.oy+61],[240,288],'узел под настоящим концом внешнего контура');
lift(246,263);
// Сетка остаётся в координатах холста после поворота вида, в том числе у группы и при отражении.
app.settings.snapToImages=false;
const onGrid=v=>near(v/24,Math.round(v/24));
for(const [rotSteps,index,independent,centered,flip] of [[1,0,false,false,false],[2,2,true,true,false],
  [4,1,true,false,true],[3,3,false,true,true]]){
  app.doc.replace([first,second]);app.selection.showObjects([first,second]);
  app.view.restore({x:410,y:320,scale:1.4,rotSteps});
  const handle=i=>app.selection.handles().find(h=>h.corner===i).point;
  const start=handle(index),opposite=handle((index+2)%4);
  const fixed=centered?{x:(start.x+opposite.x)/2,y:(start.y+opposite.y)/2}:opposite;
  const target={x:fixed.x+(start.x-fixed.x)*(flip?-.83:1.19),y:fixed.y+(start.y-fixed.y)*1.13};
  const mods={shiftKey:independent,ctrlKey:centered};
  test.pointer('pointerdown',start.x,start.y,.5,'pen',mods);
  test.pointer('pointermove',target.x,target.y,.5,'pen',mods);
  const objects=app.selection.objects,one=objects[0],m=one.matrix;
  assert(m&&objects.length===2,'размер за выбранную ручку всей группы');
  const pivot=app.view.toWorld(fixed.x,fixed.y),x=pivot.x-first.ox,y=pivot.y-first.oy;
  assert(near(one.ox+m.a*x+m.c*y+m.e,pivot.x)&&near(one.oy+m.b*x+m.d*y+m.f,pivot.y),'центр или противоположный угол неподвижен');
  assert((m.a*m.d-m.b*m.c<0)===flip,'привязка сохраняет отражение');
  if(!independent)assert(near(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d))&&near(m.a*m.c+m.b*m.d,0),'точные пропорции при повёрнутом виде');
  const xs=[Math.min(...objects.map(o=>o.bbox.minX)),Math.max(...objects.map(o=>o.bbox.maxX))];
  const ys=[Math.min(...objects.map(o=>o.bbox.minY)),Math.max(...objects.map(o=>o.bbox.maxY))];
  assert(independent?xs.some(onGrid)&&ys.some(onGrid):xs.some(onGrid)||ys.some(onGrid),'подвижные края рамки на мировой сетке');
  test.pointer('pointerup',target.x,target.y,0,'pen',mods);app.undo();
  assert(app.doc.get(first.id)===first&&app.doc.get(second.id)===second,'одна отмена размера группы');
}
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.settings.snapToImages=true;
// Последним кадром оставляем два выровненных условия.
app.doc.replace([first,second]);app.selection.show(second);
down(401,461);move(305,476);lift(305,476);await test.idle();
return {ok:true};
