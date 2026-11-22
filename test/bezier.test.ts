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

test('кривая стрелка: открытые головки на обоих концах направлены по точным касательным',()=>{
  for(const controls of [[{x:100,y:180}],[{x:40,y:120},{x:160,y:-120}],[{x:0,y:0},{x:200,y:0}]]){
    const s={...shapeData('arrow'),length:200,controls,both:true};
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
  for(const base of [shapeData('line'),shapeData('arrow'),{...shapeData('arrow'),headAtStart:true}]){
    const shape={...base,length:300,height:60,controls:[{x:40,y:-180},{x:200,y:200}],headType:'filled' as const};
    const o=rebuildShape({...makeStroke(1,1,80,90,shapePoints(shape,4),'#315ca8'),shape,dash:{length:20,gap:12,round:false}});
    const changed=transformObject(o,{a:-1.8,b:.3,c:.4,d:2,e:20,f:30},true);
    assert.equal(changed.kind,'stroke');if(changed.kind==='stroke'){assert.deepEqual(changed.shape?.controls,shape.controls);assert.equal(changed.pts[2],4);}
    const data={objects:[changed],grid:{enabled:false,step:24},view:{x:0,y:0,scale:1,rotSteps:0}};
    const svg=await encodeSvg(data);assert.ok(svg.includes('<path '));assert.deepEqual(await nativeSvgData(svg),data);
  }
});

test('до самого основания заполненной головки обе стороны стержня совпадают с линией Безье',()=>{
  // Два рисунка автора, в том числе пологая дуга с увеличенного скриншота.
  for(const [ex,ey,cx,cy,width] of [[-793,1057,-201,905,27],[-660,546,-157,741,6]]){
    for(const headAtStart of [false,true]){
      const control=headAtStart?{x:cx-ex,y:cy-ey}:{x:cx,y:cy};
      const shape={...shapeData('arrow'),length:headAtStart?-ex:ex,height:headAtStart?-ey:ey,
        controls:[control],headAtStart,headType:'filled' as const,headLength:8,headWidth:4.5,headRound:.6};
      const arrow=rebuildShape({...makeStroke(1,1,0,0,shapePoints(shape,width),'#315ca8'),shape});
      const line=rebuildShape(arrow,{...shape,kind:'line'});
      const [head]=arrowHeads(arrow), bx=(head[0]+head[6])/2, by=(head[1]+head[7])/2;
      const hx=head[3]-bx, hy=head[4]-by, length=Math.hypot(hx,hy);
      assert.deepEqual([...head.slice(3,5)],headAtStart?[0,0]:[ex,ey]);
      assert.ok(Math.abs(length-8*width)<.001);
      assert.equal(strokeLoops(arrow).length,2);
      let nearBase=0;
      for(let step=1;step<1000;step++){
        const t=step/1000,u=1-t;
        const x=2*t*u*cx+t*t*ex-(headAtStart?ex:0), y=2*t*u*cy+t*t*ey-(headAtStart?ey:0);
        const dx=u*cx+t*(ex-cx), dy=u*cy+t*(ey-cy), norm=Math.hypot(dx,dy);
        for(const offset of [-.57,-.43,0,.43,.57]){
          const p={x:x-offset*width*dy/norm,y:y+offset*width*dx/norm};
          const behind=((bx-p.x)*hx+(by-p.y)*hy)/length;
          if(behind<.05||behind>2*length)continue;
          if(behind<width)nearBase++;
          const inside=strokeIntersectsSweep(line,p,p,0);
          assert.equal(inside,Math.abs(offset)<.5);
          assert.equal(strokeIntersectsSweep(arrow,p,p,0),inside,'края стержня до головки');
        }
      }
      assert.ok(nearBase>8,'проверили и сечение непосредственно у основания');
    }
  }
});
