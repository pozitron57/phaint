// Импорт, маски, размер вставок Retina, выбор/удаление и перемещение без нажатия пера.
const {app,test}=window.__phaint;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const native=window.phaintNative;
const prepare=(name,text)=>native.testFiles('prepare',{name,text});
const choose=choices=>native.testFiles('choices',{choices});
const hover=(x,y)=>document.getElementById('live').dispatchEvent(new PointerEvent('pointermove',{pointerId:5,pointerType:'pen',clientX:x,clientY:y,buttons:0,pressure:0,bubbles:true}));
assert(app.settings.palette.includes('#000000'),'чёрный абсолютно чёрный');
hover(220,180);const start=app.view.toScreen(0,0);test.key('Space');hover(320,220);
window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true}));
const end=app.view.toScreen(0,0);assert(end.x-start.x===100 && end.y-start.y===40 && app.doc.size===0,'pan без клика');
const source='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><path fill="black" d="M50 50H1550V950H50Z"/></svg>';
await prepare('оригинал.svg',source);await choose({opens:['оригинал.svg']});assert(await app.files.open(),'открыт внешний SVG');await test.idle();
const svg=[...app.doc.values()][0];
const point=app.view.toScreen(svg.ox+400,svg.oy+300);
const at=(x,y)=>document.getElementById('scene').getContext('2d').getImageData(Math.round(x*app.view.dpr),Math.round(y*app.view.dpr),1,1).data;
app.settings.grid.enabled=false;app.renderer.invalidateScene();await test.idle();
assert(at(point.x,point.y)[0]===0,'исходник виден');
test.key('KeyE',{metaKey:true,shiftKey:true});await test.pen([[point.x,point.y,.5]],2);await test.idle();
assert(at(point.x,point.y)[0]===0,'режим добавок защищает исходный SVG');
app.toggleOriginalEraser();await test.pen([[point.x,point.y,.5],[point.x+50,point.y,.5]],3);await test.idle();
assert(at(point.x,point.y)[0]===255,'оригинальный SVG стёрт');
test.key('KeyZ',{metaKey:true});await test.idle();assert(at(point.x,point.y)[0]===0,'маска отменяется');
test.key('KeyY');await test.idle();assert(at(point.x,point.y)[0]===255,'маска повторяется');
// Изображение 400x200 пикселей с логическим размером снимка 200x100 пунктов.
const c=document.createElement('canvas');c.width=400;c.height=200;const g=c.getContext('2d');g.fillStyle='#c9514e';g.fillRect(0,0,400,200);
const clipboard=app.platform.clipboardImage;app.platform.clipboardImage=async()=>({dataURL:c.toDataURL(),width:200,height:100});
hover(point.x+100,point.y+100);test.key('KeyV');while(app.pasting)await test.sleep(10);await test.idle();
const image=[...app.doc.values()].find(o=>o.kind==='image');
assert(image && Math.abs(image.width*app.view.scale-200)<.01 && Math.abs(image.height*app.view.scale-100)<.01,'снимок сохраняет экранный размер при импортном масштабе');
assert(app.tool.id==='select','вставка выделена');
const imagePoint=app.view.toScreen(image.ox+image.width/2,image.oy+image.height/2);
test.key('KeyE',{metaKey:true,shiftKey:true});await test.pen([[imagePoint.x,imagePoint.y,.5]],3);await test.idle();
assert(at(imagePoint.x,imagePoint.y)[0]===201,'ластик не трогает картинку');
test.key('KeyX');await test.pen([[imagePoint.x,imagePoint.y,.5]],2);test.key('Backspace');assert(![...app.doc.values()].some(o=>o.kind==='image'),'X и Delete удаляют картинку');
test.key('KeyZ',{metaKey:true});await test.idle();assert([...app.doc.values()].some(o=>o.kind==='image'),'отмена удаления');
app.selectTool('select',false);test.key('AltLeft');await test.pen([[imagePoint.x,imagePoint.y,.5],[imagePoint.x+40,imagePoint.y+30,.5]],3);
window.dispatchEvent(new KeyboardEvent('keyup',{code:'AltLeft',bubbles:true}));await test.idle();
const moved=[...app.doc.values()].find(o=>o.kind==='image');assert(Math.abs((moved.ox-image.ox)*app.view.scale-40)<.1,'объект перемещается');
test.key('Escape'); // Полный документ: новое Cmd+S с выделением сохраняет только его.
await choose({saves:['маски-картинки.svg']});assert(await app.files.save(true),'сохранены маски и PNG');
const saved=await native.testFiles('read',{name:'маски-картинки.svg'});
assert(saved.split(image.source).length===2,'PNG хранится один раз');
await choose({opens:['маски-картинки.svg']});assert(await app.files.open(),'повторное открытие');await test.idle();
assert(at(point.x,point.y)[0]===255,'ластик сохранён в SVG');
// Обычный SVG без служебных данных должен выглядеть так же в любом редакторе.
await prepare('видимый.svg',saved.replace(/<metadata[\s\S]*?<\/metadata>\n/,''));
await choose({opens:['видимый.svg']});assert(await app.files.open(),'видимые маски без metadata');await test.idle();
await test.shot('external-mask');
app.platform.clipboardImage=clipboard;
// Реальный файл пользователя подаётся отдельным проверочным запуском, тест его не изменяет.
let sizes=null;
if(window.__potrace){
 await prepare('potrace.svg',window.__potrace);await choose({opens:['potrace.svg']});assert(await app.files.open(),'potrace открылся');
 await choose({saves:['potrace-сохранён.svg']});assert(await app.files.save(true),'potrace сохранился');
 const bytes=await native.testFiles('size',{name:'potrace-сохранён.svg'});sizes={before:new TextEncoder().encode(window.__potrace).length,after:bytes};
 assert(bytes<sizes.before*1.05,'импорт больше не дублируется');await test.idle();await test.shot('potrace');
}
return {ok:true,sizes,baseScale:app.files.baseScale};
