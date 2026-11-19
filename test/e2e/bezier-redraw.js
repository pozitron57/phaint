// Безье над плотным рисунком: каждый кадр показывает новую кривую, фон не рисуется заново.
// Сравнение с полной отрисовкой проверяет наложение маркера, отмену, вид и очистку кэша.
const {app,test,generate}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const last=()=>[...app.doc.values()].at(-1);
const pointer=(type,x,y,ctrl=false)=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',{ctrlKey:ctrl});
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.settings.snapToGrid=false;origin();generate(5000);
app.doc.replace([...app.doc.values()].map(o=>{
  const ox=180+o.ox%720,oy=120+o.oy%480,dx=ox-o.ox,dy=oy-o.oy;
  return {...o,color:'#315ca8',ox,oy,bbox:{minX:o.bbox.minX+dx,minY:o.bbox.minY+dy,maxX:o.bbox.maxX+dx,maxY:o.bbox.maxY+dy}};
}));app.history.clear();await test.idle();
app.selectTool('marker',false);Object.assign(app.settings.marker,{width:120,color:'#79ad65',opacity:.4});
await test.pen([[270,340,.5],[850,340,.5]],1);await test.idle();
const canvas=document.querySelector('#scene'),ctx=canvas.getContext('2d');
const pixels=()=>ctx.getImageData(0,0,canvas.width,canvas.height).data;
const comparisons=[];
async function reference(label){
  await test.idle();const before=pixels();
  app.renderer.tiles.onChange({added:[],removed:[],top:false,reset:true});app.renderer.invalidateScene();await test.idle();
  const after=pixels();let error=0,max=0;
  for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);error+=d;max=Math.max(max,d);}
  const mae=error/before.length;assert(mae<.01&&max<=2,label+': ускоренная картинка совпадает с полной, ошибка '+mae+', максимум '+max);
  comparisons.push({label,mae,max});
}
const result={};
for(const kind of ['line','arrow']){
  app.selectTool(kind,false);Object.assign(app.settings[kind],{color:'#e02020',width:5,dashed:false,both:true});
  await test.pen([[280,200,.5],[880,620,.5]],1);await test.idle();
  const straight=last(),id=straight.id;
  let queries=0,stale=0;const query=app.doc.query.bind(app.doc);app.doc.query=b=>{queries++;return query(b);};
  pointer('pointerdown',480,160,true);
  for(let i=0;i<60;i++){
    pointer('pointermove',520+Math.sin(i/5)*190,200+Math.cos(i/7)*170);await test.frames(1);
    const o=app.doc.get(id),s=o.shape,c=s.controls[0],p=app.view.toScreen(o.ox+c.x*.5+s.length*.25,o.oy+c.y*.5+s.height*.25),d=app.view.dpr;
    const data=ctx.getImageData(Math.round(p.x*d)-2,Math.round(p.y*d)-2,5,5).data;
    let red=false;for(let k=0;k<data.length;k+=4)if(data[k]>170&&data[k+1]<110&&data[k+2]<110)red=true;
    if(!red)stale++;
  }
  pointer('pointerup',520+Math.sin(59/5)*190,200+Math.cos(59/7)*170);app.doc.query=query;
  assert(stale===0,kind+': кривая должна следовать за точкой в каждом кадре, отстало '+stale);
  assert(queries===0,kind+': готовые соседние объекты не запрашиваются заново');
  result[kind]={frames:60,stale,queries};await test.idle();await test.shot(kind);
  const curved=app.doc.get(id);
  app.undo();assert(app.doc.get(id)===straight,'отмена одного жеста');app.redo();assert(app.doc.get(id)===curved,'повтор возвращает кривую');
  await reference(kind+' и маркер');
  // После открытия/сброса кэша фон строится один раз; движения не обнуляют его очередь.
  pointer('pointerdown',650,460,true);let ready=false;
  for(let i=0;i<240;i++){pointer('pointermove',680+Math.sin(i/6)*180,440+Math.cos(i/8)*170);await test.frames(1);if(i>30&&app.renderer.idle)ready=true;}
  assert(ready,kind+': фон дорисовался ещё во время непрерывного жеста '+JSON.stringify({edited:app.renderer.tiles.edited?.id,stats:app.renderer.tiles.stats(),tiles:[...app.renderer.tiles.cur.tiles.values()].filter(t=>!t.ready).map(t=>[t.i,t.j,t.next,t.queue?.length,t.baseReady])}));
  pointer('pointerup',680+Math.sin(239/6)*180,440+Math.cos(239/8)*170);
  const cubic=app.doc.get(id);await reference(kind+' после первого построения фона');
  pointer('pointerdown',680,400,true);pointer('pointermove',900,600);test.key('Escape');pointer('pointerup',900,600);
  assert(app.doc.get(id)===cubic,'Esc вернул кривую без промежуточных следов');await reference(kind+' после Esc');
}
// Сетка под маркером должна обновиться также в сохранённом фоне.
app.actions.run('view.grid');await test.idle();pointer('pointerdown',650,450,true);pointer('pointermove',950,650);pointer('pointerup',950,650);await reference('смена сетки');
// Новый уровень после поворота и масштаба не использует прежний фон.
app.view.restore({x:600,y:400,scale:1.2,rotSteps:1});await test.idle();
pointer('pointerdown',650,450,true);pointer('pointermove',1000,600);pointer('pointerup',1000,600);await reference('масштаб и поворот');
origin();await test.idle();const arrow=last();
// Нижняя стрелка не должна перекрывать новый маркер при редактировании в M.
app.selectTool('marker',false);await test.pen([[280,400,.5],[880,400,.5]],1);await test.idle();
app.selectTool('select',false);app.selection.show(arrow);let h=app.selection.handles().find(h=>h.name==='control1').point;
pointer('pointerdown',h.x,h.y);pointer('pointermove',h.x+60,h.y+60);pointer('pointerup',h.x+60,h.y+60);await reference('маркер поверх редактируемой стрелки');
// Удаление фигуры/документа освобождает фон и не оставляет старые пиксели.
app.deleteSelection();await reference('удаление');app.doc.replace([]);app.history.clear();await test.idle();
assert(app.renderer.tiles.stats().canvases===0,'пустой документ не держит холсты прежнего рисунка');
return {ok:true,...result,comparisons};
