// Настройки головок/штрихов, горизонтальные концы параболы и видимый отклик SVG-ластика.
const {app,test}=window.__phaint;
// Геометрия прежних сценариев — без автоматической привязки; оба режима проверяет grid-crop.
app.settings.snapToGrid=false;
const assert=(value,message)=>{if(!value)throw new Error(message);};
const tool=id=>app.selectTool(id,false),last=()=>[...app.doc.values()].at(-1);
const pointer=(type,x,y,mods={})=>test.pointer(type,x,y,type==='pointerup'?0:.5,'pen',mods);
const drag=async(a,b,mods={})=>{pointer('pointerdown',...a,mods);pointer('pointermove',...b,mods);pointer('pointerup',...b,mods);await test.idle();};
const keyup=code=>window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
const origin=()=>app.view.restore({x:app.view.width/app.view.dpr/2,y:app.view.height/app.view.dpr/2,scale:1,rotSteps:0});
const reset=async()=>{app.input.cancelCurrent();app.closePanels();app.doc.replace([]);app.history.clear();app.view.reset();app.settings.grid.enabled=false;app.renderer.invalidateScene();await test.idle();};
await reset();tool('arrow');Object.assign(app.settings.arrow,{width:10,headLength:8,headWidth:7,headType:'filled',headRound:0});
await drag([450,200],[900,200]);app.settings.arrow.headRound=1;await drag([450,350],[900,350]);
tool('select');app.selection.show(last());app.togglePanel('brush');
const panel=app.panels.brush.el,section=name=>[...panel.querySelectorAll('fieldset')].find(e=>e.querySelector('legend').textContent===name);
const dash=section('Линия'),sliders=[...dash.querySelectorAll('input[type=range]')];
assert(sliders.every(e=>e.disabled&&Number(getComputedStyle(e.closest('.row')).opacity)<.6),'ползунки штрихов и точек неактивны');
const oldLength=app.ink.dashLength;sliders[0].value='19';sliders[0].dispatchEvent(new Event('input',{bubbles:true}));assert(app.ink.dashLength===oldLength,'неактивный ползунок не меняет настройки');
dash.querySelector('[data-value=dash]').click();assert(!sliders[0].disabled&&!sliders[1].disabled&&sliders[2].disabled,'штрихи активируют только свои ползунки');
dash.querySelector('[data-value=dots]').click();assert(sliders[0].disabled&&sliders[1].disabled&&!sliders[2].disabled,'точки активируют только свой ползунок');
dash.querySelector('[data-value=solid]').click();
const head=section('Головка стрелки'),buttons=[...head.querySelectorAll('.choice-buttons button')];
assert(buttons.length===2&&!head.querySelector('select'),'две кнопки формы вместо списка');
const round=[...head.querySelectorAll('label')].find(e=>e.textContent.includes('Скругление')).querySelector('input');
buttons.find(b=>b.dataset.value==='open').click();assert(round.disabled&&app.selection.selected.shape.headType==='open','открытая головка выбрана кнопкой');
buttons.find(b=>b.dataset.value==='filled').click();assert(!round.disabled,'скругление доступно для треугольника');
round.value='.6';round.dispatchEvent(new Event('input',{bubbles:true}));assert(app.selection.selected.shape.headRound===.6&&app.settings.arrow.headRound===.6,'скругление меняет выбранную и следующие стрелки');
const saved=await app.files.worker.run('native',await app.files.worker.run('svg',app.files.snapshot()));assert(saved.objects.at(-1).shape.headRound===.6,'скругление сохраняется в SVG');
await test.shot('settings');app.closePanels();tool('arrow');await drag([450,500],[490,500]);await test.shot('heads');

