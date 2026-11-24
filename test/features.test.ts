// Геометрия группы, параметры фигур, штрихи и защита предпросмотра пера.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStroke, makeImage, makeSvg } from '../src/core/types.ts';
import { transformObject, rotation } from '../src/core/transform.ts';
import { shapeData, shapePoints, dashedPoints, rebuildShape, arrowHeads, strokeLoops, arrowHeadStyle, withArrowHeadCount } from '../src/core/shapes.ts';
import { encodeSvg, nativeSvgData } from '../src/files/codec.ts';
import { mergeSettings } from '../src/core/settings.ts';
import { safePredictions } from '../src/core/prediction.ts';

test('оформление стрелок из старых настроек переносится в два независимых режима',()=>{
  const old={headLength:8,headWidth:6,headRound:0,headType:'filled' as const};
  const settings=mergeSettings({version:11,arrow:{...old,both:true}});
  assert.deepEqual(arrowHeadStyle(settings.arrow),old);
  assert.deepEqual(settings.arrow.doubleHead,old);
  assert.deepEqual(arrowHeadStyle(settings.coordinates),old);
  const double={headLength:3,headWidth:2,headRound:.75,headType:'open' as const};
  Object.assign(settings.arrow.doubleHead,double);
  const saved=mergeSettings(JSON.parse(JSON.stringify(settings)));
  assert.deepEqual(arrowHeadStyle(saved.arrow),old);
  assert.deepEqual(saved.arrow.doubleHead,double);
  assert.equal(saved.arrow.both,true);
});

test('координаты наследуют головку одиночной стрелки из профиля v12 и сохраняют собственное оформление',()=>{
  const single={headLength:9,headWidth:4,headRound:0,headType:'filled' as const};
  const double={headLength:3,headWidth:2,headRound:.75,headType:'open' as const};
  const settings=mergeSettings({version:12,arrow:{...single,both:true,doubleHead:double},coordinates:{color:'#946bb0'}});
  assert.deepEqual(arrowHeadStyle(settings.coordinates),single);
  assert.equal(settings.coordinates.color,'#946bb0');
  const axes={headLength:7,headWidth:5,headRound:.25,headType:'open' as const};
  Object.assign(settings.coordinates,axes);
  const saved=mergeSettings(JSON.parse(JSON.stringify(settings)));
  assert.deepEqual(arrowHeadStyle(saved.coordinates),axes);
  assert.deepEqual(arrowHeadStyle(saved.arrow),single);
  assert.deepEqual(saved.arrow.doubleHead,double);
});

test('SVG и смена числа головок сохраняют собственное оформление старой стрелки',async()=>{
  const single={...shapeData('arrow'),length:200,headLength:9,headType:'filled' as const};
  delete single.headRound; // Старый контур со своим способом скругления.
  delete single.headGridStep;
  const preset={headType:'open' as const,headLength:4,headWidth:2,headRound:0};
  const double=withArrowHeadCount(single,true,preset);
  assert.deepEqual(arrowHeadStyle(double),preset);
  const hidden={...double,kind:'line' as const,savedHeadStyle:true};
  const obj={...makeStroke(1,1,0,0,shapePoints(hidden,3),'#315ca8'),shape:hidden};
  const svg=await encodeSvg({objects:[obj],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}});
  const saved=(await nativeSvgData(svg))?.objects[0];
  assert.ok(saved?.kind==='stroke'&&saved.shape?.savedHeadStyle);
  const restored=withArrowHeadCount(saved.shape,false,preset);
  assert.equal(restored.headGridStep,undefined);
  const resized=rebuildShape(saved,{...restored,length:24});
  assert.ok(Math.abs(24-arrowHeads(resized)[0][0]-24*.65)<.0001);
  assert.deepEqual(arrowHeadStyle(restored),arrowHeadStyle(single));
  assert.deepEqual(arrowHeadStyle(withArrowHeadCount(restored,true,single)),preset);
});

