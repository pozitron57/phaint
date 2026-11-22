// Проверка реального диалога и PDF: сетка векторная во всех профилях, текст PNG недвусмысленный.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);};
app.settings.snapToGrid=false;app.settings.grid.enabled=app.settings.grid.save=true;
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
app.setStylePerTool(true);
app.selectTool('line',false);app.settings.line.color='#000000';await test.pen([[180,240,.5],[600,240,.5]],1);
app.selectTool('marker',false);await test.pen([[200,240,.5],[400,240,.5],[300,210,.5],[400,240,.5]],1);
app.selectTool('pen',false);await test.pen(Array.from({length:90},(_,i)=>[180+i*4,340+30*Math.sin(i*.2),.5]),1);
// Кольцо из перекрывающихся частей одного штриха: объединение сохраняет отверстие.
const seed=[...app.doc.values()].at(-1),ring={...seed,ox:0,oy:0,pts:Float32Array.from(Array.from({length:101},(_,i)=>[60+40*Math.cos(i*Math.PI/50),60+40*Math.sin(i*Math.PI/50),8]).flat()),bbox:{minX:16,minY:16,maxX:104,maxY:104}};
const probe=document.createElement('canvas');probe.width=probe.height=136;const ctx=probe.getContext('2d',{willReadFrequently:true});
for(const quality of ['maximum','high','compact']){
 const data={...app.files.snapshot([ring]),grid:{enabled:false,step:30},exportOptions:{quality,editable:false}},svg=await app.files.worker.run('visual',data);
 const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement,box=root.getAttribute('viewBox').split(' ').map(Number);
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();image.src=url;await image.decode();ctx.clearRect(0,0,136,136);ctx.drawImage(image,0,0);
 const alpha=(x,y)=>ctx.getImageData(Math.round(x-box[0]),Math.round(y-box[1]),1,1).data[3];
 assert(alpha(60,60)===0&&alpha(100,60)>240,'кольцо остаётся пустым внутри: '+quality);URL.revokeObjectURL(url);
}
const set=(dialog,label,value)=>{if(label==='Формат'){const button=dialog.querySelector(`[data-format="${value}"]`);button.click();return button;}const input=dialog.querySelector(`[aria-label="${label}"]`);input.value=String(value);input.dispatchEvent(new Event(input.type==='range'?'input':'change'));};
const paths=[];
for(const quality of ['maximum','high','compact']){
 const name='сетка-'+quality+'.pdf';paths.push(await native.testFiles('prepare',{name,text:''}));await native.testFiles('choices',{choices:{saves:[name]}});
 const pending=app.files.export(),dialog=document.querySelector('.export-dialog');set(dialog,'Формат','pdf');set(dialog,'Сжатие',({maximum:0,high:2,compact:4})[quality]);
 assert(dialog.textContent.includes('Сетка будет сохранена'),'явное указание сохранения сетки');
 if(quality==='compact')await test.shot('pdf-settings');[...dialog.querySelectorAll('button')].at(-1).click();assert(await pending,'PDF сохранён');
}
let pending=app.files.export(),dialog=document.querySelector('.export-dialog');set(dialog,'Формат','png');
assert(dialog.querySelector('.export-description:not([hidden])').textContent.includes('Сетка будет сохранена'),'PNG обещает сетку вместе с белой подложкой');await test.shot('png-grid');dialog.querySelector('.export-cancel').click();await pending;
app.settings.grid.enabled=false;pending=app.files.export();dialog=document.querySelector('.export-dialog');set(dialog,'Формат','png');assert(dialog.textContent.includes('Без сетки'),'скрытая сетка не обещается');
let box=dialog.querySelector('[aria-label="Сохранить сетку"]');assert(box.disabled&&!box.checked,'скрытую сетку нельзя экспортировать');dialog.querySelector('.export-cancel').click();await pending;
// Ручные параметры запоминаются отдельно для формата; отмена не сохраняет черновик.
app.settings.grid.enabled=true;await native.testFiles('choices',{choices:{saves:['точность.svg']}});pending=app.files.export();dialog=document.querySelector('.export-dialog');set(dialog,'Формат','svg');set(dialog,'Сжатие',3);
assert(!dialog.querySelector('[aria-label="Качество"]'),'пресетов больше нет');await test.shot('custom');[...dialog.querySelectorAll('button')].at(-1).click();assert(await pending,'SVG с ручными параметрами');
assert(app.settings.export.svg.compression===3&&app.settings.export.pdf.compression===4,'параметры независимы у форматов');
// Настройка влияет на копию и её рамку, но не на холст, Cmd+S и точные данные.
const original=await app.files.worker.run('svg',app.files.snapshot()),workerClass=Object.getPrototypeOf(app.files.worker),run=workerClass.run,sizes=[];let printed='';
workerClass.run=async function(...args){const result=await run.apply(this,args);if(args[0]==='visual')printed=result;return result;};
for(const format of ['svg','png','jpg','pdf'])for(const included of [true,false]){
 const name=`grid-${format}-${included}.${format}`;await native.testFiles('choices',{choices:{saves:[name]}});
 pending=app.files.export();dialog=document.querySelector('.export-dialog');set(dialog,'Формат',format);box=dialog.querySelector('[aria-label="Сохранить сетку"]');
 assert(!box.disabled,'видимую сетку можно включать в любом формате');if(box.checked!==included)box.click();
 assert(dialog.textContent.includes(included?'Сетка будет сохранена':'флажок «Сохранить сетку» снят'),'подпись соответствует выбору');
 let expectedHeight=0;
 if(format==='png'||format==='jpg'){set(dialog,'Ширина в пикселях',480);expectedHeight=Number(dialog.textContent.match(/480 × (\d+) пикселей/)[1]);}
 if(format==='png')await test.shot(included?'grid-on':'grid-off');
 printed='';[...dialog.querySelectorAll('button')].at(-1).click();assert(await pending,'экспорт '+name);
 const svg=format==='svg'?await native.testFiles('read',{name}):printed;
 assert(svg.includes('data-phaint-grid')===included,'сетка действительно включена/исключена из '+format);
 const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement,w=Number(root.getAttribute('width')),h=Number(root.getAttribute('height'));sizes.push({format,included,w,h});
 if(format==='png'||format==='jpg'){
  const bytes=Uint8Array.from(await native.testFiles('readBytes',{name})),url=URL.createObjectURL(new Blob([bytes])),image=new Image();image.src=url;await image.decode();
  assert(image.width===480&&image.height===expectedHeight,'пропорции '+format+' совпадают с диалогом после переключения сетки');URL.revokeObjectURL(url);
 }
 assert(app.settings.export.includeGrid===included,'выбор запоминается после записи');
 assert(app.settings.grid.enabled&&app.settings.grid.save,'экспорт не меняет настройки рабочего рисунка');
}
workerClass.run=run;
assert(sizes[0].w>=sizes[1].w&&sizes[0].h>=sizes[1].h&&(sizes[0].w>sizes[1].w||sizes[0].h>sizes[1].h),'без сетки рамка больше не округляется до целых клеток');
assert(await app.files.worker.run('svg',app.files.snapshot())===original,'обычное сохранение и нажим не изменены');
pending=app.files.export();dialog=document.querySelector('.export-dialog');box=dialog.querySelector('[aria-label="Сохранить сетку"]');assert(!box.checked,'последний выбор восстановлен');box.click();dialog.querySelector('.export-cancel').click();assert(!await pending&&!app.settings.export.includeGrid,'отмена настроек не меняет выбор');
await native.testFiles('choices',{choices:{saves:[null]}});pending=app.files.export();dialog=document.querySelector('.export-dialog');dialog.querySelector('[aria-label="Сохранить сетку"]').click();[...dialog.querySelectorAll('button')].at(-1).click();assert(!await pending&&!app.settings.export.includeGrid,'отмена файлового диалога не меняет выбор');
return {ok:true,paths,sizes};
