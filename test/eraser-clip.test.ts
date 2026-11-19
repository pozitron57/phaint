// Экспорт ластика: булева разность, отражения, большие координаты и точные рабочие данные.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eraserClipPolygons,vectorErasedSvg} from '../src/files/eraser-clip.ts';
import {matApply,matInvert,type BBox} from '../src/core/geom.ts';
import {encodeSvg,nativeSvgData} from '../src/files/codec.ts';
import {makeSvg} from '../src/core/types.ts';
function inside(polygons:number[][],x:number,y:number):boolean {
  let result=false;
  for(const p of polygons)for(let i=0,j=p.length-2;i<p.length;j=i,i+=2){
    const ax=p[i],ay=p[i+1],bx=p[j],by=p[j+1];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)result=!result;
  }
  return result;
}
function distance(mark:number[],x:number,y:number):number {
  const [ax,ay,bx,by,r,a=1,b=0,c=0,d=1,e=0,f=0]=mark;
  const p=matApply(matInvert({a,b,c,d,e,f}),x,y),dx=bx-ax,dy=by-ay;
  const t=Math.max(0,Math.min(1,((p.x-ax)*dx+(p.y-ay)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p.x-ax-t*dx,p.y-ay-t*dy)-r;
}
function verify(bounds:BBox,marks:number[][]):void {
  const result=eraserClipPolygons(bounds,marks),w=bounds.maxX-bounds.minX,h=bounds.maxY-bounds.minY;
  for(let x=.37;x<w;x+=1.17)for(let y=.63;y<h;y+=1.29){
    const d=marks.map(m=>distance(m,x+bounds.minX,y+bounds.minY));
    if(d.some(v=>Math.abs(v)<.02))continue;
    assert.equal(inside(result,x,y),d.every(v=>v>0),`точка ${x}, ${y}, расстояния ${d}`);
  }
}
test('векторный ластик: перекрытия не возвращают стёртое, островки сохраняются',()=>{
  const bounds={minX:0,minY:0,maxX:100,maxY:100};
  verify(bounds,[[20,20,70,70,12],[30,60,70,20,14],[35,35,35,35,16],[45,45,45,45,12]]);
  const ring=[[30,30,70,30,5],[70,30,70,70,5],[70,70,30,70,5],[30,70,30,30,5]];
  verify(bounds,ring);const polygons=eraserClipPolygons(bounds,ring);
  assert.equal(inside(polygons,50,50),true);assert.equal(inside(polygons,30,50),false);
});
test('векторный ластик: поворот, отражение, сдвиг осей и перенос следов',()=>{
  const marks=[[10,10,30,30,6,1,.5,.2,1,30,15],[10,15,35,15,9,-1,.1,.4,1.5,75,30],[1000,2000,1025,2000,7,1,0,0,1,-985,-1960]];
  verify({minX:0,minY:0,maxX:100,maxY:100},marks);
});
test('векторный ластик: полное удаление, следы за рамкой и большие координаты',()=>{
  const bounds={minX:0,minY:0,maxX:80,maxY:60};
  assert.deepEqual(eraserClipPolygons(bounds,[[40,30,40,30,1e6]]),[]);
  assert.equal(vectorErasedSvg('<rect/>',80,60,[[40,30,40,30,1e6]]),'');
  assert.equal(inside(eraserClipPolygons(bounds,[[1e9,1e9,1e9,1e9,1e6]]),40,30),true);
  verify({minX:1e9,minY:-2e9,maxX:1e9+100,maxY:-2e9+80},[[1e9+10,-2e9+20,1e9+70,-2e9+65,8]]);
  // Гигантский круг режет небольшую рамку почти прямой: невидимые дуги не дробятся.
  verify(bounds,[[1e6+40,30,1e6+40,30,1e6]]);
});
test('PDF использует clipPath, рабочий SVG сохраняет прежнюю маску и редактирование',async()=>{
  const source='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path id="mask" fill="blue" d="M0 0H100V100H0Z"/></svg>';
  const o={...makeSvg(1,1,20,30,100,100,source),erasures:[[20,20,60,60,8]]};
  const data={objects:[o],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
  const normal=await encodeSvg(data),pdf=await encodeSvg({...data,exportOptions:{quality:'maximum',editable:false,vectorMasks:true}},false);
  assert.match(normal,/<mask /);assert.match(pdf,/<clipPath /);assert.doesNotMatch(pdf,/<mask |<image /);
  assert.deepEqual(await nativeSvgData(normal),data);assert.equal(await encodeSvg(data),normal);
  const collision=vectorErasedSvg(source,100,100,o.erasures,'mask');assert.match(collision,/id="mask-outer"/);
});