await reset();tool('parabola');
pointer('pointerdown',300,400);pointer('pointermove',700,480);test.key('ShiftLeft');pointer('pointerup',700,480);keyup('ShiftLeft');
assert(app.tool.shape.height===0,'горизонтальные концы сохраняются после первого отрыва и отпускания Shift');
await drag([500,200],[500,170]);assert(last().shape.height===0&&Math.abs(last().pts.at(-2))<.001,'парабола с горизонтальными концами');
await drag([760,430],[1100,500]);pointer('pointerdown',930,250);test.key('ShiftLeft');pointer('pointermove',930,200);pointer('pointerup',930,200);keyup('ShiftLeft');
assert(last().shape.height===0,'Shift выравнивает концы и на втором этапе');await test.shot('parabolas');

// Один большой контур: следующий отсчёт пера не должен отменять видимое обновление.
const path=[];for(let y=100;y<720;y+=20)for(let x=80;x<1140;x+=20)path.push(`M${x} ${y}h8v8h-8Z`);
const source=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760"><path d="${path.join('')}"/></svg>`;
const native=window.phaintNative;
await native.testFiles('prepare',{name:'контур.svg',text:source});await native.testFiles('choices',{choices:{opens:['контур.svg'],unsaved:['discard']}});assert(await app.files.open(),'большой внешний контур открыт');
origin();app.files.baseScale=1;app.settings.grid.enabled=false;app.renderer.invalidateScene();await test.idle();
const vectors=[...app.doc.values()];assert(vectors.every(o=>o.kind==='vector'),'простой контур разобран');
const clipboard=app.platform.clipboardImage,c=document.createElement('canvas');c.width=c.height=100;const g=c.getContext('2d');g.fillStyle='#cf914d';g.fillRect(0,0,100,100);
app.platform.clipboardImage=async()=>({dataURL:c.toDataURL(),width:100,height:100});app.input.position={x:370,y:270};await app.pasteImage();app.platform.clipboardImage=clipboard;
const image=last();app.doc.replace([image,...vectors.map(o=>({...o,z:o.z+10}))]);app.history.clear();await test.idle();
const scene=document.getElementById('scene'),ctx=scene.getContext('2d'),d=app.view.dpr;
const pixel=(x,y)=>Array.from(ctx.getImageData(Math.round(x*d),Math.round(y*d),1,1).data);
assert(pixel(405,305)[0]===0,'SVG лежит над защищённой картинкой');const outside=pixel(445,345);
tool('eraser');app.settings.eraser.original=true;app.settings.eraser.width=24;
const start=performance.now();pointer('pointerdown',405,305);pointer('pointermove',405,305);await test.frames(2);
const latency=performance.now()-start;assert(pixel(405,305)[0]===207&&pixel(405,305)[1]===145,'SVG исчезает до отрыва, под ним видна картинка');
for(let i=0;i<8;i++){pointer('pointermove',405,305);await test.frames();assert(pixel(405,305)[0]===207,'следующие отсчёты не возвращают старые пиксели');}
pointer('pointerup',405,305);await test.idle();assert(String(pixel(445,345))===String(outside),'область вне ластика не меняется');
test.key('KeyZ');await test.idle();assert(pixel(405,305)[0]===0,'Undo восстанавливает исходный контур поверх картинки');
test.key('KeyY');await test.idle();assert(pixel(405,305)[0]===207,'Redo снова показывает защищённую картинку');
await test.shot('svg-eraser');
// Сложный SVG, оставшийся единым объектом, использует тот же быстрый путь.
await native.testFiles('prepare',{name:'градиент.svg',text:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760"><defs><linearGradient id="g"><stop stop-color="black"/><stop offset="1" stop-color="#333"/></linearGradient></defs><rect x="100" y="100" width="1000" height="600" fill="url(#g)"/></svg>'});
await native.testFiles('choices',{choices:{opens:['градиент.svg'],unsaved:['discard']}});await app.files.open();origin();await test.idle();
assert(last().kind==='svg'&&pixel(400,300)[0]<100,'сложный SVG остаётся единым объектом');
pointer('pointerdown',400,300);await test.frames(2);assert(pixel(400,300)[0]===255,'единый SVG стирается до отрыва пера');pointer('pointerup',400,300);await test.idle();
return {ok:true,svgLatencyMs:latency};
