// Настоящие касания с настройками пользователя: точки, дрожь, нажим и SVG.
const {app,test}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const last=()=>[...app.doc.values()].at(-1),dots=[];
Object.assign(app.settings.pen,{width:3.75,color:'#315ca8',pressure:.7,curve:.7,smoothing:.3,taper:.11,speed:.61});
app.view.reset();app.settingsChanged();
// Точки над буквами с очень слабым касанием и разным смещением при отрыве.
for(let i=0;i<4;i++){
  const x=200+i*130,dx=[0,1.3,2.5,3.8][i];
  await test.pen([[x,230,.09],[x,240,.65],[x+1,260,.68],[x+4,279,.6],[x+10,278,.15]],8);
  test.pointer('pointerdown',x,208,.09);test.pointer('pointermove',x+dx,208,.15);test.pointer('pointerup',x+dx,208,0);
  const dot=last();assert(dot.pts.length===3&&dot.pts[2]===3.75,'слабая точка не сужается');dots.push(dot);
}
// Один короткий пик нажима должен успеть увеличить точку.
for(let i=0;i<3;i++){
  const x=200+i*130,p=[.09,.85,1][i];
  test.pointer('pointerdown',x,360,.09);test.pointer('pointermove',x+.5,360,p);
  test.pointer('pointermove',x+.1,360,.09);test.pointer('pointerup',x+.1,360,0);
  const dot=last();assert(dot.pts.length===3&&dot.pts[2]>=3.75,'короткий нажим учтён');dots.push(dot);
}
assert(dots[5].pts[2]>dots[4].pts[2]&&dots[6].pts[2]>dots[5].pts[2],'сильный нажим увеличивает точки');
// Дрожь на месте суммарно длиннее штриха, но остаётся касанием.
test.pointer('pointerdown',590,360,.09);
for(let i=0;i<30;i++)test.pointer('pointermove',590+(i%2?2.5:-2.5),360,.12);
test.pointer('pointerup',590,360,0);assert(last().pts.length===3&&last().pts[2]===3.75,'длина дрожи не превращает точку в волосок');dots.push(last());
const state=app.history.state;app.undo();assert(!app.doc.get(dots.at(-1).id),'одна отмена удаляет точку');app.redo();assert(app.history.state===state,'повтор возвращает точку');
await test.idle();
const scene=document.querySelector('#scene'),g=scene.getContext('2d'),dpr=app.view.dpr;
for(const o of dots){const p=app.view.toScreen(o.ox,o.oy);assert(g.getImageData(Math.round(p.x*dpr),Math.round(p.y*dpr),1,1).data[0]<130,'точка видна после отрыва');}
const saved=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));
for(const o of dots){const copy=saved.objects.find(n=>n.id===o.id);assert(copy?.pts.length===3&&copy.pts[2]===o.pts[2],'размер точки сохранён в SVG');}
app.view.panBy(24,0);await test.idle();app.view.panBy(-24,0);await test.idle();
await test.shot('normal',{x:130,y:150,width:600,height:270});
app.view.zoomAt(390,250,3);await test.idle();await test.shot('detail',{x:130,y:80,width:950,height:620});
return {ok:true,dots:dots.length,widths:dots.map(o=>o.pts[2])};
