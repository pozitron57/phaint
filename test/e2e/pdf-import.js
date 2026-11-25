// Растровое открытие; закреплённые PDF, SVG round-trip, оба вида PDF и длинный PNG.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const choices=choices=>native.testFiles('choices',{choices});
const read=name=>native.testFiles('read',{name}),readBytes=name=>native.testFiles('readBytes',{name});
const base64=bytes=>{let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);};
const sourceBase64="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";
const sourceBytes=Uint8Array.from(atob(sourceBase64),c=>c.charCodeAt(0));
const originalPath=await native.testFiles('prepareBytes',{name:'источник.pdf',bytes:sourceBytes});
const c=document.createElement('canvas');c.width=400;c.height=180;const ctx=c.getContext('2d');ctx.fillStyle='#315ca8';ctx.fillRect(0,0,400,180);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('PNG / JPG',24,90);
for(const extension of ['png','jpg']){
 const blob=await new Promise(r=>c.toBlob(r,extension==='png'?'image/png':'image/jpeg'));
 await native.testFiles('prepareBytes',{name:'картинка.'+extension,bytes:new Uint8Array(await blob.arrayBuffer())});await choices({opens:['картинка.'+extension],unsaved:['discard']});
 assert(await app.files.open(),'открытие '+extension);const image=[...app.doc.values()][0];assert(image.kind==='image'&&image.width===400&&image.height===180&&!image.pdfPage,'картинка с исходными пропорциями');
 app.selectTool('select',false);app.selection.selectAll();assert(app.selection.objects.length===1,'обычная картинка выбирается M');app.selection.show(null);
 await choices({saves:['картинкаp.svg']});assert(await app.files.save(true),'картинка сохраняется рабочим SVG');assert((await native.testFiles('lastDialog')).defaultPath.endsWith('/картинкаp.svg'),'имя рабочей копии картинки');
}
await choices({opens:['источник.pdf'],unsaved:['discard']});assert(await app.files.open(),'открытие PDF: '+JSON.stringify(await native.testFiles('errors')));
await test.sleep(500);await test.idle();await test.shot('first-page');
const pages=[...app.doc.values()];assert(pages.length===3&&pages.every(o=>o.pdfPage),'три страницы');
assert(pages[0].width===480&&pages[0].height===640&&Math.abs(pages[1].width-1120/3)<.001&&pages[1].height===560,'обрезка и поворот учитываются');
assert(pages[1].oy===688&&pages[2].oy===1296,'страницы одна под другой с промежутком');
app.selectTool('select',false);app.selection.selectAll();assert(app.selection.objects.length===0,'закреплённые страницы не выбираются Cmd+A');
app.selection.show(pages[0]);assert(!app.selection.objects.length,'даже прямой выбор не выделяет фон');
const draw=async(x,y,x2,y2)=>{
 app.view.restore({scale:1,rotSteps:0,x:(x+x2)/2,y:(y+y2)/2});await test.idle();
 const a=app.view.toScreen(x,y),b=app.view.toScreen(x2,y2);await test.pen([[a.x,a.y,.5],[b.x,b.y,.5]],2);await test.idle();
};
app.settings.snapToGrid=false;app.selectTool('line',false);app.chooseColor('#c9514e');app.settings.line.width=6;
for(const page of pages)await draw(page.ox+60,page.oy+110,page.ox+200,page.oy+110);
await draw(550,80,620,140); // Пометка вне всех страниц: только SVG/длинный лист.
const notes=[...app.doc.values()].filter(o=>!o.pdfPage);
app.selectTool('eraser',false);app.settings.eraser.original=true;app.settings.eraser.width=24;
await draw(130,110,130,110);assert(pages.every(p=>app.doc.get(p.id)===p),'ластик не меняет фон');assert(!app.doc.get(notes[0].id),'ластик стирает пометки');test.key('KeyZ');
app.selectTool('select',false);app.selection.selectAll();assert(app.selection.objects.length===4,'Cmd+A выбирает только пометки');app.selection.show(null);
await choices({saves:['1889p.svg']});assert(await app.files.save(true),'рабочий SVG с PDF');
let svg=await read('1889p.svg'),data=await app.files.worker.run('native',svg);
assert(data.pdf.data===sourceBase64&&data.objects.filter(o=>o.pdfPage).length===3&&data.objects.filter(o=>o.kind==='stroke').length===4,'SVG хранит оригинал и все пометки');
assert(data.objects.filter(o=>o.pdfPage).every(o=>o.kind==='svg'),'страницы в рабочем SVG векторные');
assert((svg.match(/<image\b/g)||[]).length===1,'в SVG только исходная маленькая картинка, без растров страниц');
await choices({opens:['1889p.svg']});assert(await app.files.open(),'повторное открытие рабочего SVG');app.selection.selectAll();assert(app.selection.objects.length===4,'страницы остаются закреплёнными после SVG');app.selection.show(null);
const locked=[...app.doc.values()].filter(o=>o.pdfPage);
app.selectTool('eraser',false);app.settings.eraser.original=true;await draw(240,300,240,400);
assert(locked.every(o=>app.doc.get(o.id)===o),'векторные страницы после SVG защищены и от ластика исходного SVG');
const module=await import('./pdf-render.js'),outputs={original:originalPath};
const set=(dialog,name,value)=>{if(name==='Формат'){const button=dialog.querySelector(`[data-format="${value}"]`);button.click();return button;}const input=dialog.querySelector(`[aria-label="${name}"]`);input.value=String(value);input.dispatchEvent(new Event(input.type==='range'?'input':'change'));};
let previousFormat='svg';
const exportFile=async(format,name,layout='pages')=>{
 const path=await native.testFiles('prepare',{name,text:''});await choices({saves:[name]});const pending=app.files.export(),dialog=document.querySelector('.export-dialog');
 assert(dialog.querySelector(`[data-format="${previousFormat}"]`).getAttribute('aria-checked')==='true','ожидаемый формат при открытии диалога: '+previousFormat);set(dialog,'Формат',format);
 if(format==='pdf'){
  assert(!dialog.querySelector('[aria-label="Страницы PDF"]').closest('label').hidden,'есть выбор страниц');set(dialog,'Страницы PDF',layout);
  const grid=dialog.querySelector('[aria-label="Сохранить сетку"]');
  assert(grid.disabled===(layout==='pages'),'сетка доступна для длинного листа, но не для исходных страниц');
  assert(grid.checked===(layout==='sheet'),'выбор сетки восстановлен при возврате к длинному листу');
 }
 if(format==='png'||format==='jpg')set(dialog,'Ширина в пикселях',900);
 await test.shot(format+'-'+layout+'-settings');[...dialog.querySelectorAll('button')].at(-1).click();assert(await pending,'экспорт '+name+': '+JSON.stringify(await native.testFiles('errors')));previousFormat=format;return path;
};
await exportFile('svg','1889.svg');
const svgBytes=app.files.lastWrite.bytes,proposed=await native.testFiles('lastDialog');
assert(proposed.defaultPath===originalPath.replace('источник.pdf','1889.svg'),'при первом экспорте 1889.svg предлагается в той же папке');
outputs.pages=await exportFile('pdf','страницы.pdf');outputs.sheet=await exportFile('pdf','лист.pdf','sheet');
const multipage=await module.loadPdf({name:'страницы.pdf',data:base64(await readBytes('страницы.pdf'))});
assert(multipage.numPages===3,'один PDF с тремя страницами');
const originals=await module.loadPdf({name:'источник.pdf',data:sourceBase64});
const svgErrors=[];
for(let i=0;i<3;i++){
 const reference=await module.renderPage(originals,i,3),page=data.objects.filter(o=>o.pdfPage)[i];
 const image=new Image(),url=URL.createObjectURL(new Blob([page.source],{type:'image/svg+xml'}));
 try{
  image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=reference.width;canvas.height=reference.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const a=ctx.getImageData(0,0,canvas.width,canvas.height).data,b=reference.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let sum=0,changed=0;for(let k=0;k<a.length;k+=4){let max=0;for(let j=0;j<3;j++){const delta=Math.abs(a[k+j]-b[k+j]);sum+=delta;max=Math.max(max,delta);}if(max>64)changed++;}
  const metrics={mae:sum/(a.length/4*3),changed:changed/(a.length/4)};svgErrors.push(metrics);
  assert(metrics.mae<1.5&&metrics.changed<.005,`внешний SVG на масштабе 300 %, страница ${i}: ${JSON.stringify(metrics)}`);
  canvas.width=canvas.height=reference.width=reference.height=1;
 }finally{URL.revokeObjectURL(url);}
}
const countColor=(canvas,red)=>{const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<p.length;i+=4)if(red?p[i]>150&&p[i+1]<140&&p[i+2]<140:p[i]<90&&p[i+1]<150&&p[i+2]>140)count++;return count;};
for(let i=0;i<3;i++){
 const before=await module.renderPage(originals,i,1),after=await module.renderPage(multipage,i,1);
 assert(before.width===after.width&&before.height===after.height,'исходные размеры страницы '+i);
 assert(countColor(after,true)>countColor(before,true)+700,'пометка видна на странице '+i);
 assert(Math.abs(countColor(after,false)-countColor(before,false))<20,'оригинал не закрыт белой подложкой пометок '+i);
 before.width=before.height=after.width=after.height=1;
}
await originals.loadingTask.destroy();await multipage.loadingTask.destroy();
const sheet=await module.loadPdf({name:'лист.pdf',data:base64(await readBytes('лист.pdf'))});assert(sheet.numPages===1,'длинный PDF — одна страница');await sheet.loadingTask.destroy();
outputs.png=await exportFile('png','лист.png');const png=new Image();png.src='data:image/png;base64,'+base64(await readBytes('лист.png'));await png.decode();assert(png.naturalWidth===900&&png.naturalHeight>2000,'длинный PNG всего холста');
assert(base64(await readBytes('источник.pdf'))===sourceBase64,'исходный PDF не изменён');
// Маркеры обязаны умножать цвет исходного PDF и друг друга, а белое перо — закрывать его.
const marker=async(x,x2)=>{app.selectTool('marker',false);app.chooseColor('#78a95f');await draw(x,320,x2,320);};
const white=async(x,x2)=>{app.selectTool('line',false);app.chooseColor('#ffffff');app.settings.line.width=10;await draw(x,320,x2,320);};
await marker(60,420);await white(130,165);await marker(200,420);await white(260,300);await marker(280,420);
app.view.restore({scale:1,rotSteps:0,x:240,y:320});await test.sleep(300);await test.idle();await test.shot('markers');
const samples=[100,150,230,270,290,360],scene=document.querySelector('#scene').getContext('2d');
const expected=samples.map(x=>{const p=app.view.toScreen(x,320);return [...scene.getImageData(Math.round(p.x*app.view.dpr),Math.round(p.y*app.view.dpr),1,1).data];});
for(const layout of ['pages','sheet']){
 const data={...app.files.snapshot(),exportOptions:{quality:'maximum',editable:false,grid:'paths'}};
 const {request,bytes}=await app.files.process('Проверка PDF…',async op=>{
  const request=await app.files.pdfRequest(data,layout,op);
  return {request,bytes:await app.files.nativePdf(op,id=>app.platform.files.annotatedPdf(request,id))};
 });
 const name='маркер-'+layout+'.pdf';outputs['marker'+layout]=await native.testFiles('prepareBytes',{name,bytes});
 const pdf=await module.loadPdf({name,data:base64(bytes)}),canvas=await module.renderPage(pdf,0,1);
 const actual=samples.map(x=>[...canvas.getContext('2d').getImageData(Math.round(x-(layout==='sheet'?request.bounds.x:0)),Math.round(320-(layout==='sheet'?request.bounds.y:0)),1,1).data]);
 assert(actual.every((color,n)=>color.slice(0,3).every((v,i)=>Math.abs(v-expected[n][i])<=5)),`цвет маркера/пера PDF ${layout}: ${JSON.stringify({expected,actual})}`);
 await pdf.loadingTask.destroy();
}
app.view.restore({scale:.43,rotSteps:0,x:280,y:808});await test.sleep(500);await test.idle();await test.shot('all-pages');
assert(!(await native.testFiles('errors')).length,'нет ошибок');
return {ok:true,outputs,png:[png.naturalWidth,png.naturalHeight],svgBytes,svgErrors};
