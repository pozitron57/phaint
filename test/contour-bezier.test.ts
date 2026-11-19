// Геометрическая точность Безье, локальная защита и неизменность рабочих данных.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discLoop,segmentOutline,type Loops} from '../src/core/outline.ts';
import {strokeLoops} from '../src/core/shapes.ts';
import {makeStroke} from '../src/core/types.ts';
import {contourCurves,compactContours} from '../src/files/contour-export.ts';
import {curvePoint,fitContour,curvesSvg,type Curve} from '../src/files/contour-fit.ts';
import {widthLimit,protectGaps} from '../src/files/contour-limits.ts';
import {contourDetailLoss} from '../src/files/export-options.ts';
import {loopsToSvg,encodeSvg,nativeSvgData} from '../src/files/codec.ts';
type Point={x:number;y:number};
function reference(loops:Loops):Point[][] {
  return loops.map(loop=>{
    const out:Point[]=[];
    for(let i=0;i<loop.length;i+=2){
      const prev=(i+loop.length-2)%loop.length,next=(i+2)%loop.length,ax=(loop[prev]+loop[i])/2,ay=(loop[prev+1]+loop[i+1])/2,bx=(loop[next]+loop[i])/2,by=(loop[next+1]+loop[i+1])/2;
      for(let k=0;k<24;k++){const t=k/24,s=1-t;out.push({x:s*s*ax+2*s*t*loop[i]+t*t*bx,y:s*s*ay+2*s*t*loop[i+1]+t*t*by});}
    }
    return out;
  });
}
function samples(curves:Curve[][]):Point[][] {
  return curves.map(loop=>loop.flatMap(c=>{
    const length=Math.hypot(c.p1.x-c.p0.x,c.p1.y-c.p0.y)+Math.hypot(c.p2.x-c.p1.x,c.p2.y-c.p1.y)+Math.hypot(c.p3.x-c.p2.x,c.p3.y-c.p2.y),n=Math.max(4,Math.ceil(length/.08));
    return Array.from({length:n},(_,i)=>curvePoint(c,i/n));
  }));
}
function distance(p:Point,paths:Point[][]):number {
  let best=Infinity;
  for(const path of paths)for(let i=0;i<path.length;i++){
    const a=path[i],b=path[(i+1)%path.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    best=Math.min(best,(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2);
  }
  return Math.sqrt(best);
}
function bothWays(a:Point[][],b:Point[][],tolerance:(p:Point)=>number):void {
  for(const [source,target] of [[a,b],[b,a]])for(const path of source)for(const p of path){const d=distance(p,target);assert.ok(d<=tolerance(p),`ошибка ${d} в (${p.x}, ${p.y}), допуск ${tolerance(p)}`);}
}
test('Безье: сокращает сложный контур, ограничивая ошибку с обеих сторон',()=>{
  const loop=Float32Array.from(Array.from({length:120},(_,i)=>{const a=i*Math.PI/60;return [Math.cos(a)*50,Math.sin(a)*25+3*Math.sin(a*7)];}).flat()),loops=[loop];
  for(const tolerance of [.04,.3,3]){
    const curves=contourCurves(loops,tolerance),path=curves.map(c=>curvesSvg(c,2)).join('');
    assert.match(path,/[CQcq]/);assert.ok(path.length<loopsToSvg(loops,3).length);
    bothWays(reference(loops),samples(curves),()=>tolerance+.002);
  }
});
test('тонкий кончик защищён локально, толстая часть сохраняет большой допуск',()=>{
  const pts=Float32Array.from(Array.from({length:61},(_,i)=>[i*3,Math.sin(i/8)*12,i<45?10:10-(i-45)*9.85/15]).flat()),stroke=makeStroke(1,1,0,0,pts,'#000');
  const loops=strokeLoops(stroke),curves=contourCurves(loops,3,pts),limit=widthLimit(pts,3);
  assert.ok(Math.max(...curves.flat().map(c=>c.tolerance))>.4,'толстая часть не ограничена шириной кончика');
  assert.ok(limit(180,12)<.016,'толщина кончика ограничивает его местную ошибку');
  bothWays(reference(loops),samples(curves),p=>limit(p.x,p.y)+.004);
  assert.ok(curvesSvg(curves[0],0)!.includes('.'),'округление до целых не разрушает тонкие места');
});
test('усиленное сжатие удваивает местный допуск, сохраняя защиту тонкого кончика',()=>{
  const pts=Float32Array.from(Array.from({length:61},(_,i)=>[i*3,Math.sin(i/8)*12,i<45?10:10-(i-45)*9.85/15]).flat()),stroke=makeStroke(1,1,0,0,pts,'#000');
  const limit=widthLimit(pts,3,true),curves=contourCurves(strokeLoops(stroke),3,pts,true);
  assert.ok(limit(180,12)<.031);assert.ok(limit(0,0)<=2);
  bothWays(reference(strokeLoops(stroke)),samples(curves),p=>limit(p.x,p.y)+.004);
  assert.equal(widthLimit(pts,.04,true)(0,0),.04,'общая погрешность всё равно ограничивает ошибку');
  assert.equal(compactContours(strokeLoops(stroke),0,3,loopsToSvg,pts,true),loopsToSvg(strokeLoops(stroke),3));
});
test('узкое кольцо и близкие независимые контуры не слипаются при допуске 3',()=>{
  const outer=discLoop(0,0,10),inner=discLoop(0,0,9.85),reverse=Float32Array.from(Array.from({length:inner.length/2},(_,i)=>[inner[inner.length-2-i*2],inner[inner.length-1-i*2]]).flat());
  const loops=[outer,reverse],curves=contourCurves(loops,3);
  assert.equal(curves.length,2,'сохранена внутренняя граница');
  assert.ok(Math.max(...curves.flat().map(c=>c.tolerance))<.04);
  bothWays(reference(loops),samples(curves),()=>.035);
  const protectedPoints=protectGaps([[0,0,30,0,30,10,0,10],[30.1,0,60,0,60,10,30.1,10]],()=>3);
  assert.ok(protectedPoints[0][1].tolerance<.021,'просвет между разными петлями тоже защищён');
});
test('край шкалы уменьшает запись и допускает видимые, но ограниченные изменения тонкого штриха',()=>{
  const pts=Float32Array.from(Array.from({length:100},(_,i)=>[i*2,Math.sin(i/9)*12+.4*Math.sin(i*2),1.5+.5*Math.sin(i/6)]).flat());
  const loops=strokeLoops(makeStroke(1,1,0,0,pts,'#000')),before=compactContours(loops,3,0,loopsToSvg,pts,true);
  const curves=contourCurves(loops,14,pts,true),after=compactContours(loops,14,0,loopsToSvg,pts,true);
  assert.ok(after.length<compactContours(loops,12,0,loopsToSvg,pts,true).length,'новый край сильнее прежнего');
  assert.ok(after.length<before.length*.75,'верх шкалы действительно уменьшает сложность');
  const original=reference(loops),changed=samples(curves),limit=widthLimit(pts,14,true,contourDetailLoss(14));
  bothWays(original,changed,p=>limit(p.x,p.y)+.006);
  assert.ok(changed.flat().some(p=>distance(p,original)>.15),'допускается потеря мелких деталей');
  assert.deepEqual(contourCurves(loops,3,pts,true),contourCurves(loops,3,pts,true,0),'прежняя граница неизменна');
});
test('край шкалы сохраняет тонкий конец, отверстие и разделение близких контуров',()=>{
  const inner=discLoop(0,0,9.85),reverse=Float32Array.from(Array.from({length:inner.length/2},(_,i)=>[inner[inner.length-2-i*2],inner[inner.length-1-i*2]]).flat());
  const loops=[discLoop(0,0,10),reverse],curves=contourCurves(loops,14);
  assert.equal(curves.length,2);bothWays(reference(loops),samples(curves),()=>.07);
  const protectedPoints=protectGaps([[0,0,30,0,30,10,0,10],[30.1,0,60,0,60,10,30.1,10]],()=>14,1.1);
  assert.ok(protectedPoints[0][1].tolerance<.048,'даже два смещённых края не закрывают весь просвет');
  const pts=Float32Array.from(Array.from({length:61},(_,i)=>[i*3,Math.sin(i/8)*12,i<45?10:10-(i-45)*9.85/15]).flat());
  const stroke=strokeLoops(makeStroke(1,1,0,0,pts,'#000')),limit=widthLimit(pts,14,true,1.1);
  assert.ok(limit(180,12)<.089);bothWays(reference(stroke),samples(contourCurves(stroke,14,pts,true)),p=>limit(p.x,p.y)+.006);
});
test('степень потерь экспорта не зависит от масштаба матрицы объекта',async()=>{
  const pts=Float32Array.from(Array.from({length:40},(_,i)=>[i*2,Math.sin(i/5)*10,2]).flat());
  const stroke=makeStroke(1,1,0,0,pts,'#315ca8'),loops=strokeLoops(stroke);
  for(const scale of [.1,10])for(const tolerance of [.3,3,12]){
    const data={objects:[{...stroke,matrix:{a:scale,b:0,c:0,d:scale,e:0,f:0}}],grid:{enabled:false,step:30},view:{x:0,y:0,scale:1,rotSteps:0}};
    const svg=await encodeSvg({...data,exportOptions:{quality:'maximum',tolerance,compactThin:true,editable:false}},false,0);
    const expected=compactContours(loops,tolerance/scale,Math.max(0,Math.ceil(Math.log10(scale))),loopsToSvg,pts,true,contourDetailLoss(tolerance));
    assert.equal(/<path fill="[^"]+" d="([^"]+)"/.exec(svg)?.[1],expected,`масштаб ${scale}, допуск ${tolerance}`);
  }
});
test('острые углы остаются на месте, прямые не заменяются выпуклыми дугами',()=>{
  const loops=segmentOutline(Float32Array.of(0,0,4,100,0,4),false,false),curves=contourCurves(loops,3);
  assert.equal(curves.length,1);assert.ok(curves[0].every(c=>c.line));
  assert.equal(curves[0].length,4);
  assert.deepEqual(curves[0].map(c=>[c.p0.x,c.p0.y]).sort(),[[0,-2],[0,2],[100,-2],[100,2]].sort());
});
test('проверка между отсчётами не разрешает кубической дуге выброс за тонкую ломаную',()=>{
  const points=[{x:0,y:0},{x:20,y:0},{x:20.05,y:.01},{x:20.1,y:10},{x:40,y:10},{x:40,y:14},{x:0,y:14}].map(p=>({...p,tolerance:.01}));
  const curves=fitContour(points);bothWays([points],samples([curves]),()=>.012);
});
test('нули, короткие петли и большие координаты экспортируются без NaN и накопления ошибки',()=>{
  const loops=[discLoop(1e6,-2e6,.05)];
  assert.equal(compactContours(loops,0,3,loopsToSvg),loopsToSvg(loops,3));
  const result=compactContours(loops,.5,0,loopsToSvg);
  assert.doesNotMatch(result,/NaN|Infinity|undefined/);assert.ok(result.length>0);
  assert.equal(compactContours([],3,0,loopsToSvg),'');
});
test('Безье экспортной копии не меняют нажим, фигуры и обычное сохранение',async()=>{
  const stroke=makeStroke(1,1,20,30,Float32Array.from(Array.from({length:80},(_,i)=>[i,10*Math.sin(i/9),.2+3*Math.sin(i/25)**2]).flat()),'#315ca8');
  const data={objects:[stroke],grid:{enabled:false,step:30},view:{x:0,y:0,scale:1,rotSteps:0}},before=await encodeSvg(data);
  for(const tolerance of [3,12]){
    const exported=await encodeSvg({...data,exportOptions:{quality:'compact',editable:true,tolerance,compactThin:true}},true,1);
    assert.deepEqual(await nativeSvgData(exported),data);assert.equal(await encodeSvg(data),before);
  }
  const transformed={...stroke,matrix:{a:20,b:0,c:0,d:20,e:0,f:0}};
  const scaled=await encodeSvg({...data,objects:[transformed],exportOptions:{quality:'compact',editable:false,tolerance:.1}},false,1);
  assert.match(scaled,/matrix\(20 0 0 20/);assert.doesNotMatch(scaled,/NaN|Infinity/);
});
