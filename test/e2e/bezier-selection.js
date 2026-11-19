// Безье в M у старых фигур между слоями: движение, прозрачность, маркеры и точный итог.
const {app,test,generate}=window.__phaint;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const pointer=(type,x,y,ctrl=false)=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',{ctrlKey:ctrl});
const last=()=>[...app.doc.values()].at(-1);
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.settings.snapToGrid=false;origin();generate(5000);
const strokes=[...app.doc.values()].map(o=>{
  const ox=180+o.ox%720,oy=120+o.oy%480,dx=ox-o.ox,dy=oy-o.oy;
  return {...o,ox,oy,bbox:{minX:o.bbox.minX+dx,minY:o.bbox.minY+dy,maxX:o.bbox.maxX+dx,maxY:o.bbox.maxY+dy}};
});
app.doc.replace(strokes.slice(0,2500));app.history.clear();await test.idle();
const ids=[];
for(const kind of ['line','arrow']){
  app.selectTool(kind,false);Object.assign(app.settings[kind],{color:'#e02020',width:6,dashed:false,both:true});
  await test.pen([[280,200,.5],[880,620,.5]],1);ids.push(last().id);
}
const above=strokes.slice(2500).map((o,i)=>({...o,id:app.doc.nextId(),z:app.doc.topZ()+i}));
app.history.commit({added:above,removed:[]});
// Верхний план чередует multiply, source-over, прозрачность, маски и обрезку.
for(let i=0;i<8;i++){
  app.selectTool('marker',false);Object.assign(app.settings.marker,{width:50,color:i%2?'#79ad65':'#946bb0',opacity:.2+i*.05});
  await test.pen([[240,240+i*42,.5],[900,240+i*42,.5]],1);
  const marker=last();app.history.commit({added:[{...marker,erasures:[[180,-60,180,60,15]],clip:[{x:0,y:-80},{x:580,y:-80},{x:580,y:80},{x:0,y:80}]}],removed:[marker]});
  const bounds={minX:0,minY:0,maxX:160,maxY:80},ox=250+i*65,oy=230+i*35;
  app.history.commit({removed:[],added:[{kind:'vector',id:app.doc.nextId(),z:app.doc.topZ(),ox,oy,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},
    d:'M0 0H160V80H0Z',fill:i%2?'#315ca8':'#cf914d',stroke:'none',strokeWidth:0,linecap:'round',linejoin:'round',fillRule:'nonzero',opacity:.3,bounds,
    bbox:{minX:ox,minY:oy,maxX:ox+160,maxY:oy+80},erasures:[[80,0,80,80,12]]}]});
}
app.history.clear();await test.idle();
const comparisons=[],motion=[];let stage='рисование';
// Независимый кэш без выбранной фигуры рисует каждый объект обычным способом.
function reference(label,exact=false){
  const tiles=app.renderer.tiles,full=new tiles.constructor(app.doc,app.settings.grid);
  full.switchLevel(app.view);full.work(app.view,10000,true);assert(!full.pending,label+': эталон дорисован');
  let sum=0,max=0,count=0;
  const blank=new Uint8ClampedArray(512*512*4);
  for(const [key,t] of full.cur.tiles){
    const actual=tiles.cur.tiles.get(key);assert(actual?.ready,label+': плитка '+key+' готова');
    const a=actual.front?.getContext('2d').getImageData(0,0,512,512).data??blank;
    const b=t.front?.getContext('2d').getImageData(0,0,512,512).data??blank;
    for(let i=0;i<a.length;i+=4)for(let c=0;c<4;c++){
      const d=exact||c===3?Math.abs(a[i+c]-b[i+c]):Math.abs((a[i+c]-255)*a[i+3]/255-(b[i+c]-255)*b[i+3]/255);
      sum+=d;max=Math.max(max,d);
    }count+=a.length;
  }
  const mae=sum/count;full.onChange({added:[],removed:[],top:false,reset:true});
  assert(exact?max===0:mae<.1&&max<=5,stage+' / '+label+': ошибка '+mae+', максимум '+max);
  comparisons.push({label,mae,max});
}
async function moveHandle(name,frames=45){
  const h=app.selection.handles().find(h=>h.name===name).point;
  let queries=0,stale=0;const query=app.doc.query.bind(app.doc);app.doc.query=b=>{queries++;return query(b);};
  pointer('pointerdown',h.x,h.y);
  for(let i=0;i<frames;i++){
    pointer('pointermove',h.x+Math.sin(i/5)*150,h.y+Math.cos(i/7)*100);await test.frames(1);
    if([...app.renderer.tiles.cur.tiles.values()].some(t=>t.front&&!t.ready))stale++;
  }
  app.doc.query=query;
  assert(stale===0&&queries===0,name+': отстало '+stale+' кадров, запросов соседей '+queries);
  reference(name+' во время движения');
  pointer('pointerup',h.x+Math.sin((frames-1)/5)*150,h.y+Math.cos((frames-1)/7)*100);
  await test.idle();assert(!app.renderer.busy,'после отрыва доступна полная отрисовка');reference(name+' после отрыва',true);
  motion.push({name,frames,stale,queries});
}
for(const id of ids){
  app.selectTool('select',false);app.selection.show(app.doc.get(id));await test.idle();
  const straight=app.doc.get(id),z=straight.z;
  pointer('pointerdown',480,160,true);pointer('pointermove',500,150);pointer('pointerup',500,150);await test.idle();
  assert(app.doc.get(id).shape.controls.length===1,'Ctrl добавил точку выбранной старой фигуре');
  const quadratic=app.doc.get(id);app.undo();assert(app.doc.get(id)===straight,'одна отмена добавления точки');app.redo();assert(app.doc.get(id)===quadratic,'повтор добавления точки');await test.idle();
  await moveHandle('control1');
  pointer('pointerdown',700,460,true);pointer('pointermove',740,490);pointer('pointerup',740,490);await test.idle();
  assert(app.doc.get(id).shape.controls.length===2,'Ctrl добавил вторую точку');
  await moveHandle('control2');await moveHandle('endpoint',20);
  assert(app.doc.get(id).z===z,'редактирование не поднимает фигуру над соседями');
  await test.shot(straight.shape.kind);
  const saved=app.doc.get(id),h=app.selection.handles().find(h=>h.name==='control1').point;
  pointer('pointerdown',h.x,h.y);pointer('pointermove',h.x+90,h.y+60);test.key('Escape');pointer('pointerup',h.x+90,h.y+60);
  assert(app.doc.get(id)===saved&&!app.renderer.busy,'Esc вернул фигуру и завершил быстрый режим');await test.idle();reference('после Esc',true);
}
// Открытая из SVG фигура получает тот же кэш; сетка, масштаб и соседи его обновляют.
stage='открытие SVG';const restored=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));
app.doc.replace(restored.objects);app.history.clear();app.selection.show(app.doc.get(ids[0]));
// Немедленный жест после открытия: движения не обнуляют очередь ещё не готовых слоёв.
const cold=app.selection.handles().find(h=>h.name==='control1').point;
pointer('pointerdown',cold.x,cold.y);let warmed=false,coldFrames=0;
const coldQuery=app.doc.query.bind(app.doc);let coldQueries=0;app.doc.query=b=>{coldQueries++;return coldQuery(b);};
for(let i=0;i<600;i++){
  coldFrames=i+1;
  pointer('pointermove',cold.x+Math.sin(i/6)*120,cold.y+Math.cos(i/8)*80);await test.frames(1);
  if(i>30&&app.renderer.idle){warmed=true;break;}
}
app.doc.query=coldQuery;
assert(coldQueries<=app.renderer.tiles.cur.tiles.size,'незавершённые очереди не перезапрашиваются при каждом движении');
assert(warmed,'соседние слои дорисовались во время непрерывного жеста M '+JSON.stringify({busy:app.renderer.busy,id:app.renderer.tiles.edited?.id,selected:app.selection.selected?.id,pending:app.renderer.tiles.pending,tiles:[...app.renderer.tiles.cur.tiles.values()].filter(t=>!t.ready||!t.baseReady).map(t=>({i:t.i,j:t.j,next:t.next,length:t.queue?.length,ready:t.ready,baseReady:t.baseReady,editing:t.editing,canonical:t.canonical,approximate:t.approximate}))}));
pointer('pointerup',cold.x+Math.sin((coldFrames-1)/6)*120,cold.y+Math.cos((coldFrames-1)/8)*80);await test.idle();
reference('после холодного жеста',true);await moveHandle('control1',20);
stage='сетка';app.actions.run('view.grid');await test.idle();await moveHandle('control2',20);
stage='поворот';app.view.restore({x:600,y:400,scale:1.2,rotSteps:1});await test.idle();await moveHandle('control1',20);
origin();await test.idle();
stage='изменение соседа';const neighbor=app.doc.get(above[0].id);app.history.commit({removed:[neighbor],added:[{...neighbor,color:'#cf914d'}]});await test.idle();await moveHandle('control2',20);
app.deleteSelection();await test.idle();reference('после удаления',true);
app.doc.replace([]);app.history.clear();await test.idle();assert(app.renderer.tiles.stats().canvases===0,'очистка освободила кэш');
return {ok:true,motion,coldFrames,coldQueries,comparisons};
