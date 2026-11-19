// Отрисовка объектов документа в Canvas 2D.
// Контур штриха строится один раз на объект и хранится, пока жив сам объект.
// Маркер заливается один раз с multiply; маска вырезает прозрачность до общего наложения.
import { abortable, cancellationPoint, checkCancelled } from '../core/cancel.ts';
import { matMul, type Mat } from '../core/geom.ts';
import { type Loops } from '../core/outline.ts';
import { strokeLoops } from '../core/shapes.ts';
import { objectMatrix } from '../core/transform.ts';
import { isPdfPage, type Obj, type StrokeObj, type VectorObj } from '../core/types.ts';

let scratch: HTMLCanvasElement | null = null;
export function inheritImage(from: Obj, to: Obj): void {
  const image=images.get(from);if(image)images.set(to,image);
  // Маска и перенос не меняют сам путь. Не разбираем заново длинный d при каждом отсчёте ластика.
  const samePath=from.kind==='vector'&&to.kind==='vector'&&from.d===to.d
    ||from.kind==='stroke'&&to.kind==='stroke'&&from.pts===to.pts&&from.shape===to.shape&&from.dash===to.dash;
  const path=paths.get(from);if(samePath&&path)paths.set(to,path);
}
const paths = new WeakMap<Obj, Path2D>();
const images = new WeakMap<Obj, HTMLImageElement|ImageBitmap>();
const pdfImages=new WeakMap<Obj,ImageBitmap>();
export function setPdfImage(o:Obj,image:ImageBitmap|null):void {if(image)pdfImages.set(o,image);else pdfImages.delete(o);}

/** Декодируем импортированные SVG до замены документа; в кадре никогда не ждём загрузку. */
export async function prepareObjects(objects: readonly Obj[], signal?: AbortSignal): Promise<void> {
  const area=objects.filter(isPdfPage).reduce((sum,o)=>sum+o.width*o.height,0);
  const density=Math.min(1,Math.sqrt(16000000/area));
  let count=0;
  for (const o of objects) {
    if(count++%256===0)await cancellationPoint(signal);
    if (o.kind === 'stroke' || o.kind === 'vector' || images.has(o)) continue;
    let source=o.source;
    if(o.kind==='svg'&&isPdfPage(o)){
      // SVG остаётся в документе векторным; миниатюра для плиток ограничена как при
      // открытии PDF. Браузер не держит растры сотен страниц в полном размере.
      const scale=Math.min(density,Math.sqrt(1000000/(o.width*o.height)));
      source=source.replace(/<svg\b([^>]*)>/,(_,a:string)=>`<svg${a.replace(/\s(?:width|height)="[^"]*"/g,'')} width="${Math.max(1,Math.ceil(o.width*scale))}" height="${Math.max(1,Math.ceil(o.height*scale))}">`);
    }
    const url = o.kind==='image' ? source : URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    const img = new Image();
    try {
      img.src = url;await abortable(img.decode(),signal);
      const image=o.kind==='svg'&&isPdfPage(o)?await createImageBitmap(img):img;
      if(signal?.aborted&&image instanceof ImageBitmap)image.close();
      checkCancelled(signal);images.set(o,image);
    } finally { if(signal?.aborted)img.src='';if(o.kind==='svg') URL.revokeObjectURL(url); }
  }
}

/** Петли контура → путь. Кривая идёт через середины рёбер, вершины — контрольные точки. */
export function loopsToPath(loops: Loops): Path2D {
  const path = new Path2D();
  for (const p of loops) {
    const n = p.length >> 1;
    if (n < 3) continue;
    let x = p[0];
    let y = p[1];
    path.moveTo((p[2 * n - 2] + x) / 2, (p[2 * n - 1] + y) / 2);
    for (let i = 0; i < n; i++) {
      const j = i + 1 < n ? i + 1 : 0;
      const nx = p[2 * j];
      const ny = p[2 * j + 1];
      path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      x = nx;
      y = ny;
    }
    path.closePath();
  }
  return path;
}

export function objPath(o: StrokeObj): Path2D {
  let path = paths.get(o);
  if (!path) {
    path = loopsToPath(strokeLoops(o));
    paths.set(o, path);
  }
  return path;
}

/**
 * Нарисовать объект. D — линейная часть «мир → устройство», (ex, ey) — сдвиг в пикселях:
 * устройство = D · objectMatrix(o) · локальная точка + (ex, ey).
 */
export function vectorPath(o: VectorObj):Path2D {
  let path=paths.get(o);if(!path){path=new Path2D(o.d);paths.set(o,path);}return path;
}
export function drawObj(ctx: CanvasRenderingContext2D, o: Obj, D: Mat, ex: number, ey: number): void {
  const m=matMul({...D,e:ex,f:ey},objectMatrix(o));
  ctx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
  ctx.save();
  if(o.clip){ctx.beginPath();o.clip.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();}
  if(o.kind==='stroke'||o.kind==='vector')ctx.globalAlpha=o.opacity??1;
  if(o.kind==='stroke'&&o.marker)ctx.globalCompositeOperation='multiply';
  const draw=(g:CanvasRenderingContext2D)=>{
    if(o.kind==='stroke'){g.fillStyle=o.color;g.fill(objPath(o));}
    else if(o.kind==='vector'){
      g.save();const path=vectorPath(o);
      if(o.fill!=='none'){g.fillStyle=o.fill;g.fill(path,o.fillRule);}
      if(o.stroke!=='none'&&o.strokeWidth>0){g.strokeStyle=o.stroke;g.lineWidth=o.strokeWidth;g.lineCap=o.linecap;g.lineJoin=o.linejoin;g.stroke(path);}
      g.restore();
    } else {const img=pdfImages.get(o)??images.get(o);if(img)g.drawImage(img,0,0,o.width,o.height);}
  };
  if(o.kind!=='image'&&o.erasures?.length){
    const c=scratch??=document.createElement('canvas');
    if(c.width!==ctx.canvas.width||c.height!==ctx.canvas.height){c.width=ctx.canvas.width;c.height=ctx.canvas.height;}
    const g=c.getContext('2d',{willReadFrequently:true})!;
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);g.setTransform(ctx.getTransform());draw(g);
    g.globalCompositeOperation='destination-out';g.fillStyle='black';g.strokeStyle='black';g.lineCap='round';
    for(const [x,y,u,v,r,...m] of o.erasures){g.save();if(m.length===6)g.transform(m[0],m[1],m[2],m[3],m[4],m[5]);g.beginPath();if(x===u&&y===v){g.arc(x,y,r,0,Math.PI*2);g.fill();}else{g.moveTo(x,y);g.lineTo(u,v);g.lineWidth=2*r;g.stroke();}g.restore();}
    g.globalCompositeOperation='source-over';ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(c,0,0);ctx.restore();
  }else draw(ctx);
  ctx.restore();
}