test('размер: толщина пера сохраняется, маркер масштабируется, отражение не теряет нажим',()=>{
 const p=makeStroke(1,1,10,20,Float32Array.of(0,0,2,30,40,4),'#315ca8');
 const m={a:-2,b:0,c:0,d:2,e:0,f:0};
 const kept=transformObject(p,m,true);assert.equal(kept.kind,'stroke');if(kept.kind!=='stroke')return;
 assert.deepEqual([...kept.pts],[0,0,2,-60,80,4]);assert.equal(kept.ox,-20);
 const marker=transformObject({...p,marker:true,opacity:.5},m,true);if(marker.kind==='stroke'){assert.equal(marker.matrix?.a,-2);assert.equal(marker.matrix?.d,2);assert.equal(marker.bbox.maxY-marker.bbox.minY,2*(p.bbox.maxY-p.bbox.minY));}
 const twice=transformObject(transformObject(p,rotation({x:0,y:0},Math.PI/2),true),rotation({x:0,y:0},-Math.PI/2),true);
 assert.ok(Math.abs(twice.ox-p.ox)<1e-6);
});
test('штрихи: длина и промежуток не зависят от количества отсчётов',()=>{
 const parts=dashedPoints(Float32Array.of(0,0,2,100,0,2),{length:10,gap:10,round:true});
 assert.equal(parts.length,5);assert.deepEqual([...parts[1]],[20,0,2,30,0,2]);
});
test('синусоида и парабола: целые периоды, точные концы, перенос параметров',()=>{
 const s={...shapeData('sine'),period:120,cycles:2,amplitude:24};const p=shapePoints(s,2);
 assert.ok(Math.abs(p.at(-2)!)<1e-5);assert.equal(p.at(-3),240);
 const q=shapePoints({...shapeData('parabola'),length:200,height:40,bend:-90},3);
 assert.equal(q.at(-3),200);assert.equal(q.at(-2),40);
 const o=rebuildShape({...makeStroke(1,1,0,0,p,'#315ca8'),shape:s});
 const t=transformObject(o,{a:2,b:0,c:0,d:1,e:0,f:0},true);
 assert.equal(t.kind,'stroke');if(t.kind==='stroke'){assert.equal(t.pts.at(-3),480);assert.equal(t.shape?.cycles,2);}
});
test('синусоида: произвольная часть периода до точного конца сохраняется в SVG',async()=>{
 for(const cycles of [0,.03,.25,.7,1.73,2]){
  const shape={...shapeData('sine'),period:144,amplitude:24,cycles},pts=shapePoints(shape,3);
  assert.ok(Math.abs(pts.at(-3)!-144*cycles)<.0001);
  assert.ok(Math.abs(pts.at(-2)!+24*Math.sin(cycles*Math.PI*2))<.0001);
  const o=rebuildShape({...makeStroke(1,1,20,30,pts,'#315ca8'),shape});
  const data={objects:[o],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
  assert.deepEqual(await nativeSvgData(await encodeSvg(data)),data);
 }
});
test('короткие стрелки: головка уменьшается пропорционально, скругление не выходит за треугольник',()=>{
 for(const both of [false,true]){
  const shape={...shapeData('arrow'),length:20,headLength:10,headWidth:8,headType:'filled' as const,both};
  const o=rebuildShape({...makeStroke(1,1,0,0,shapePoints(shape,8),'#315ca8'),shape});
  for(const p of arrowHeads(o)){
   const length=Math.hypot(p[3]-(p[0]+p[6])/2,p[4]-(p[1]+p[7])/2),width=Math.hypot(p[6]-p[0],p[7]-p[1]);
   assert.ok(length<80);assert.ok(width<64);assert.ok(Math.abs(width/length-.8)<1e-5);
   assert.ok(length<=20*(both?.45:.8));
  }
  const head=strokeLoops(o).at(-1)!;
  for(let i=0;i<head.length;i+=2){assert.ok(head[i]>=0&&head[i]<=20);assert.ok(Math.abs(head[i+1])<=8);}
 }
});
test('наконечники достигают половины выбранных длины и ширины на клетке, полного размера на двух',()=>{
  for(const step of [24,30,48])for(const cells of [.5,1,1.5,2,3]){
    for(const headType of ['open','filled'] as const)for(const [both,headAtStart] of [[false,false],[false,true],[true,false]]){
      const shape={...shapeData('arrow',step),length:cells*step,headType,both,headAtStart};
      const stroke={...makeStroke(1,1,0,0,shapePoints(shape,2),'#315ca8'),shape};
      const scale=Math.min(1,cells/2);
      const heads=arrowHeads(stroke);
      assert.equal(heads.length,both?2:1);
      for(const h of heads){
        assert.equal(Math.abs(h[3]-h[0]),2*shape.headLength*scale);
        assert.equal(Math.abs(h[7]-h[1]),2*shape.headWidth*scale);
      }
    }
  }
});
test('первая головка на линии запоминает шаг клетки при назначении, смене сетки и открытии SVG',async()=>{
  const line={...shapeData('line'),length:36};
  const shape=withArrowHeadCount(line,false,line,36);
  const arrow=rebuildShape({...makeStroke(1,1,0,0,shapePoints(shape,2),'#315ca8'),shape});
  const svg=await encodeSvg({objects:[arrow],grid:{enabled:false,step:12},view:{x:0,y:0,scale:3,rotSteps:0}});
  const copy=(await nativeSvgData(svg))?.objects[0];
  assert.ok(copy?.kind==='stroke'&&copy.shape);
  assert.equal(withArrowHeadCount(copy.shape,true,line,12).headGridStep,36);
  assert.deepEqual(arrowHeads(copy),arrowHeads(arrow));
  assert.equal(arrowHeads(copy)[0][0],31);
});
test('скругление головки: ноль сохраняет вершины, максимум заметно смягчает их; старые SVG поддерживаются',()=>{
 const shape={...shapeData('arrow'),length:200,headLength:8,headWidth:6,headType:'filled' as const};
 const make=(headRound:number|undefined)=>rebuildShape({...makeStroke(1,1,0,0,shapePoints(shape,8),'#315ca8'),shape:{...shape,headRound}});
 const sharp=strokeLoops(make(0)).at(-1)!,rounded=strokeLoops(make(1)).at(-1)!;
 const maxX=(p:Float32Array)=>Math.max(...Array.from(p).filter((_,i)=>i%2===0));
 assert.equal(maxX(sharp),200);assert.ok(maxX(rounded)<195);
 assert.equal(strokeLoops(make(undefined)).at(-1)!.length,18);
 const short=arrowHeads(make(0))[0];assert.equal(short[3],200);
 const growing={...shape,length:90};const o=rebuildShape({...makeStroke(1,1,0,0,shapePoints(growing,8),'#315ca8'),shape:growing});
 const h=arrowHeads(o)[0];assert.ok(90-h[0]<64,'при длине 90 головка ещё не достигла полного размера 64');
});
test('SVG: фигура, штрихи, маркер и повёрнутая картинка переживают сохранение',async()=>{
 const shape=shapeData('arrow');shape.length=100;shape.headType='filled';shape.both=true;
 const o=rebuildShape({...makeStroke(1,1,20,30,shapePoints(shape,4),'#315ca8'),shape,dash:{length:16,gap:12,round:true}});
 const marker={...makeStroke(2,2,0,0,Float32Array.of(0,0,48,200,20,48),'#79ad65'),marker:true,opacity:.5};
 const image=transformObject(makeImage(3,3,40,50,100,200,'data:image/png;base64,AAAA'),rotation({x:0,y:0},Math.PI/2),false);
 const data={objects:[o,marker,image],grid:{enabled:true,step:24,save:true},view:{x:0,y:0,scale:1,rotSteps:0}};
 const svg=await encodeSvg(data);assert.match(svg,/mix-blend-mode:multiply/);assert.match(svg,/data-phaint-grid/);
 assert.deepEqual(await nativeSvgData(svg),data);
 assert.doesNotMatch(await encodeSvg({...data,grid:{...data.grid,enabled:false}}),/data-phaint-grid/);
});
test('прогноз: выбросы и устаревшие точки не попадают в предпросмотр',()=>{
 const last={x:10,y:10,t:100,pressure:.5},previous={...last,x:0,t:90};
 assert.deepEqual(safePredictions(last,previous,[{...last,x:15,t:110},{...last,x:1000,t:120}]),[{...last,x:15,t:110}]);
 assert.deepEqual(safePredictions(last,previous,[{...last,t:90}]),[]);
 assert.equal(mergeSettings({version:6,input:{predict:true}}).input.predict,false);
 assert.equal(mergeSettings({version:8,input:{predict:true}}).input.predict,true);
});

test('SVG: компактная metadata восстанавливает сотни контуров и базовый масштаб',async()=>{
 const bounds={minX:0,minY:0,maxX:10,maxY:10};
 const objects=Array.from({length:300},(_,i)=>({kind:'vector' as const,id:i+1,z:i+1,ox:i*12,oy:0,
   matrix:{a:1,b:0,c:0,d:1,e:0,f:0},bounds,bbox:{...bounds,minX:i*12,maxX:i*12+10},
   d:'M0 0H10V10H0Z',fill:'rgb(0, 0, 0)',stroke:'none',strokeWidth:1,fillRule:'nonzero' as const,
   linecap:'butt' as const,linejoin:'miter' as const,opacity:1}));
 const data={objects,baseScale:.35,grid:{enabled:false,step:24},view:{x:200,y:100,scale:.35,rotSteps:0}};
 const svg=await encodeSvg(data);assert.match(svg,/deflate-base64/);
 assert.deepEqual(await nativeSvgData(svg),data);
 assert.equal(await nativeSvgData(svg.replace('M0 0H10V10H0Z','M0 0H20V10H0Z')),null);
});


test('SVG: id вложенного исходника не подменяет новый редактируемый контур',async()=>{
 const source=makeSvg(1,1,0,0,100,100,'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path id="phaint-2" d="M0 0H90V90Z"/></svg>');
 const bounds={minX:0,minY:0,maxX:10,maxY:10};
 const vector={kind:'vector' as const,id:2,z:2,ox:10,oy:20,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},bounds,
   bbox:{minX:10,minY:20,maxX:20,maxY:30},d:'M0 0H10V10Z',fill:'#000000',stroke:'none',strokeWidth:0,
   fillRule:'nonzero' as const,linecap:'butt' as const,linejoin:'miter' as const,opacity:1};
 const data={objects:[source,vector],grid:{enabled:true,step:24,save:true},view:{x:0,y:0,scale:1,rotSteps:0}};
 const svg=await encodeSvg(data);assert.match(svg,/id="phaint1-2"/);assert.match(svg,/id="phaint1-grid"/);
 assert.deepEqual(await nativeSvgData(svg),data);
});
