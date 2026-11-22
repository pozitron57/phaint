// Длинная синусоида и другие фигуры следуют за переносом целиком, сохраняя слои и контур.
const {app,test,generate}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const pointer=(type,x,y)=>test.pointer(type,x,y,type==='pointerup'?0:.5);
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const canvas=document.querySelector('#scene'),ctx=canvas.getContext('2d');
const pixels=()=>ctx.getImageData(0,0,canvas.width,canvas.height).data;
async function reference(label){
  await test.idle();const before=pixels();
  app.renderer.tiles.onChange({added:[],removed:[],top:false,reset:true});app.renderer.invalidateScene();await test.idle();
  const after=pixels();let max=0,error=0;
  for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);max=Math.max(max,d);error+=d;}
  assert(max<=2&&error/before.length<.01,label+': совпадение с полной отрисовкой');
}
app.settings.snapToGrid=false;origin();
const results=[];
for(const kind of ['sine','hyperbola','adiabat','parabola','ellipse','coordinates']){
  app.selectTool('pen',false);app.doc.replace([]);app.history.clear();generate(500);
  app.doc.replace([...app.doc.values()].map(o=>({...o,color:'#bbbbbb'})));app.history.clear();await test.idle();
  app.selectTool(kind,false);app.widthSettings.width=3;app.chooseColor('#e02020');
  if(kind==='sine')Object.assign(app.settings.sine,{period:16,amplitude:62});
  const start=kind==='ellipse'?[500,370]:[190,310],end=kind==='sine'?[958,310]:kind==='ellipse'?[690,370]:kind==='hyperbola'||kind==='adiabat'?[520,490]:[760,490];
  await test.pen([[...start,.5],[...end,.5]],1);
  if(kind==='parabola')await test.pen([[480,230,.5],[480,230,.5]],1);
  const original=[...app.doc.values()].at(-1);
  app.selectTool('marker',false);app.chooseColor('#79ad65');Object.assign(app.settings.marker,{width:70,opacity:.4});await test.pen([[260,390,.5],[930,390,.5]],1);
  app.selectTool('line',false);app.chooseColor('#315ca8');app.settings.line.width=4;await test.pen([[700,180,.5],[800,650,.5]],1);
  app.selectTool('select',false);app.selection.show(original);await test.idle();
  // Точка внутри рамки, вдали от всех ручек, начинает именно перенос.
  const b=app.selection.screenBox(),x=b.minX+(b.maxX-b.minX)*.61,y=b.minY+(b.maxY-b.minY)*.58;
  pointer('pointerdown',x,y);
  let stale=0,queries=0,geometryCopies=0;const times=[],query=app.doc.query.bind(app.doc);app.doc.query=b=>{queries++;return query(b);};
  for(let frame=0;frame<45;frame++){
    const dx=20+Math.sin(frame/6)*35,dy=50+Math.cos(frame/7)*45,t=performance.now();
    pointer('pointermove',x+dx,y+dy);times.push(performance.now()-t);await test.frames(1);
    const o=app.selection.selected;if(o.pts!==original.pts||o.shape!==original.shape)geometryCopies++;
    // Проверяем всю длину, включая края и разные плитки, а не только область под курсором.
    const count=o.pts.length/3;
    for(let j=0;j<24;j++){
      const i=Math.round(j/23*(count-1))*3,p=app.view.toScreen(o.ox+o.pts[i],o.oy+o.pts[i+1]),d=app.view.dpr;
      if(p.x<2||p.y<2||p.x>canvas.width/d-3||p.y>canvas.height/d-3)continue;
      // Синяя линия закономерно закрывает фигуру в месте пересечения.
      if(p.y>=175&&p.y<=655&&Math.abs((p.x-700)*470-(p.y-180)*100)/Math.hypot(100,470)<6)continue;
      const data=ctx.getImageData(Math.round(p.x*d)-3,Math.round(p.y*d)-3,7,7).data;
      let red=false;for(let k=0;k<data.length;k+=4)if(data[k]>100&&data[k]>data[k+1]*1.35&&data[k]>data[k+2]*1.35)red=true;
      // Наконечники координат могут лежать на открытом стыке; соседние пиксели учтены выше.
      if(!red)stale++;
    }
  }
  app.doc.query=query;pointer('pointerup',x+20+Math.sin(44/6)*35,y+50+Math.cos(44/7)*45);
  const moved=app.selection.selected;times.sort((a,b)=>a-b);
  const result={kind,stale,queries,geometryCopies,p95:times[Math.floor(times.length*.95)],max:times.at(-1)};results.push(result);
  assert(stale===0&&queries===0&&geometryCopies===0,'перенос целой фигуры без пересчёта соседей: '+JSON.stringify(result));
  app.undo();assert(app.selection.selected===original,'Undo возвращает весь перенос');app.redo();assert(app.selection.selected===moved,'Redo возвращает перенос');
  await test.idle();await test.shot(kind);await reference(kind+' перенос');
  // Размер и ручки используют тот же кэш соседей, но перестраивают геометрию.
  app.selection.show(moved);await test.idle();let h=app.selection.handles().find(h=>h.name==='resize').point;
  pointer('pointerdown',h.x,h.y);for(let i=1;i<=12;i++){pointer('pointermove',h.x-i*2,h.y-i);await test.frames(1);}pointer('pointerup',h.x-24,h.y-12);
  await reference(kind+' размер');app.undo();assert(app.selection.selected===moved,'размер отменяется отдельно');
  app.selection.show(moved);await test.idle();
  h=app.selection.handles().find(h=>h.name==='rotate').point;pointer('pointerdown',h.x,h.y);pointer('pointermove',h.x+40,h.y+20);test.key('Escape');pointer('pointerup',h.x+40,h.y+20);
  assert(app.doc.get(original.id)===moved,'Esc возвращает геометрию');await reference(kind+' Esc');
}
return {ok:true,results};
