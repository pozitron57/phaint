// Настройки каждого формата, действительное сжатие, прозрачность и неизменность оригинала.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(value,message)=>{if(!value)throw new Error(message);};
const choose=choices=>native.testFiles('choices',{choices}),read=name=>native.testFiles('read',{name}),bytes=name=>native.testFiles('readBytes',{name});
const tool=id=>app.selectTool(id,false),last=()=>[...app.doc.values()].at(-1);
const drag=async(a,b)=>{test.pointer('pointerdown',...a,.5);test.pointer('pointermove',...b,.5);test.pointer('pointerup',...b,0);await test.idle();};
app.settings.snapToGrid=false;app.settings.grid.enabled=app.settings.grid.save=true;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;
const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(1600,900);let seed=113;
for(let y=0;y<900;y++)for(let x=0;x<1600;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const i=(y*1600+x)*4,noise=(seed>>>26)-32;
  pixels.data[i]=60+x/12+noise;pixels.data[i+1]=100+y/9+noise;pixels.data[i+2]=170+40*Math.sin(x/130)*Math.cos(y/60)+noise;pixels.data[i+3]=255;
}
ctx.putImageData(pixels,0,0);const photo=canvas.toDataURL();
const clipboardImage=app.platform.clipboardImage;
app.platform.clipboardImage=async()=>({dataURL:photo,width:240,height:135});app.input.position={x:160,y:200};await app.pasteImage();const originalPhoto=last();
canvas.width=canvas.height=400;ctx.fillStyle='#79ad65';ctx.beginPath();ctx.arc(200,200,170,0,Math.PI*2);ctx.fill();
const transparent=canvas.toDataURL();app.platform.clipboardImage=async()=>({dataURL:transparent,width:80,height:80});app.input.position={x:450,y:230};await app.pasteImage();const originalAlpha=last();
app.platform.clipboardImage=clipboardImage;
tool('arrow');await drag([160,380],[500,380]);const arrow=last();
tool('pen');const points=Array.from({length:500},(_,i)=>[160+i*.7,430+25*Math.sin(i*.035),.4+.2*Math.sin(i*.017)]);await test.pen(points,0);await test.idle();const ink=last();
await choose({saves:['рабочий.svg']});assert(await app.files.save(),'сохранён исходный рабочий SVG');
const original=await read('рабочий.svg'),file=app.files.file,state=app.history.state,dirty=app.files.dirty,originalObjects=[...app.doc.values()];
const change=(dialog,label,value)=>{if(label==='Формат'){const button=dialog.querySelector(`[data-format="${value}"]`);button.click();return button;}const input=dialog.querySelector(`[aria-label="${label}"]`);input.value=String(value);input.dispatchEvent(new Event(input.type==='range'?'input':'change'));return input;};
const begin=async(format,name,save=false)=>{
  await choose({saves:[name]});const pending=save?app.files.save():app.files.export(),dialog=document.querySelector('.export-dialog');
  assert(dialog?.open,'настройки появились до выбора файла');change(dialog,'Формат',format);
  assert(dialog.querySelector('.export-compression').hidden===(format==='png'||format==='jpg'),'настройки качества зависят от формата');
  assert(dialog.querySelector('[aria-label="Качество JPG"]').closest('label').hidden===(format!=='jpg'),'ползунок только у JPG');
  return {pending,dialog};
};
const finish=async({pending,dialog},ok=true)=>{
  [...dialog.querySelectorAll('button')].at(-1).click();assert(await pending===ok,'экспорт завершился с ожидаемым результатом');
};
const decodeImage=async(source)=>{const image=new Image();image.src=source;await image.decode();return image;};
const sizes={},paths={};
for(const quality of ['maximum','high','compact']){
  const name=`качество-${quality}.svg`,job=await begin('svg',name);change(job.dialog,'Сжатие',({maximum:0,high:2,compact:4})[quality]);
  if(quality==='compact')await test.shot('svg-settings');await finish(job);
  const svg=await read(name);sizes[quality]=new TextEncoder().encode(svg).length;
  const data=await app.files.worker.run('native',svg);assert(data?.objects.length===4&&!data.exportOptions,'нативный SVG без временных настроек');
  const [a,b]=data.objects.filter(o=>o.kind==='image'),photoImage=await decodeImage(a.source),alpha=await decodeImage(b.source);
  assert(photoImage.width===({maximum:1600,high:720,compact:360})[quality],`пиксели картинки соответствуют качеству ${quality}: ${photoImage.width}`);
  assert(b.source.startsWith('data:image/png;base64,'),'прозрачная картинка осталась PNG');
  canvas.width=alpha.width;canvas.height=alpha.height;ctx.drawImage(alpha,0,0);assert(ctx.getImageData(0,0,1,1).data[3]===0,'прозрачный угол сохранён');
  assert(a.width===originalPhoto.width&&b.width===originalAlpha.width,'физический размер картинок неизменен');
  const strokes=data.objects.filter(o=>o.kind==='stroke');assert(strokes[0].shape.kind==='arrow'&&strokes[1].pts.every((v,i)=>v===ink.pts[i]),'параметры стрелки и точные отсчёты пера сохранены');
  assert(svg.includes('<pattern '),'сетка сохранена шаблоном');
}
assert(sizes.maximum>sizes.high&&sizes.high>sizes.compact,'качество уменьшает размер SVG');
let job=await begin('svg','контуры.svg');job.dialog.querySelector('[aria-label="Сохранить редактирование в Phaint"]').click();await finish(job);
const plain=await read('контуры.svg');assert(!plain.includes('<metadata')&&await app.files.worker.run('native',plain)===null,'без редактирования записаны обычные контуры');
assert(new TextEncoder().encode(plain).length<sizes.compact,'метаданные можно исключить для меньшего файла');
for(const quality of ['maximum','compact']){
  const name=`качество-${quality}.pdf`;paths[quality]=await native.testFiles('prepare',{name,text:''});job=await begin('pdf',name);change(job.dialog,'Сжатие',({maximum:0,high:2,compact:4})[quality]);
  if(quality==='compact')await test.shot('pdf-settings');await finish(job);
  const pdf=await bytes(name);sizes[`pdf-${quality}`]=pdf.length;assert(new TextDecoder().decode(pdf.slice(0,5))==='%PDF-','PDF сохранён');
  assert(app.files.lastWrite.bytes===pdf.length&&!app.files.lastWrite.processing,'статистика PDF соответствует записанным байтам');
}
assert(sizes['pdf-compact']<sizes['pdf-maximum'],'компактный PDF меньше максимального');
const rasterImages={};
for(const quality of [25,95]){
  const name=`качество-${quality}.jpg`;job=await begin('jpg',name);change(job.dialog,'Качество JPG',quality);change(job.dialog,'Ширина изображения',1200);
  if(quality===95)await test.shot('jpg-settings');await finish(job);
  const jpg=await bytes(name),url=URL.createObjectURL(new Blob([jpg],{type:'image/jpeg'})),im=await decodeImage(url);rasterImages[quality]=[im.width,im.height];sizes[`jpg-${quality}`]=jpg.length;URL.revokeObjectURL(url);
  assert(app.files.lastWrite.bytes===jpg.length&&!app.files.lastWrite.processing,'статистика JPG соответствует записанным байтам');
}
assert(sizes['jpg-25']<sizes['jpg-95']&&String(rasterImages[25])===String(rasterImages[95]),'качество JPG меняет сжатие, не разрешение');
let baseSize;
for(const width of [600,2400]){
  const name=`ширина-${width}.png`;job=await begin('png',name);change(job.dialog,'Ширина изображения',width);await finish(job);
  const png=await bytes(name),url=URL.createObjectURL(new Blob([png],{type:'image/png'})),im=await decodeImage(url);
  assert(app.files.lastWrite.bytes===png.length&&!app.files.lastWrite.processing,'статистика PNG соответствует записанным байтам');
  assert(im.width===width,'точная ширина PNG');
  if(width===600)baseSize=[im.width,im.height];else assert(Math.abs(im.width-baseSize[0]*4)<4&&Math.abs(im.height-baseSize[1]*4)<4,'высота PNG следует пропорциям');
  if(width===2400){im.style.cssText='position:fixed;left:230px;top:170px;width:760px;background:white;z-index:999';document.body.append(im);await test.frames(2);await test.shot('result');im.remove();}
  URL.revokeObjectURL(url);
}
assert(app.settings.export.svg.compression===4&&!app.settings.export.svg.editable&&app.settings.export.pdf.compression===4&&app.settings.export.png.width===2400&&app.settings.export.jpg.quality===95&&app.settings.export.jpg.width===1200,'пресеты форматов независимы');
const remembered=JSON.stringify(app.settings.export),saveSettings=app.platform.saveSettings;let stored;
app.platform.saveSettings=async value=>{stored=structuredClone(value);};await app.flushSettings();app.platform.saveSettings=saveSettings;
assert(JSON.stringify(stored.export)===remembered,'настройки передаются на диск');
job=await begin('jpg','отмена.jpg');change(job.dialog,'Качество JPG',10);job.dialog.querySelector('.export-cancel').click();assert(!await job.pending&&JSON.stringify(app.settings.export)===remembered,'отмена не меняет настройки');
job=await begin('jpg','отмена-файла.jpg');change(job.dialog,'Качество JPG',10);await choose({saves:[]});await finish(job,false);assert(JSON.stringify(app.settings.export)===remembered,'отмена выбора файла не запоминает настройки');
assert(app.history.state===state&&app.files.dirty===dirty&&app.files.file===file&&originalObjects.every(o=>app.doc.get(o.id)===o),'экспорт не изменил рабочий документ');
assert(await read('рабочий.svg')===original,'исходный файл не перезаписан');
// Выбранный объект: Cmd+S спрашивает качество, но не меняет последний формат Cmd+E.
tool('select');app.selection.show(arrow);job=await begin('svg','стрелка.svg',true);assert(job.dialog.querySelector('[data-format="pdf"]').disabled,'формат выделения фиксирован SVG');await finish(job);
assert(app.settings.export.format==='png'&&!((await read('стрелка.svg')).includes('<metadata')),'SVG выделения использует свой пресет, формат Cmd+E сохранён');
// Обычное сохранение всегда содержит полный исходник, независимо от качества экспорта.
tool('pen');assert(await app.files.save(),'обычное сохранение без окна экспорта');assert(await read('рабочий.svg')===original,'полное сохранение сохраняет максимальную точность и картинки');
assert((await native.testFiles('errors')).length===0,'ошибок экспорта нет');
job=await begin('svg','рабочий.svg');await finish(job,false);const errors=await native.testFiles('errors');
assert(errors.length===1&&errors[0].includes('другое имя')&&await read('рабочий.svg')===original,'экспорт защищает рабочий исходник');
return {ok:true,sizes,paths};
