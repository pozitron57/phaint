// Отмена настоящего потока записи, открытия и PDF: файл/документ целы, следующая операция работает.
const {app,test}=window.__phaint,native=window.phaintNative,api={...app.platform.files};
app.platform.files=api;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const choices=choices=>native.testFiles('choices',{choices});
const until=async (fn,label)=>{for(let i=0;i<500;i++){if(fn())return;await test.sleep(10);}throw new Error('Не дождались этапа операции: '+label);};
const read=name=>native.testFiles('read',{name});
app.settings.grid.save=false;
await test.pen([[160,180,.5],[440,260,.8]],2);
await choices({saves:['сохранение.svg']});assert(await app.files.save(),'первое сохранение');
const saved=await read('сохранение.svg'),lastWrite=app.files.lastWrite;
await test.pen([[180,300,.5],[500,350,.8]],2);
const objects=[...app.doc.values()],state=app.history.state;
let release,chunkStarted=false;
const gate=new Promise(r=>release=r),writeChunk=api.writeChunk;
api.writeChunk=async(...args)=>{await writeChunk(...args);chunkStarted=true;await gate;};
try{
  const saving=app.files.save();await until(()=>chunkStarted,'порция SVG');await test.sleep(450);
  const panel=document.querySelector('.file-progress');assert(panel&&panel.textContent.includes('Отмена'),'видна отмена');
  await test.shot('saving');panel.querySelector('button').click();
  assert(!await saving,'сохранение прервано');release();await test.sleep(50);
  assert(await read('сохранение.svg')===saved,'исходный SVG не заменён частичной записью');
  assert(app.files.dirty&&app.history.state===state&&app.files.lastWrite===lastWrite,'статус сохранения и история не изменились');
  assert(objects.every((o,i)=>[...app.doc.values()][i]===o),'объекты неизменны');
  assert(!document.querySelector('.file-progress')&&!app.files.busy,'панель убрана и команды доступны');
  assert((await native.testFiles('jobs')).writers===0,'временный поток освобождён');
}finally{release();api.writeChunk=writeChunk;}
assert(await app.files.save(),'повторное сохранение после отмены работает');
// Настраиваемая клавиша отмены работает даже при заблокированном холсте открытия.
const postMessage=Worker.prototype.postMessage,keys={...app.settings.keys};
let reading=false;
Worker.prototype.postMessage=function(message,...rest){
  const result=postMessage.call(this,message,...rest);
  if(message.kind==='native'&&!reading){reading=true;queueMicrotask(()=>test.key('F8'));}
  return result;
};
try{
  app.actions.setOverrides({...keys,'ui.escape':['F8']});
  await choices({opens:['сохранение.svg']});assert(!await app.files.open(),'отмена открытия по переназначенной клавише');
  assert(!app.input.blocked&&!document.getElementById('ui').inert,'ввод разблокирован');
  assert(objects.every((o,i)=>[...app.doc.values()][i]===o),'отмена открытия не заменяет холст');
}finally{Worker.prototype.postMessage=postMessage;app.actions.setOverrides(keys);}
// PDF печатается в главном процессе: отмена закрывает его окно и завершает рабочий поток.
const pdf=api.pdf;let printing=false;
api.pdf=(...args)=>{printing=true;const promise=pdf(...args);setTimeout(()=>test.key('Escape'),0);return promise;};
await native.testFiles('prepare',{name:'экспорт.pdf',text:'ПРЕЖНИЙ ФАЙЛ'});
try{
  await choices({saves:['экспорт.pdf']});const exporting=app.files.export();
  await until(()=>document.querySelector('dialog.export-dialog'),'диалог экспорта');
  document.querySelector('[data-format=pdf]').click();
  document.querySelector('.export-actions button:last-child').click();
  assert(!await exporting&&printing,'печать PDF отменена');
  assert(await read('экспорт.pdf')==='ПРЕЖНИЙ ФАЙЛ','прежний экспорт не перезаписан');
  assert((await native.testFiles('jobs')).pdf===0,'PDF-операция очищена');
  assert(!app.files.busy&&!app.input.blocked,'можно продолжить работу');
}finally{api.pdf=pdf;}
// После отмены работает и новый PDF, и резервная копия.
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M10 10L90 90" stroke="black"/></svg>';
const bytes=await api.pdf(svg,100,100);assert(bytes.length>100,'новая печать PDF работает');
await native.testFiles('prepareBytes',{name:'открытие.pdf',bytes});
const processFile=app.files.process;
app.files.process=function(label,fn){return processFile.call(this,label,op=>{
  const update=op.update.bind(op);op.update=text=>{update(text);if(text.startsWith('Открываю PDF:'))queueMicrotask(()=>test.key('Escape'));};
  return fn(op);
});};
try{
  await choices({opens:['открытие.pdf']});assert(!await app.files.open(),'PDF.js отменён во время подготовки страницы');
  assert(objects.every((o,i)=>[...app.doc.values()][i]===o)&&!app.input.blocked,'открытие PDF не заменило рисунок');
}finally{app.files.process=processFile;}

await test.pen([[200,400,.5],[500,430,.8]],2);await app.files.backup();
assert((await api.recoveryRead())?.data,'автокопия доступна после отмены');
const recoveries=await native.testFiles('recoveryFiles');
await api.deferRecovery();assert(await api.recoveryRead()===null,'отложенная копия отделена от текущего окна');
await app.files.backup();
const nextRecoveries=await native.testFiles('recoveryFiles');
assert(nextRecoveries.length===recoveries.length+1&&recoveries.every(n=>nextRecoveries.includes(n)),'новая автокопия не затирает отложенное восстановление');
assert(!(await native.testFiles('errors')).length,'отмена не показывается как ошибка');
await test.shot('ready');
return {ok:true,historyBytes:app.history.bytes,pdfBytes:bytes.length};
