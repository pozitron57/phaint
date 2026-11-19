// SVGO в настоящем Worker: диалог, оба пути записи, видимое SVG и сведения F12.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);},size=text=>new TextEncoder().encode(text).length;
const choose=choices=>native.testFiles('choices',{choices}),read=name=>native.testFiles('read',{name});
const paths=Array.from({length:260},(_,i)=>`<path d="M${20+i%26*18} ${30+Math.floor(i/26)*9}h8v4h-8z"/>`).join('');
await native.testFiles('prepare',{name:'контуры.svg',text:`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><g transform="translate(10 10) scale(.75)">${paths}</g></svg>`});
await choose({opens:['контуры.svg']});assert(await app.files.open(),'открыты отдельные внешние контуры');assert(app.doc.size===260,'снимок передаётся несколькими порциями');
app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});app.settings.snapToGrid=false;
app.settings.grid.enabled=app.settings.grid.save=true;
const tool=id=>app.selectTool(id,false),drag=async(a,b)=>{test.pointer('pointerdown',...a,.5);test.pointer('pointermove',...b,.5);test.pointer('pointerup',...b,0);await test.idle();};
tool('arrow');await drag([180,240],[460,260]);const arrow=[...app.doc.values()].at(-1);
tool('ellipse');await drag([540,270],[600,310]);tool('pen');await test.pen(Array.from({length:120},(_,i)=>[180+i*2,360+Math.sin(i*.13)*30,.2+(i%20)/30]),0);
tool('marker');await test.pen([[180,360,.5],[300,390,.5],[240,340,.5],[320,360,.5]],1);await test.pen([[260,355,.5],[370,355,.5]],1);
const readClipboard=app.platform.readClipboardSvg;
app.platform.readClipboardSvg=async()=>'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><defs><linearGradient id="grad"><stop stop-color="#315ca6"/><stop offset="1" stop-color="#79ad65"/></linearGradient><mask id="cut"><rect width="160" height="100" fill="white"/><circle cx="30" cy="30" r="12" fill="black"/></mask></defs><g mask="url(#cut)"><rect width="160" height="100" fill="url(#grad)"/><text x="10" y="60">Сила 🙂</text></g></svg>';
app.input.position={x:650,y:190};await app.clipboard.paste();app.platform.readClipboardSvg=readClipboard;
const c=document.createElement('canvas');c.width=60;c.height=40;const cx=c.getContext('2d');cx.fillStyle='#cb4d4a';cx.fillRect(5,5,50,30);
const imageClipboard=app.platform.clipboardImage;app.platform.clipboardImage=async()=>({dataURL:c.toDataURL(),width:60,height:40});app.input.position={x:650,y:330};await app.pasteImage();app.platform.clipboardImage=imageClipboard;tool('pen');
const state=app.history.state,objects=[...app.doc.values()],originalFile=app.files.file;
const change=(dialog,label,value)=>{if(label==='Формат'){const button=dialog.querySelector(`[data-format="${value}"]`);button.click();return button;}const el=dialog.querySelector(`[aria-label="${label}"]`);el.value=value;el.dispatchEvent(new Event(el.type==='range'?'input':'change'));return el;};
const begin=async(name,selection=false)=>{
 await choose({saves:[name]});const pending=selection?app.files.save():app.files.export(),dialog=document.querySelector('.export-dialog');change(dialog,'Формат','svg');change(dialog,'Сжатие',4);return {pending,dialog};
};
const finish=async job=>{[...job.dialog.querySelectorAll('button')].at(-1).click();assert(await job.pending,'экспорт выполнен');return read(app.files.lastWrite.name);};
let job=await begin('до-SVGO.svg'),editable=job.dialog.querySelector('[aria-label="Сохранить редактирование в Phaint"]');editable.click();
const before=await finish(job);assert(app.files.lastWrite.bytes===size(before)&&!app.files.lastWrite.processing,'размер обычного SVG без обработчика');
job=await begin('после-SVGO.svg');editable=job.dialog.querySelector('[aria-label="Сохранить редактирование в Phaint"]');editable.click();
const box=job.dialog.querySelector('[aria-label="Дополнительное сжатие SVG"]');box.click();assert(editable.disabled&&!editable.checked,'SVGO отключает полное редактирование');
box.click();assert(!editable.disabled&&editable.checked,'отключение SVGO возвращает прежний выбор');box.click();await test.shot('settings');
const after=await finish(job),stats=app.files.lastWrite;
assert(stats.processing?.name==='SVGO'&&stats.processing.before===size(before),'размер до SVGO относится к тем же контурам без metadata');
assert(stats.bytes===size(after)&&stats.bytes<=stats.processing.before&&stats.processing.after>=stats.bytes,'размеры совпадают с записанным файлом');
assert(stats.processing.used&&stats.processing.after===stats.bytes,'сжатие действительно сработало');
assert(!after.includes('<metadata')&&await app.files.worker.run('native',after)===null,'SVGO-файл не обещает восстановление исходных объектов');
assert(app.settings.export.svg.svgo&&app.settings.export.svg.editable,'выборы независимо запомнились');
assert(app.files.file===originalFile&&app.history.state===state&&objects.every(o=>app.doc.get(o.id)===o),'экспорт не изменил рабочие объекты');
const render=async text=>{const u=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'})),im=new Image();im.src=u;await im.decode();const canvas=document.createElement('canvas');canvas.width=im.width*2;canvas.height=im.height*2;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);URL.revokeObjectURL(u);return {canvas,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};};
const a=await render(before),b=await render(after);assert(a.pixels.length===b.pixels.length,'размеры и viewBox сохранены');let sum=0,changed=0;
for(let i=0;i<a.pixels.length;i+=4){let d=0;for(let k=0;k<3;k++){const diff=Math.abs(a.pixels[i+k]-b.pixels[i+k]);sum+=diff;d=Math.max(d,diff);}if(d>32)changed++;}
const mae=sum/(a.pixels.length/4*3),changedRatio=changed/(a.pixels.length/4);assert(mae<.15&&changedRatio<.001,'сетка, маски, маркеры, PNG и текст сохранились: '+mae+' / '+changedRatio);
b.canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:white;z-index:999';document.body.append(b.canvas);await test.frames(2);await test.shot('result');b.canvas.remove();
test.key('F12');await test.sleep(300);const debug=document.querySelector('.debug-text').textContent;assert(debug.includes('До SVGO:')&&debug.includes('После SVGO:')&&debug.includes(String(stats.bytes)+' байт'),'F12 показывает точные размеры');await test.shot('stats');test.key('F12');
job=await begin('отмена.svg');job.dialog.querySelector('[aria-label="Дополнительное сжатие SVG"]').click();job.dialog.querySelector('.export-cancel').click();assert(!await job.pending&&app.files.lastWrite===stats&&app.settings.export.svg.svgo,'отмена не меняет статистику и настройки');
job=await begin('отмена-файла.svg');await choose({saves:[]});[...job.dialog.querySelectorAll('button')].at(-1).click();assert(!await job.pending&&app.files.lastWrite===stats,'отмена файлового диалога не меняет последнюю запись');
// Браузерный путь записи: тот же Worker, без beginWrite/потоковой выдачи.
const beginWrite=app.platform.files.beginWrite;app.platform.files.beginWrite=undefined;
try{job=await begin('без-потока.svg');const text=await finish(job);assert(app.files.lastWrite.bytes===size(text)&&app.files.lastWrite.processing.before===stats.processing.before,'непотоковая запись также возвращает размеры');}finally{app.platform.files.beginWrite=beginWrite;}
tool('select');app.selection.show(arrow);job=await begin('стрелка-SVGO.svg',true);assert(job.dialog.querySelector('[data-format="pdf"]').disabled,'Cmd+S выделения показывает SVG');const selected=await finish(job);assert(!selected.includes('<metadata')&&app.files.lastWrite.bytes===size(selected),'SVGO работает для выделения');
// Полное Cmd+S сохраняет редактирование даже при включённом SVGO в экспорте.
tool('pen');await choose({saves:['полный.svg']});assert(await app.files.save(true),'рабочий SVG сохранён');const full=await read('полный.svg');assert((await app.files.worker.run('native',full))?.objects.length===objects.length,'обычное сохранение оставляет точные объекты');assert(!app.files.lastWrite.processing&&app.files.lastWrite.bytes===size(full),'обычное сохранение сбрасывает сведения о прежнем обработчике');
const saved=app.files.lastWrite;await app.files.backup();assert(app.files.lastWrite===saved,'резервная копия не подменяет сведения о сохранении');
assert((await native.testFiles('errors')).length===0,'ошибок нет');
return {ok:true,before:stats.processing.before,after:stats.processing.after,written:stats.bytes,mae,changedRatio};
