// Компактный синтаксис SVG не меняет квадратичные сегменты и данные для редактирования.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopsToSvg, encodeSvg, nativeSvgData } from '../src/files/codec.ts';
import { makeStroke } from '../src/core/types.ts';
import { maskedSvg } from '../src/core/svg-mask.ts';

// Независимый разбор в абсолютные квадратичные сегменты, включая отражение T и повтор команд.
function segments(path:string):number[][] {
  const tokens=path.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g)!;
  let i=0,cmd='',x=0,y=0,cx=0,cy=0;const out:number[][]=[];
  const value=()=>Number(tokens[i++]);
  while(i<tokens.length){
    if(/^[a-zA-Z]$/.test(tokens[i]))cmd=tokens[i++];
    const lower=cmd.toLowerCase(),relative=lower===cmd;
    if(lower==='z')continue;
    if(lower==='m'){x=value();y=value();cx=x;cy=y;continue;}
    assert.ok(lower==='q'||lower==='t');
    const a=lower==='q'?value()+(relative?x:0):2*x-cx,b=lower==='q'?value()+(relative?y:0):2*y-cy;
    const u=value()+(relative?x:0),v=value()+(relative?y:0);out.push([x,y,a,b,u,v]);x=u;y=v;cx=a;cy=b;
  }
  return out;
}
function legacy(p:Float32Array):string {
  const n=p.length/2,num=(x:number)=>String(Math.round(x*1000)/1000);
  let out=`M${num((p.at(-2)!+p[0])/2)} ${num((p.at(-1)!+p[1])/2)}`;
  for(let i=0;i<n;i++){const j=(i+1)%n;out+=`${i%16===0?`Q${num(p[2*i])} ${num(p[2*i+1])} `:'T'}${num((p[2*i]+p[2*j])/2)} ${num((p[2*i+1]+p[2*j+1])/2)}`;}
  return out+'Z';
}
test('компактный путь: относительные координаты, знак вместо пробела и повтор команд сохраняют каждый сегмент',()=>{
  for(const offset of [0,.0001,-.0001,4000,-4000]){
    const p=Float32Array.from(Array.from({length:257},(_,i)=>[offset+100*Math.cos(i*.13),offset-50*Math.sin(i*.07)]).flat());
    const compact=loopsToSvg([p]),previous=legacy(p),a=segments(compact),b=segments(previous);
    assert.equal(a.length,b.length);
    a.forEach((row,i)=>row.forEach((value,k)=>assert.ok(Math.abs(value-b[i][k])<1e-7)));
    assert.ok(compact.length<previous.length);
  }
});
test('служебные данные сжимаются и для собственной ручки, точность нажима не теряется',async()=>{
  const objects=Array.from({length:90},(_,i)=>makeStroke(i+1,i+1,i*20,0,Float32Array.of(0,0,.7,10,20,2.5,25,0,1.3),'#315ca8'));
  const data={objects,grid:{enabled:false,step:24},view:{scale:1,rotSteps:0,x:0,y:0}};
  const svg=await encodeSvg(data);assert.match(svg,/deflate-base64/);assert.deepEqual(await nativeSvgData(svg),data);
});
test('качество SVG: ошибка округления ограничена и не накапливается на длинном контуре',()=>{
  const p=Float32Array.from(Array.from({length:4097},(_,i)=>[i*.137+Math.sin(i*.17)*9,Math.cos(i*.11)*25]).flat());
  const lengths=[];
  for(const precision of [3,2,1]){
    const path=loopsToSvg([p],precision);lengths.push(path.length);
    if(precision===3)continue;
    const decoded=segments(path),eps=.5/10**precision+1e-6;
    assert.equal(decoded.length,p.length/2);
    decoded.forEach((s,i)=>{
      const j=(i+1)%(p.length/2);
      assert.ok(Math.abs(s[2]-p[i*2])<=eps&&Math.abs(s[3]-p[i*2+1])<=eps,'контрольная точка');
      assert.ok(Math.abs(s[4]-(p[i*2]+p[j*2])/2)<=eps&&Math.abs(s[5]-(p[i*2+1]+p[j*2+1])/2)<=eps,'конец сегмента');
    });
  }
  assert.ok(lengths[0]>lengths[1]&&lengths[1]>lengths[2]);
});
test('качество SVG: точные данные пера восстанавливаются и из компактного экспорта',async()=>{
  const data={objects:[makeStroke(1,1,20,40,Float32Array.of(0,0,1.77,25.123,35.666,2.34,50,10,1.24),'#315ca8')],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
  assert.deepEqual(await nativeSvgData(await encodeSvg(data,true,1)),data);
  assert.equal(await nativeSvgData(await encodeSvg(data,false,1)),null);
});
test('маски: одинаковые матрицы пишутся один раз, все капсулы и радиусы сохраняются',()=>{
  const m=[.5,0,0,.75,100,200],marks=[[10,10,10,10,12,...m],[10,10,20,20,12,...m],[30,30,40,40,6,...m],[40,40,50,50,6]];
  const svg=maskedSvg('<path d="M0 0H100V100H0Z"/>',100,100,marks);
  assert.equal(svg.split('transform="matrix(').length-1,2);
  assert.match(svg,/M10 10L10 10M10 10L20 20/);assert.match(svg,/stroke-width="24"/);assert.match(svg,/stroke-width="12"/);
});
