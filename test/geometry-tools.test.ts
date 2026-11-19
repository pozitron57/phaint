// Привязка без потери угла, ровный торец стрелки и математическая форма изотермы.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapPoint, snapSegment } from '../src/core/snap.ts';
import { shapeData, shapePoints, rebuildShape, strokeLoops, arrowHeads } from '../src/core/shapes.ts';
import { makeStroke } from '../src/core/types.ts';
import { transformObject } from '../src/core/transform.ts';
import { encodeSvg, nativeSvgData } from '../src/files/codec.ts';

test('Alt меняет только конец; зафиксированное начало и угол Ctrl сохраняются',()=>{
  const start={x:13,y:-7},end={x:79,y:39};
  assert.deepEqual(snapPoint(start,24),{x:24,y:0});
  assert.deepEqual(snapSegment(start,end,24,true,false),{start,end:{x:72,y:48}});
  assert.deepEqual(snapSegment(start,end,24,false,false),{start,end});
  const anchor={x:24,y:0};
  for(const grid of [true,false,true]){
    assert.deepEqual(snapSegment(start,end,24,grid,false,anchor).start,anchor);
    assert.deepEqual(snapSegment(start,end,24,grid,true,anchor).start,anchor);
  }
  assert.deepEqual(snapSegment(start,end,24,false,false,anchor),{start:anchor,end});
  for(let degree=-180;degree<=180;degree+=2){
    const angle=degree*Math.PI/180,p={x:start.x+107*Math.cos(angle),y:start.y+107*Math.sin(angle)};
    const free=snapSegment(start,p,24,false,true),grid=snapSegment(start,p,24,true,true);
    const a=Math.atan2(free.end.y-free.start.y,free.end.x-free.start.x),b=Math.atan2(grid.end.y-grid.start.y,grid.end.x-grid.start.x);
    assert.ok(Math.abs(Math.sin(a-b))<1e-9);
    assert.ok(Math.abs(a/(Math.PI/12)-Math.round(a/(Math.PI/12)))<1e-9);
    assert.ok(Math.abs(Math.hypot(grid.end.x-grid.start.x,grid.end.y-grid.start.y)-96)<1e-9);
  }
});

test('стержень стрелки до самой головки прямой и полной толщины при любом наклоне',()=>{
  for(const both of [false,true])for(const headType of ['filled','open'] as const)for(const angle of [0,1e-5,.14,.5,1.57,2.1,3.14,4.2,5.7]){
    const shape={...shapeData('arrow'),length:500*Math.cos(angle),height:500*Math.sin(angle),both,headType};
    const o=rebuildShape({...makeStroke(1,1,0,0,shapePoints(shape,8),'#315ca8'),shape});
    const shaft=strokeLoops(o)[0],head=arrowHeads(o)[0],n=shaft.length/2;
    const len=Math.hypot(o.pts[3],o.pts[4]),ux=o.pts[3]/len,uy=o.pts[4]/len;
    const tip=headType==='filled'?((head[0]+head[6])*ux+(head[1]+head[7])*uy)/2:len;
    let checked=0;
    for(let i=0;i<n;i++)for(const t of [.1,.3,.5,.7,.9]){
      // Проверяем саму квадратичную границу, включая сглаживание у стыка.
      const prev=(i+n-1)%n,next=(i+1)%n,u=1-t;
      const x=u*u*(shaft[2*prev]+shaft[2*i])/2+2*u*t*shaft[2*i]+t*t*(shaft[2*i]+shaft[2*next])/2;
      const y=u*u*(shaft[2*prev+1]+shaft[2*i+1])/2+2*u*t*shaft[2*i+1]+t*t*(shaft[2*i+1]+shaft[2*next+1])/2;
      const along=x*ux+y*uy,across=-x*uy+y*ux;
      if(along>tip-80&&along<tip-.001){assert.ok(Math.abs(Math.abs(across)-4)<.001,`изгиб стержня при ${angle}`);checked++;}
      assert.ok(along<=tip+.001,'торец не выходит за головку');
    }
    assert.ok(checked>0);
  }
});

test('гипербола: xy постоянно, симметрия y=x и редактируемый SVG после поворота',async()=>{
  const shape={...shapeData('hyperbola'),length:300,height:300},p=shapePoints(shape,4),n=p.length/3;
  assert.deepEqual([...p.slice(0,3)],[0,0,4]);assert.deepEqual([...p.slice(-3)],[300,300,4]);
  for(let i=0;i<n;i++){
    const x=.25+p[3*i]*3.75/300,y=4-p[3*i+1]*3.75/300,j=n-1-i;
    assert.ok(Math.abs(x*y-1)<1e-6);
    assert.ok(Math.abs(p[3*i]+p[3*j+1]-300)<.0001);
    if(i)assert.ok(p[3*i]>p[3*i-3]&&p[3*i+1]>p[3*i-2]);
  }
  const o=rebuildShape({...makeStroke(1,1,100,100,p,'#315ca8'),shape,dash:{length:16,gap:12,round:true}});
  const rotated=transformObject(o,{a:0,b:2,c:-2,d:0,e:20,f:30},true);
  const data={objects:[rotated],grid:{enabled:true,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
  assert.deepEqual(await nativeSvgData(await encodeSvg(data)),data);
});
