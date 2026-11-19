// Реальные события пера/клавиш, буфер через IPC и файлы PDF/PNG/JPG в тестовой папке.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);},near=(a,b)=>Math.abs(a-b)<.01;
const canonical=value=>value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const tool=id=>app.selectTool(id,false),last=()=>[...app.doc.values()].at(-1);
const pointer=(type,x,y)=>test.pointer(type,x,y,type==='pointerup'?0:.5);
const drag=async(a,b)=>{pointer('pointerdown',...a);pointer('pointermove',...b);pointer('pointerup',...b);await test.idle();};
const wait=async(condition)=>{for(let i=0;i<1500&&!condition();i++)await test.sleep(10);assert(condition(),'операция завершилась');};
const choose=choices=>native.testFiles('choices',{choices}),read=name=>native.testFiles('read',{name}),bytes=name=>native.testFiles('readBytes',{name});
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.settings.snapToGrid=false;app.settings.grid.enabled=false;origin();
tool('line');await drag([150,200],[450,200]);const line=last();
tool('select');const state=app.history.state;await drag([220,200],[223,202]);
assert(app.selection.selected===line&&app.doc.get(line.id)===line&&app.history.state===state,'касание с дрожанием выбирает, не двигает и не меняет историю');
await drag([220,200],[226,203]);assert(near(app.selection.selected.ox,line.ox+6)&&near(app.selection.selected.oy,line.oy+3),'после порога объект перемещается');
app.undo();assert(app.doc.get(line.id)===line,'одна отмена возвращает перенос');
for(const scale of [.25,4]){
  app.view.restore({x:300,y:200,scale,rotSteps:1});app.selection.show(null);await test.idle();
  const p=app.view.toScreen(220,200);await drag([p.x,p.y],[p.x+3,p.y+2]);
  assert(app.doc.get(line.id)===line&&app.selection.selected===line,'порог экранный при масштабе и повороте');
}
origin();tool('arrow');Object.assign(app.settings.arrow,{width:5,headType:'filled'});test.key('Digit5');await drag([150,300],[450,340]);
const arrow=last();assert(arrow.dash?.dots,'5 включает точки у стрелки');
test.key('Digit2');assert(app.linePattern==='solid','2 замыкает цикл после точек');test.key('Digit2');assert(app.linePattern==='dash','2 переключает на штрихи');test.key('Digit5');assert(app.linePattern==='dots','5 возвращает точки');test.key('Digit5');assert(app.linePattern==='solid','повтор 5 выключает');
tool('pen');test.key('Digit5');await test.pen([[150,410,.6],[190,390,.6],[230,420,.6],[270,395,.6],[310,410,.6]],5);await test.idle();
const ink=last();assert(ink.dash?.dots,'5 работает у ручки');test.key('Digit5');
tool('marker');app.settings.marker.width=36;await test.pen([[170,200,.5],[340,200,.5]],4);await test.idle();
const marker=last();
const c=document.createElement('canvas');c.width=100;c.height=70;const g=c.getContext('2d');g.fillStyle='#cf914d';g.fillRect(0,0,100,70);g.fillStyle='#315ca8';g.fillRect(12,12,65,10);
const clipboard=app.platform.clipboardImage;app.platform.clipboardImage=async()=>({dataURL:c.toDataURL(),width:100,height:70});
app.input.position={x:350,y:390};test.key('KeyV');await wait(()=>!app.pasting);await test.idle();const image=last();assert(image.kind==='image','V вставляет картинку');
tool('select');test.key('KeyA',{metaKey:true});const originals=[...app.selection.objects],count=app.doc.size,copyState=app.history.state;
test.key('KeyC',{metaKey:true});app.input.position={x:640,y:180};test.key('KeyV',{metaKey:true});
await wait(()=>app.doc.size===count*2);await test.idle();
assert(app.history.state!==copyState&&app.selection.objects.length===count,'быстрые Cmd+C и Cmd+V вставляют группу');
const pasted=app.selection.objects,bounds=pasted.map(o=>o.bbox).reduce((a,b)=>({minX:Math.min(a.minX,b.minX),minY:Math.min(a.minY,b.minY),maxX:Math.max(a.maxX,b.maxX),maxY:Math.max(a.maxY,b.maxY)}));
assert(near(bounds.minX,640)&&near(bounds.minY,180),'левый верхний угол группы под курсором');
for(let i=0;i<count;i++){
  const a=originals[i],b=pasted[i];assert(a.id!==b.id&&b.z>a.z&&a.kind===b.kind,'новые номера и порядок слоёв');
  if(a.kind==='stroke')assert(same(a.pts,b.pts)&&same(a.shape,b.shape)&&same(a.dash,b.dash),'параметры пера/фигур/точек не теряются');
  if(a.kind==='image')assert(a.source===b.source,'изображение встроено');
}
assert(app.history.state!==copyState,'вставка изменяет документ');app.undo();assert(app.doc.size===count&&app.history.state===copyState,'вся вставка отменяется одним шагом');app.redo();assert(app.doc.size===count*2,'повтор возвращает группу');
tool('select');app.selection.showObjects(pasted);await app.clipboard.copy();assert(app.doc.size===count*2,'копирование не меняет документ');
app.input.position={x:1060,y:500};test.key('KeyV');await wait(()=>!app.pasting);assert(last().kind==='image'&&app.doc.size===count*2+1,'V остаётся картинкой даже после копирования объектов');app.platform.clipboardImage=clipboard;
app.undo();tool('select');app.selection.showObjects(originals);await test.idle();await test.shot('clipboard');
// Cmd+E выбирает только выделение; экспорт не снимает признак изменений и не заменяет SVG.
app.settings.grid.enabled=app.settings.grid.save=true;app.settings.grid.step=24;
const exportState=app.history.state,dirty=app.files.dirty,file=app.files.file;
const exporting=async(format,name,selection=true)=>{
  await choose({saves:[name]});test.key('KeyE',{metaKey:true});
  const dialog=document.querySelector('.export-dialog');assert(dialog&&dialog.open,'Cmd+E открыл экспорт');
  assert(dialog.textContent.includes(selection?'Выделенные объекты':'Весь рисунок'),'правильная область экспорта');
  dialog.querySelector(`[data-format="${format}"]`).click();
  if(format==='png')await test.shot('export-dialog');
  [...dialog.querySelectorAll('button')].find(b=>b.textContent==='Экспортировать').click();
  await wait(()=>!app.files.busy);assert((await native.testFiles('errors')).length===0,'экспорт без ошибок');
  return bytes(name);
};
const paths={};for(const format of ['png','jpg','pdf']){
  const name=`выделение.${format}`;paths[format]=await native.testFiles('prepare',{name,text:''});
  const data=await exporting(format,name);
  assert(data.length>100,'непустой файл');
  if(format==='pdf'){assert(new TextDecoder().decode(data.slice(0,5))==='%PDF-','настоящий PDF');continue;}
  const blob=new Blob([data],{type:format==='png'?'image/png':'image/jpeg'}),im=new Image(),url=URL.createObjectURL(blob);im.src=url;await im.decode();
  assert(im.width<1000&&im.height<800,'размер по выделению, не по полному холсту');
  const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  const pixel=ctx.getImageData(5,5,1,1).data;assert(Math.min(...pixel.slice(0,3))>180&&pixel[3]===255,`белый непрозрачный фон: ${format} ${Array.from(pixel)}`);
  im.style.cssText='position:fixed;left:250px;top:110px;max-height:620px;max-width:850px;background:white;z-index:999;box-shadow:0 1px 12px #aaa';document.body.append(im);await test.frames(2);await test.shot(format);im.remove();URL.revokeObjectURL(url);
}
assert(app.history.state===exportState&&app.files.dirty===dirty&&app.files.file===file,'экспорт не меняет историю, имя и признак изменений');
test.key('KeyE',{metaKey:true});document.querySelector('.export-dialog .export-cancel').click();await wait(()=>!app.files.busy);
test.key('Escape');assert(!app.selection.objects.length,'выделение снято');const whole=await exporting('png','весь.png',false);
const im=new Image(),url=URL.createObjectURL(new Blob([whole],{type:'image/png'}));im.src=url;await im.decode();
const all=[...app.doc.values()],minX=Math.floor((Math.min(...all.map(o=>o.bbox.minX))-12)/24)*24,maxX=Math.ceil((Math.max(...all.map(o=>o.bbox.maxX))+12)/24)*24,minY=Math.floor((Math.min(...all.map(o=>o.bbox.minY))-12)/24)*24,maxY=Math.ceil((Math.max(...all.map(o=>o.bbox.maxY))+12)/24)*24;
assert(im.width===app.settings.export.png.width&&Math.abs(im.height-im.width*(maxY-minY)/(maxX-minX))<=1,'без выделения весь рисунок вписывается в запомненную ширину');URL.revokeObjectURL(url);
// Выбранные объекты SVG тоже сохраняются целыми, без добавления клипа.
tool('select');app.selection.show(arrow);await choose({saves:['стрелка.svg']});const saving=app.files.save();[...document.querySelector('.export-dialog').querySelectorAll('button')].find(b=>b.textContent==='Сохранить').click();assert(await saving,'сохранение выбранной стрелки');
const data=await app.files.worker.run('native',await read('стрелка.svg'));assert(data.objects.length===1&&data.objects[0].dash.dots&&!data.objects[0].clip,'точечная стрелка целиком и редактируемая');
// Вставка между документами и точное положение при повороте вида.
await choose({unsaved:['discard']});assert(await app.files.newDocument(),'новый документ');
app.view.restore({x:0,y:0,scale:1.3,rotSteps:2});app.input.position={x:240,y:160};
await native.testFiles('edit',{name:'paste'});await wait(()=>app.doc.size===count);await test.idle();
const corners=app.selection.objects.flatMap(o=>[[o.bbox.minX,o.bbox.minY],[o.bbox.maxX,o.bbox.minY],[o.bbox.maxX,o.bbox.maxY],[o.bbox.minX,o.bbox.maxY]].map(([x,y])=>app.view.toScreen(x,y)));
assert(near(Math.min(...corners.map(p=>p.x)),240)&&near(Math.min(...corners.map(p=>p.y)),160),'Cmd+V из системного меню ставит угол группы под курсором при повороте');
// В текстовом поле нативное меню передаёт команду полю, не объектам.
const field=document.createElement('input');document.body.append(field);field.focus();
const editText=app.platform.editText;let textCommand=null;app.platform.editText=command=>{textCommand=command;};
await native.testFiles('edit',{name:'copy'});await wait(()=>textCommand==='copy');app.platform.editText=editText;field.remove();
// Чужой SVG с градиентом не растеризуется при копировании и остаётся обычным SVG.
await app.platform.writeClipboardSvg('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><defs><linearGradient id="g"><stop stop-color="#315ca8"/><stop offset="1" stop-color="#79ad65"/></linearGradient></defs><rect width="120" height="80" fill="url(#g)"/></svg>');
await app.clipboard.paste();const external=app.selection.selected;assert(external.kind==='svg','вставлен сторонний SVG');
await native.testFiles('edit',{name:'copy'});await wait(()=>!app.clipboard.busy);await test.sleep(20);
const n=app.doc.size;app.input.position={x:750,y:400};await app.clipboard.paste();
assert(app.doc.size===n+1&&app.selection.selected.kind==='svg'&&app.selection.selected.source===external.source,'исходный вектор сохранён при копировании');
return {ok:true,paths,copiedObjects:count,exportedCount:originals.length};
