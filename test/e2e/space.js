// Раздвижение настоящими событиями пера: прокрутка, отмена, SVG-фрагменты и внешний вид.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const near=(a,b)=>Math.abs(a-b)<1e-6;
const tap=(code,mods={})=>{test.key(code,mods);window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true,...mods}));};
const point=(type,p,mods={})=>test.pointer(type,p.x,p.y,type==='pointerup'?0:.5,'pen',mods);
const world=(x,y)=>app.view.toScreen(x,y);
app.settings.grid.enabled=false;app.renderer.invalidateScene();
// Не зависящие от масштаба объекты: верхний, пересекающий линию, нижний и далеко за экраном.
app.doc.replace([
  {kind:'stroke',id:1,z:1,ox:120,oy:130,pts:new Float32Array([0,0,5,160,0,5]),color:'#315ca8',bbox:{minX:116,minY:126,maxX:284,maxY:134}},
  {kind:'stroke',id:2,z:2,ox:350,oy:200,pts:new Float32Array([0,-50,6,0,50,6]),color:'#c9514e',bbox:{minX:345,minY:145,maxX:355,maxY:255}},
  {kind:'stroke',id:3,z:3,ox:120,oy:320,pts:new Float32Array([0,0,5,160,0,5]),color:'#79ad65',bbox:{minX:116,minY:316,maxX:284,maxY:324}},
  {kind:'stroke',id:4,z:4,ox:120,oy:6000,pts:new Float32Array([0,0,5,160,0,5]),color:'#315ca8',bbox:{minX:116,minY:5996,maxX:284,maxY:6004}},
]);app.history.clear();app.view.restore({x:400,y:300,scale:1,rotSteps:0});
const originals=[...app.doc.values()];
tap('KeyV',{metaKey:true,shiftKey:true});assert(app.tool.id==='space','Cmd+Shift+V выбирает раздвижение');
assert(document.querySelector('[data-action="tool.space"]').classList.contains('active'),'кнопка активна');
let p=world(200,200);point('pointerdown',p,{metaKey:true,shiftKey:true});assert(app.tool.id==='space','оставшиеся Cmd/Shift не переключают на M');
p={x:p.x+90,y:p.y+70};point('pointermove',p);
assert(near(app.doc.get(3).oy,390)&&near(app.doc.get(3).ox,120),'только вертикальный перенос');
const screenBefore=world(120,app.doc.get(3).oy);test.wheel(40,40,0,80);
assert(near(app.doc.get(3).oy,470)&&near(world(120,470).y,screenBefore.y),'колесо двигает документ под неподвижным пером');
assert(app.doc.get(1)===originals[0]&&app.doc.get(2)===originals[1],'верх и пересекающий объект неизменны');
assert(near(app.doc.get(4).oy,6150),'двигается объект за экраном');
const scale=app.view.scale;test.wheel(p.x,p.y,0,-20,true);assert(app.view.scale===scale,'щипок не меняет ось незавершённого жеста');
tap('ArrowDown');assert(near(app.doc.get(3).oy,550),'стрелки прокручивают во время раздвижения');
await test.idle();await test.shot('drag-scroll');point('pointerup',p);
tap('KeyZ',{metaKey:true});assert(originals.every(o=>app.doc.get(o.id)===o)&&!app.history.canUndo,'один Undo возвращает весь жест');
tap('KeyZ',{metaKey:true,shiftKey:true});assert(near(app.doc.get(4).oy,6230),'один Redo восстанавливает перенос');
tap('KeyZ',{metaKey:true});const before=app.history.state;
p=world(200,200);point('pointerdown',p);point('pointermove',{x:p.x,y:p.y-180});tap('Escape');
assert(originals.every(o=>app.doc.get(o.id)===o)&&app.history.state===before&&app.history.canRedo,'Esc возвращает объекты и прежний Redo');
point('pointerup',{x:p.x,y:p.y-180});
point('pointerdown',p);point('pointermove',{x:p.x,y:p.y+60});point('pointerup',p);
assert(app.history.state===before&&app.history.canRedo,'возврат к линии не создаёт пустого шага');
point('pointerdown',p);point('pointerup',{x:p.x,y:p.y-130});
assert(near(app.doc.get(3).oy,190),'координата отрыва учитывается; вверх можно перекрывать верхние записи');
tap('KeyZ',{metaKey:true});
for(const event of ['pointercancel','lostpointercapture','blur','tool']){
  p=world(200,200);point('pointerdown',p);point('pointermove',{x:p.x,y:p.y+40});
  if(event==='blur')window.dispatchEvent(new Event('blur'));
  else if(event==='tool')app.selectTool('pen',false);
  else point(event,{x:0,y:0});
  assert(!app.input.drawing&&near(app.doc.get(3).oy,360),event+': фиксируется последнее контактное положение');
  tap('KeyZ',{metaKey:true});assert(originals.every(o=>app.doc.get(o.id)===o),event+': один Undo');app.selectTool('space',false);
}
await native.testFiles('choices',{choices:{saves:['во-время-раздвижения.svg']}});
p=world(200,200);point('pointerdown',p);point('pointermove',{x:p.x,y:p.y+55});
assert(await app.files.save(true)&&!app.input.drawing,'сохранение завершает текущий перенос');
const during=await app.files.worker.run('native',await native.testFiles('read',{name:'во-время-раздвижения.svg'}));
assert(near(during.objects.find(o=>o.id===3).oy,375)&&!app.files.dirty,'сохранён окончательный перенос');
// Настраиваемая клавиша, повтор инструмента и текстовое поле.
tap('KeyV',{metaKey:true,shiftKey:true});assert(app.tool.id==='pen','повтор возвращает прежний инструмент');
await app.applyShortcuts({'tool.space':['KeyJ']});tap('KeyJ');assert(app.tool.id==='space','клавиша переназначена');
const field=document.createElement('input');document.body.append(field);field.focus();field.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyJ',bubbles:true}));field.remove();assert(app.tool.id==='space','в текстовом поле инструмент не меняется');
await app.applyShortcuts({});
// Внешний SVG: defs/use, градиент со ссылкой, текст, штрихи, скругление, прозрачная группа.
const source=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="600" viewBox="100 200 800 600">
<defs><linearGradient id="base"><stop stop-color="#315ca8"/><stop offset="1" stop-color="#c9514e"/></linearGradient><linearGradient id="paint" xlink:href="#base"/><path id="glyph" d="M0 0H35V45H0ZM8 8V37H27V8Z" fill-rule="evenodd"/></defs>
<rect x="100" y="200" width="800" height="600" fill="white"/>
<g fill="#315ca8" transform="translate(10 0)"><path d="M150 250H380V270H150Z"/><path d="M480 350h15v100h-15z"/></g>
<rect x="150" y="490" width="230" height="40" rx="12" fill="url('#paint')"/>
<text x="150" y="580" font-family="Arial" font-size="30" fill="#315ca8">Нижняя строка SVG</text>
<g transform="translate(150 620)" fill="#c9514e"><use href="#glyph"/><use x="55" xlink:href="#glyph"/></g>
<path d="M450 520h200" fill="none" stroke="#79ad65" stroke-width="8" stroke-dasharray="12 8"/>
<g opacity=".5" fill="#c9514e" transform="translate(450 600)"><rect width="90" height="50"/><rect x="45" y="20" width="90" height="50"/></g>
</svg>`;
await native.testFiles('prepare',{name:'раздвижение.svg',text:source});
await native.testFiles('choices',{choices:{opens:['раздвижение.svg'],unsaved:['discard']}});
assert(await app.files.open(),'SVG открыт');await test.idle();
const imported=[...app.doc.values()];
assert(imported.length===9,'SVG разобран на 9 объектов: '+imported.length);
assert(imported.filter(o=>o.kind==='svg').length===6,'текст, use, градиент, штрихи и прозрачная группа — отдельные SVG');
assert(imported[0].background,'белая страница распознана как фон');
const importedScale=app.view.width/app.view.dpr*.8/800;
assert(imported.slice(3).every(o=>o.bbox.minY>(480-200)*importedScale&&o.bbox.maxY-o.bbox.minY<100*importedScale),'фрагменты имеют собственные рамки');
// Пиксельное сравнение исходного SVG и разделённого рисунка, включая групповые перекрытия.
const img=new Image(),url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));img.src=url;await img.decode();
const scene=document.getElementById('scene'),expected=document.createElement('canvas');expected.width=scene.width;expected.height=scene.height;
const ctx=expected.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,expected.width,expected.height);
const m=app.view.matrix();ctx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);ctx.drawImage(img,0,0,800*importedScale,600*importedScale);URL.revokeObjectURL(url);
const actual=scene.getContext('2d').getImageData(0,0,scene.width,scene.height).data,reference=ctx.getImageData(0,0,scene.width,scene.height).data;
let different=0,ink=0;for(let i=0;i<actual.length;i+=4){if(reference[i]<240||reference[i+1]<240||reference[i+2]<240)ink++;if(Math.max(...[0,1,2].map(k=>Math.abs(actual[i+k]-reference[i+k])))>45)different++;}
assert(different/Math.max(ink,1)<.05,`импорт сохраняет внешний вид: ${different}/${ink}`);
await test.shot('import');
const importedWorld=(x,y)=>world((x-100)*importedScale,(y-200)*importedScale);
app.selectTool('space',false);p=importedWorld(200,400);point('pointerdown',p);point('pointerup',importedWorld(300,480));await test.idle();
for(const o of imported){const n=app.doc.get(o.id),dy=o.bbox.minY>=200*importedScale&&!o.background?80*importedScale:0;assert(near(n.ox,o.ox)&&near(n.oy,o.oy+dy),'правило переноса для SVG '+o.id);}
const restored=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));
assert(restored.objects.length===9&&restored.objects.every(o=>near(o.oy,app.doc.get(o.id).oy)),'SVG сохраняет отдельность и перенос');
await test.shot('svg-moved');
return {ok:true,objects:imported.length,pixelDifference:different/ink};
