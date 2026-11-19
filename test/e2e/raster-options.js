// Размер в пикселях, захват ползунка, сжатие PNG и неизменность декодированных пикселей.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);};
app.settings.snapToGrid=false;app.settings.grid.enabled=app.settings.grid.save=true;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.selectTool('pen',false);await test.pen(Array.from({length:160},(_,i)=>[180+i*2,260+Math.sin(i*.16)*40,.25+.6*(i%13)/13]),0);
app.selectTool('marker',false);await test.pen([[180,260,.5],[300,260,.5],[250,235,.5],[320,260,.5]],1);
const change=(d,label,value)=>{if(label==='Формат'){const button=d.querySelector(`[data-format="${value}"]`);button.click();return button;}const el=d.querySelector(`[aria-label="${label}"]`);el.value=String(value);el.dispatchEvent(new Event(el.type==='range'?'input':'change'));return el;};
const start=async(name)=>{
 await native.testFiles('choices',{choices:{saves:[name]}});const pending=app.files.export(),dialog=document.querySelector('.export-dialog');change(dialog,'Формат','png');return {pending,dialog};
};
const finish=async({pending,dialog})=>{[...dialog.querySelectorAll('button')].at(-1).click();assert(await pending,'PNG сохранён');};
const sizes={},dimensions=[],canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});let reference;
for(const level of [0,6,9]){
 const name=`png-${level}.png`,job=await start(name);
 const slider=change(job.dialog,'Ширина изображения',900);
 if(level===0){
  const r=slider.getBoundingClientRect(),fire=(type,x,y)=>window.dispatchEvent(new PointerEvent(type,{pointerId:502,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true}));
  slider.dispatchEvent(new PointerEvent('pointerdown',{pointerId:502,pointerType:'pen',button:0,buttons:1,clientX:r.left+20,clientY:r.top+4,bubbles:true}));const before=Number(slider.value);
  fire('pointermove',r.right-30,r.top-120);assert(Number(slider.value)>before,'ползунок ширины продолжает двигаться выше своей полосы');fire('pointerup',r.right-30,r.top-120);
 }
 change(job.dialog,'Ширина в пикселях',973);assert(slider.value==='973','точный ввод отражается на ползунке');
 change(job.dialog,'Сжатие PNG',level);assert(job.dialog.textContent.includes('Качество не меняется'),'PNG явно без потерь');
 if(level===6)await test.shot('png');await finish(job);
 const bytes=Uint8Array.from(await native.testFiles('readBytes',{name}));sizes[level]=bytes.length;
 const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'})),image=new Image();image.src=url;await image.decode();assert(image.width===973,'точная ширина сохранённого PNG');dimensions.push([image.width,image.height]);
 canvas.width=image.width;canvas.height=image.height;ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;
 if(reference)assert(pixels.every((v,i)=>v===reference[i]),'сжатие '+level+' не меняет ни одного пикселя');else reference=pixels;
 URL.revokeObjectURL(url);
}
assert(sizes[6]<sizes[0]/10&&sizes[9]<sizes[0]/10,'сжатие PNG реально уменьшает файл');
assert(app.settings.export.png.width===973&&app.settings.export.png.compression===9,'размер и степень сжатия сохранены');
let job=await start('отмена.png');change(job.dialog,'Ширина в пикселях',321);change(job.dialog,'Сжатие PNG',1);job.dialog.querySelector('.export-cancel').click();assert(!await job.pending&&app.settings.export.png.width===973&&app.settings.export.png.compression===9,'отмена сохраняет прежние настройки');
job=await start('ширина.jpg');change(job.dialog,'Формат','jpg');assert(job.dialog.querySelector('[aria-label="Сжатие PNG"]').closest('label').hidden,'сжатие PNG не показывается для JPG');change(job.dialog,'Качество JPG',82);
const exactWidth=job.dialog.querySelector('[aria-label="Ширина в пикселях"]');exactWidth.focus();exactWidth.value='777';
exactWidth.dispatchEvent(new KeyboardEvent('keydown',{code:'Enter',key:'Enter',bubbles:true,cancelable:true}));assert(await job.pending,'Enter сохраняет введённую ширину без потери фокуса');
assert(app.settings.export.jpg.width===777&&app.settings.export.png.width===973,'ширина форматов независима');
const bytes=await native.testFiles('readBytes',{name:'ширина.jpg'}),url=URL.createObjectURL(new Blob([Uint8Array.from(bytes)],{type:'image/jpeg'})),image=new Image();image.src=url;await image.decode();assert(image.width===777,'ширина JPG');URL.revokeObjectURL(url);
return {ok:true,sizes,dimensions};
