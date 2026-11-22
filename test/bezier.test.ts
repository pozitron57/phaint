// Геометрия Безье, направление головок и сохранение параметров после преобразований.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeData, shapePoints, rebuildShape, arrowHeads, strokeLoops } from '../src/core/shapes.ts';
import { makeStroke } from '../src/core/types.ts';
import { transformObject } from '../src/core/transform.ts';
import { strokeIntersectsSweep } from '../src/core/hit.ts';
import { matApply } from '../src/core/geom.ts';
import { encodeSvg, nativeSvgData } from '../src/files/codec.ts';

test('Безье: одна и две точки задают точную форму, концы неподвижны',()=>{
  for(const controls of [[{x:100,y:160}],[{x:40,y:160},{x:160,y:-160}]]){
    const shape={...shapeData('line'),length:200,controls},pts=shapePoints(shape,3);
    assert.deepEqual([...pts.slice(0,3)],[0,0,3]);assert.deepEqual([...pts.slice(-3)],[200,0,3]);
    assert.ok(pts.length>60&&pts.length<3000);
    const mid=pts.length/3>>1;
    assert.ok(Math.abs(pts[3*mid]-100)<.001);
    assert.ok(Math.abs(pts[3*mid+1]-(controls.length===1?80:0))<.001);
    const shape2={...shape,frame:{a:-1.5,b:.6,c:.3,d:2,e:12,f:17}},q=shapePoints(shape2,3);
    const end=matApply(shape2.frame,200,0);assert.ok(Math.abs(q.at(-3)!-end.x)<.001&&Math.abs(q.at(-2)!-end.y)<.001);
  }
  // Коллинеарные ручки за концами не должны схлопываться в простой отрезок.
  const back=shapePoints({...shapeData('line'),length:100,controls:[{x:300,y:0}]},3);
  assert.ok([...back].filter((_,i)=>i%3===0).some(x=>x>170));
});

test('кривая стрелка: головки на обоих концах направлены по точным касательным',()=>{
  for(const controls of [[{x:100,y:180}],[{x:40,y:120},{x:160,y:-120}],[{x:0,y:0},{x:200,y:0}]]){
    const s={...shapeData('arrow'),length:200,controls,both:true,headType:'filled' as const};
    const o=rebuildShape({...makeStroke(1,1,50,70,shapePoints(s,5),'#315ca8'),shape:s}),heads=arrowHeads(o);
    assert.deepEqual([...heads[0].slice(3,5)],[200,0]);assert.deepEqual([...heads[1].slice(3,5)],[0,0]);
    const tipControl=controls.findLast(p=>p.x!==200||p.y!==0)!,tailControl=controls.find(p=>p.x!==0||p.y!==0)!;
    for(const [h,dx,dy] of [[heads[0],200-tipControl.x,-tipControl.y],[heads[1],-tailControl.x,-tailControl.y]] as const){
      const x=h[3]-(h[0]+h[6])/2,y=h[4]-(h[1]+h[7])/2;
      assert.ok(Math.abs(x*dy-y*dx)<.01&&x*dx+y*dy>0);
    }
    const loops=strokeLoops(o);assert.ok(loops.length>=3&&loops.every(p=>p.every(Number.isFinite)));
    for(const loop of loops)for(let i=0;i<loop.length;i+=2){
      assert.ok(loop[i]+o.ox>=o.bbox.minX-.1&&loop[i]+o.ox<=o.bbox.maxX+.1);
      assert.ok(loop[i+1]+o.oy>=o.bbox.minY-.1&&loop[i+1]+o.oy<=o.bbox.maxY+.1);
    }
  }
});

test('Безье: поворот, отражение, штрихи и точные ручки сохраняются в SVG',async()=>{
  for(const kind of ['line','arrow'] as const){
    const shape={...shapeData(kind),length:300,height:60,controls:[{x:40,y:-180},{x:200,y:200}],headType:'filled' as const};
    const o=rebuildShape({...makeStroke(1,1,80,90,shapePoints(shape,4),'#315ca8'),shape,dash:{length:20,gap:12,round:false}});
    const changed=transformObject(o,{a:-1.8,b:.3,c:.4,d:2,e:20,f:30},true);
    assert.equal(changed.kind,'stroke');if(changed.kind==='stroke'){assert.deepEqual(changed.shape?.controls,shape.controls);assert.equal(changed.pts[2],4);}
    const data={objects:[changed],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
    const svg=await encodeSvg(data);assert.ok(svg.includes('<path '));assert.deepEqual(await nativeSvgData(svg),data);
  }
});


test('длинный заполненный наконечник плавно соединяется со стержнем Безье',()=>{
  // Пропорции стрелки с рисунка. Проверяем тот же стык на конце и в начале.
  const width=27;
  for(const reverse of [false,true]){
    const shape={...shapeData('arrow'),length:reverse?793:-793,height:reverse?-1057:1057,
      controls:[reverse?{x:592,y:-152}:{x:-201,y:905}],both:reverse,
      headType:'filled' as const,headLength:8,headWidth:4.5,headRound:.6};
    const o=rebuildShape({...makeStroke(1,1,0,0,shapePoints(shape,width),'#315ca8'),shape});
    const h=arrowHeads(o)[reverse?1:0],x=(h[0]+h[6])/2,y=(h[1]+h[7])/2;
    const len=Math.hypot(x-h[3],y-h[4]),ux=(x-h[3])/len,uy=(y-h[4])/len;
    for(const along of [2,6,10,15,20,25])for(const across of [-.4,0,.4]){
      const p={x:x+along*ux-across*width*uy,y:y+along*uy+across*width*ux};
      assert.ok(strokeIntersectsSweep(o,p,p,0),'просвет в стержне сразу за основанием');
    }
    assert.equal(strokeLoops(o).length,reverse?3:2,'на плавной дуге нет острых изломов с дополнительными дисками');
  }
});
