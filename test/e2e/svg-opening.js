// Открытие внешних SVG: ширина страницы, начало длинного листа и обычные клетки/перо.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const near=(a,b,tolerance=1e-6)=>Math.abs(a-b)<=tolerance;
const choose=choices=>native.testFiles('choices',{choices});
const open=async(name,source)=>{
  await native.testFiles('prepare',{name:name+'.svg',text:source});
  await choose({opens:[name+'.svg'],unsaved:['discard']});
  assert(await app.files.open(),'открытие '+name);await test.idle();
};
const w=app.view.width/app.view.dpr,h=app.view.height/app.view.dpr;
const bounds=()=>[...app.doc.values()].reduce((a,o)=>({minX:Math.min(a.minX,o.bbox.minX),minY:Math.min(a.minY,o.bbox.minY),maxX:Math.max(a.maxX,o.bbox.maxX),maxY:Math.max(a.maxY,o.bbox.maxY)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
const gridSpacing=()=>{
  const scene=document.getElementById('scene'),dpr=app.view.dpr;
  // В левом поле нет объектов; измеряем именно нарисованные линии сетки.
  const data=scene.getContext('2d').getImageData(Math.round(13*dpr),0,1,scene.height).data,lines=[];
  for(let y=0;y<scene.height;y++)if(data[y*4]===201&&data[y*4+1]===213&&data[y*4+2]===230)lines.push(y);
  assert(lines.length>3,'видны линии сетки');
  const distances=lines.slice(1).map((y,i)=>y-lines[i]).sort((a,b)=>a-b);
  return distances[Math.floor(distances.length/2)]/dpr;
};
app.settings.grid.enabled=true;app.settings.grid.save=false;app.renderer.invalidateScene();await test.idle();
const blankStep=gridSpacing(),penWidth=app.settings.pen.width;
await test.shot('blank');
const cases=[
  {name:'широкий',width:2400,height:600},
  {name:'длинный',width:800,height:6400},
  {name:'маленький',width:12,height:9},
  {name:'крупные-единицы',width:160000,height:960000},
  {name:'pt-viewbox',width:1600,height:9600,unit:'pt',x:-100,y:200,vw:800,vh:4800},
  {name:'css-целиком',width:1600,height:9600,css:true},
  {name:'пустой',width:800,height:6400,empty:true},
];
for(const c of cases){
  const x=c.x??0,y=c.y??0,vw=c.vw??c.width,vh=c.vh??c.height;
  const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}${c.unit??''}" height="${c.height}${c.unit??''}" viewBox="${x} ${y} ${vw} ${vh}">${c.css?'<style>rect{fill:#f0eee8}</style>':''}${c.empty?'':`<rect x="${x}" y="${y}" width="${vw}" height="${vh}" fill="#f0eee8"/><path d="M${x+vw*.1} ${y+vh*.02}h${vw*.8}v${vw*.02}h${-vw*.8}Z" fill="#315ca8"/>`}</svg>`;
  await open(c.name,source);
  const b=bounds(),start=app.view.toScreen(b.minX,b.minY),end=app.view.toScreen(b.maxX,b.maxY);
  assert(near(start.x,w*.1,1/app.view.dpr)&&near(end.x,w*.9,1/app.view.dpr),c.name+': поля по 10%');
  assert(near(start.y,30,1/app.view.dpr),c.name+': начало страницы сверху '+JSON.stringify({start,b}));
  assert(near(end.y-start.y,w*.8*c.height/c.width,.02),c.name+': пропорции сохранены');
  if(c.height/c.width>2)assert(end.y>h,c.name+': длинная страница продолжается ниже экрана');
  assert(app.view.scale===1&&app.files.baseScale===1&&app.view.rotSteps===0,c.name+': базовый вид как на пустом холсте');
  assert(near(gridSpacing(),blankStep)&&app.settings.pen.width===penWidth,c.name+': клетки и перо не уменьшаются');
  assert(!app.files.dirty&&!app.history.canUndo,c.name+': чистое открытие');
  if(c.name==='длинный')await test.shot('long');
}
// Пользовательский шаг не накапливает поправку при последовательных открытиях.
app.settings.grid.step=37;
const source='<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="10000"><path d="M0 0H2000V10000H0Z" fill="#f0eee8"/></svg>';
await open('повтор-1',source);await open('повтор-2',source);
assert(near(gridSpacing(),37)&&app.settings.grid.step===37,'свой шаг сохраняется при повторных открытиях');
app.selectTool('pen',false);await test.pen([[w*.5,140,.5]],2);
const dot=[...app.doc.values()].find(o=>o.kind==='stroke');
assert(dot&&near(dot.pts[2]*app.view.scale,penWidth,.001),'точка пера имеет обычный экранный диаметр');
app.view.zoomAt(w/2,h/2,1.5);app.view.rotate(1);app.view.panBy(17,-83);
const before=app.files.snapshot();
await choose({saves:['сохранённый-вид.svg']});assert(await app.files.save(true),'сохранение вида Phaint');
await choose({opens:['сохранённый-вид.svg']});assert(await app.files.open(),'повторное открытие Phaint');
const after=app.files.snapshot();
assert(after.view.scale===before.view.scale&&after.view.rotSteps===before.view.rotSteps&&near(after.view.x,before.view.x,1)&&near(after.view.y,before.view.y,1),'собственный SVG восстанавливает вид');
assert(after.grid.step===37&&after.objects.length===before.objects.length,'собственный SVG восстанавливает сетку и объекты');
test.key('Digit0');assert(app.view.scale===1&&app.view.rotSteps===0,'0 возвращает обычный размер клеток');
await choose({unsaved:['discard']});assert(await app.files.newDocument(),'новый холст после импорта');await test.idle();
assert(near(gridSpacing(),37),'размер клетки нового холста совпадает с импортом');
// Копия пользовательского файла передаётся только проверочным запуском; исходник не изменяется.
if(window.__potrace){
  await open('1873',window.__potrace);assert(near(gridSpacing(),37),'Potrace сохраняет размер клетки');
  const paths=new DOMParser().parseFromString(window.__potrace,'image/svg+xml').querySelectorAll('path');
  const objects=[...app.doc.values()];assert(objects.length===paths.length,'все контуры Potrace сохранены');
  assert(objects.every((o,i)=>o.kind==='vector'&&o.d===paths[i].getAttribute('d')),'исходные контуры Potrace не меняются');
  await test.shot('1873');
}
return {ok:true,cases:cases.length,blankStep,dpr:app.view.dpr,width:w,height:h,potrace:!!window.__potrace};
