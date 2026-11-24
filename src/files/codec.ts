// Формат документа: обычные векторные пути SVG + точные данные штрихов в metadata.
// Хеш видимого SVG защищает внешние правки: при несовпадении читается сам SVG, а не старая metadata.
// Всё тяжёлое (контуры, JSON, хеш) вызывается в Worker, без остановки пера.
import { maskedSvg } from '../core/svg-mask.ts';
import { vectorErasedSvg } from './eraser-clip.ts';
import { bboxUnion, matBBox, type Mat, type BBox } from '../core/geom.ts';
import { type Loops } from '../core/outline.ts';
import { strokeLoops, withShapeBounds, MIN_GAMMA, MAX_GAMMA, type ArrowHeadStyle, type ShapeData } from '../core/shapes.ts';
import { objectMatrix, localBounds } from '../core/transform.ts';
import type { GridSettings } from '../core/settings.ts';
import { makeStroke, makeSvg, makeImage, isPdfPage, type Obj, type StrokeObj, type VectorObj, type SvgObj, type ImageObj } from '../core/types.ts';
import { polygonArea, insideClip, withClipBounds } from '../core/clip.ts';
import { gridSvg } from './grid-svg.ts';
import { matrixScale, vectorOptions, contourDetailLoss, type SvgExportOptions } from './export-options.ts';
import { compactContours } from './contour-export.ts';
import type { PdfSource } from './pdf-types.ts';

export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export interface SavedView { scale: number; rotSteps: number; x: number; y: number }
export interface DocumentData {
  objects: Obj[]; grid: GridSettings; view: SavedView; baseScale?: number; emptyBounds?:BBox;
  pdf?:PdfSource;
  /** Точная рамка только для прозрачного слоя пометок PDF. */
  exportBounds?:BBox;
  /** Только для записи области: в metadata остаются локальные clip каждого объекта. */
  exportArea?: {bounds:BBox;matrix:Mat;width:number;height:number};
  /** Параметры только экспортной копии; в рабочие SVG/резервные копии не записываются. */
  exportOptions?:SvgExportOptions;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string): string => s.replace(/&(quot|gt|lt|amp);/g, (_, key: string) => ({ quot: '"', gt: '>', lt: '<', amp: '&' })[key]!);

function encodePoints(pts: Float32Array): string {
  return encodeBytes(new Uint8Array(pts.buffer, pts.byteOffset, pts.byteLength));
}
function encodeBytes(bytes:Uint8Array):string {
  let raw = '';
  for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}
function decodePoints(s: string): Float32Array {
  const raw = atob(s);
  if (raw.length % 12 || raw.length === 0) throw new Error('Повреждены точки штриха.');
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  const pts = new Float32Array(bytes.buffer);
  for (let i = 0; i < pts.length; i++) {
    if (!Number.isFinite(pts[i]) || Math.abs(pts[i]) > 1e12 || (i % 3 === 2 && (pts[i] <= 0 || pts[i] > 1e6))) {
      throw new Error('Недопустимые координаты или толщина штриха.');
    }
  }
  return pts;
}

/** Компактная резервная копия: не строит SVG-контуры и не дублирует изображение. */
export function encodeData(data: DocumentData, references = false, vectorPrefix='phaint-'): string {
  return JSON.stringify({version:data.objects.some(o=>isPdfPage(o)&&o.kind==='svg')?6:data.pdf?5:data.objects.some(o=>o.kind==='stroke'&&o.dash?.dots)?4:data.objects.some(o=>o.clip)?3:2,grid:data.grid,view:data.view,baseScale:data.baseScale,emptyBounds:data.emptyBounds,pdf:data.pdf,
    vectorPrefix:references&&vectorPrefix!=='phaint-'?vectorPrefix:undefined,
    objects:data.objects.map(o=>{
      const {bbox,...fields}=o;
      if(o.kind==='stroke')return {...fields,pts:encodePoints(o.pts)};
      if(o.kind==='vector')return {...fields,d:references?undefined:o.d,asset:references?o.id:undefined};
      return {...fields,source:references?undefined:o.source,asset:references?o.id:undefined};
    })});
}

function finite(v: unknown, min = -1e12, max = 1e12): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('Некорректное число в документе.');
  return v;
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Повреждён документ Phaint.');
  return v as Record<string, unknown>;
}

function readArrowHead(s: Record<string, unknown>): ArrowHeadStyle {
  return {headLength:finite(s.headLength,.1,100),headWidth:finite(s.headWidth,.1,100),headType:s.headType==='filled'?'filled':'open',
    ...(s.headRound===undefined?{}:{headRound:finite(s.headRound,0,1)})};
}

export function decodeData(text: string): DocumentData {
  if (text.length > MAX_FILE_BYTES) throw new Error('Документ слишком большой (предел 256 МБ).');
  const raw = object(JSON.parse(text));
  if (typeof raw.version!=='number'||![1,2,3,4,5,6].includes(raw.version)) throw new Error('Версия документа не поддерживается этой Phaint.');
  if (!Array.isArray(raw.objects) || raw.objects.length > 500000) throw new Error('Некорректный список объектов.');
  const ids = new Set<number>();
  let pointBytes = 0;
  const objects = raw.objects.map((item): Obj => {
    const o = object(item);
    const id = finite(o.id, 1, Number.MAX_SAFE_INTEGER - 1);
    const z = finite(o.z, 0, Number.MAX_SAFE_INTEGER - 1);
    if (!Number.isInteger(id) || !Number.isInteger(z) || ids.has(id)) throw new Error('Повторяющийся или неверный номер объекта.');
    ids.add(id);
    const x = finite(o.ox), y = finite(o.oy);
    const clipped=<T extends Obj>(value:T):T=>{
      if(o.clip===undefined)return value;
      if(!Array.isArray(o.clip)||o.clip.length<3||o.clip.length>256)throw new Error('Неверная область обрезки.');
      const clip=o.clip.map(p=>{const point=object(p);return {x:finite(point.x),y:finite(point.y)};});
      if(Math.abs(polygonArea(clip))<1e-8||!clip.every(p=>insideClip(clip,p)))throw new Error('Неверная область обрезки.');
      return withClipBounds({...value,clip});
    };
    if (o.kind === 'stroke' && typeof o.pts === 'string' && typeof o.color === 'string' && /^#[\da-f]{3,8}$/i.test(o.color)) {
      pointBytes += o.pts.length;
      if (pointBytes > MAX_FILE_BYTES) throw new Error('Слишком много точек в документе.');
      const stroke=makeStroke(id,z,x,y,decodePoints(o.pts),o.color);
      const extra:{-readonly [K in keyof StrokeObj]?:StrokeObj[K]}={};
      if(o.opacity!==undefined)extra.opacity=finite(o.opacity,.01,1);
      if(o.marker===true)extra.marker=true;
      if(o.matrix!==undefined&&extra.marker)extra.matrix=matrix(o.matrix);
      if(o.erasures!==undefined)extra.erasures=marks(o.erasures);
      if(o.dash!==undefined){const d=object(o.dash);extra.dash={length:finite(d.length,.001,1e6),gap:finite(d.gap,.01,1e6),round:d.round!==false,...(d.dots===true?{dots:true}:{}),...(d.offset===undefined?{}:{offset:finite(d.offset)})};}
      if(o.shape!==undefined){const s=object(o.shape);
        if(!['line','arrow','coordinates','ellipse','sine','parabola','hyperbola','adiabat'].includes(String(s.kind)))throw new Error('Неверная фигура.');
        extra.shape={kind:s.kind as ShapeData['kind'],frame:matrix(s.frame),length:finite(s.length),height:finite(s.height),bend:finite(s.bend),amplitude:finite(s.amplitude,0,1e9),period:finite(s.period,.01,1e9),cycles:finite(s.cycles,0,1000),...readArrowHead(s),both:s.both===true};
        if((s.kind==='arrow'||s.kind==='line')&&s.otherHead!==undefined)extra.shape.otherHead=readArrowHead(object(s.otherHead));
        if(s.kind==='arrow'&&s.headAtStart===true)extra.shape.headAtStart=true;
        if(s.kind==='line'&&s.savedHeadStyle===true)extra.shape.savedHeadStyle=true;
        if(s.kind==='adiabat')extra.shape.gamma=finite(s.gamma,MIN_GAMMA,MAX_GAMMA);
        if(s.controls!==undefined){
          if(!['line','arrow'].includes(String(s.kind))||!Array.isArray(s.controls)||s.controls.length<1||s.controls.length>2)throw new Error('Неверные точки Безье.');
          extra.shape.controls=s.controls.map(value=>{const p=object(value);return {x:finite(p.x),y:finite(p.y)};});
        }
      }
      return clipped(withShapeBounds({...stroke,...extra}));
    }
    if(o.kind==='vector'&&typeof o.d==='string'){
      const bounds=box(o.bounds),m=matrix(o.matrix);
      const vector:VectorObj={kind:'vector',id,z,ox:x,oy:y,matrix:m,bounds,bbox:bounds,d:o.d,
        fill:paint(o.fill),stroke:paint(o.stroke),strokeWidth:finite(o.strokeWidth,0,1e6),
        fillRule:o.fillRule==='evenodd'?'evenodd':'nonzero',linecap:o.linecap==='square'?'square':o.linecap==='round'?'round':'butt',
        linejoin:o.linejoin==='bevel'?'bevel':o.linejoin==='round'?'round':'miter',opacity:finite(o.opacity,0,1),
        ...(o.background===true?{background:true}:{}),...(o.native===true?{native:true}:{}),...(o.erasures===undefined?{}:{erasures:marks(o.erasures)})};
      return clipped({...vector,bbox:matBBox(objectMatrix(vector),bounds)});
    }
    if ((o.kind === 'svg' || o.kind === 'image') && typeof o.source === 'string' && o.source.length <= MAX_FILE_BYTES) {
      const width=finite(o.width,0.001,1e9), height=finite(o.height,0.001,1e9);
      const pageRef=<T extends SvgObj|ImageObj>(value:T):T=>{
        if(o.pdfPage===undefined)return value;
        const page=object(o.pdfPage),index=finite(page.index,0,9999);
        if(!Number.isInteger(index)||o.matrix||o.clip||o.erasures)throw new Error('Неверная страница PDF.');
        return {...value,pdfPage:{index,transform:matrix(page.transform)}};
      };
      if(o.kind==='image') {
        if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(o.source)) throw new Error('Неверная картинка.');
        return pageRef(clipped(withMatrix(makeImage(id,z,x,y,width,height,o.source),o.matrix)));
      }
      const svg=withMatrix(makeSvg(id,z,x,y,width,height,o.source),o.matrix);
      if(o.erasures!==undefined) {
        return pageRef(clipped({...svg,erasures:marks(o.erasures)}));
      }
      return pageRef(clipped(svg));
    }
    throw new Error('Неизвестный или повреждённый объект.');
  });
  const grid = object(raw.grid), view = object(raw.view);
  let pdf:PdfSource|undefined;
  if(raw.pdf!==undefined){
    const source=object(raw.pdf);
    if(typeof source.name!=='string'||typeof source.data!=='string'||source.data.length>MAX_FILE_BYTES||source.data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(source.data)||!/%PDF-[12]\.\d/.test(atob(source.data.slice(0,1368))))throw new Error('Повреждён исходный PDF.');
    pdf={name:source.name,data:source.data};
  }
  if(objects.some(isPdfPage)&&!pdf)throw new Error('Не найден исходный PDF для страниц.');
  if (typeof grid.enabled !== 'boolean') throw new Error('Некорректные настройки сетки.');
  const rotSteps = finite(view.rotSteps, 0, 15);
  if (!Number.isInteger(rotSteps)) throw new Error('Некорректный поворот.');
  return { objects, ...(pdf?{pdf}:{}), ...(raw.emptyBounds?{emptyBounds:box(raw.emptyBounds)}:{}), ...(raw.baseScale === undefined ? {} : {baseScale:finite(raw.baseScale,0.05,32)}), grid: { enabled: grid.enabled, step: finite(grid.step, 1, 10000), ...(grid.save===undefined?{}:{save:grid.save===true}) },
    view: { scale: finite(view.scale, 0.05, 32), rotSteps, x: finite(view.x), y: finite(view.y) } };
}

function matrix(v:unknown):Mat {
  const m=object(v);return {a:finite(m.a),b:finite(m.b),c:finite(m.c),d:finite(m.d),e:finite(m.e),f:finite(m.f)};
}
function box(v:unknown):BBox {const b=object(v);return {minX:finite(b.minX),minY:finite(b.minY),maxX:finite(b.maxX),maxY:finite(b.maxY)};}
function paint(v:unknown):string {
  if(typeof v!=='string'||! /^(none|transparent|[a-z]+|#[\da-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(v))throw new Error('Неверный цвет SVG.');return v;
}
function marks(v:unknown):number[][] {
  if(!Array.isArray(v)||v.length>500000)throw new Error('Неверный след ластика.');
  return v.map(mark=>{if(!Array.isArray(mark)||(mark.length!==5&&mark.length!==11))throw new Error('Неверный след ластика.');return mark.map((x,i)=>finite(x,i===4?.001:-1e12,i===4?1e6:1e12));});
}
function withMatrix<T extends Exclude<Obj,StrokeObj|VectorObj>>(o:T,value:unknown):T {
  if(value===undefined)return o;const next={...o,matrix:matrix(value)};
  return {...next,bbox:matBBox(objectMatrix(next),localBounds(next))};
}
const position=(n:number,precision?:number):string=>String(precision===undefined?n:Math.round(n*10**precision)/10**precision);
// Коэффициенты масштаба/поворота не округляются: это изменило бы весь объект.
const transform=(m:Mat,precision?:number):string=>`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${position(m.e,precision)} ${position(m.f,precision)})`;
const compactPath=(d:string):string=>d.replace(/\s+/g,' ').replace(/\s*([a-zA-Z,])\s*/g,'$1').replace(/(\d) +(?=[+-])/g,'$1').trim();
const black=(color:string):boolean=>['black','#000','#000000','rgb(0, 0, 0)'].includes(color);
function clippedSvg(body:string,o:Obj,id:string):string {
  if(!o.clip)return body;
  const d=o.clip.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join('')+'Z';
  return `<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${d}"/></clipPath></defs><g clip-path="url(#${id})">${body}</g>`;
}
function vectorAttributes(o:VectorObj):string {
  return `${black(o.fill)?'':` fill="${esc(o.fill)}"`}${o.stroke==='none'?'':` stroke="${esc(o.stroke)}" stroke-width="${o.strokeWidth}"`}`
    +`${o.fillRule==='nonzero'?'':` fill-rule="${o.fillRule}"`}${o.linecap==='butt'?'':` stroke-linecap="${o.linecap}"`}`
    +`${o.linejoin==='miter'?'':` stroke-linejoin="${o.linejoin}"`}${o.opacity===1?'':` opacity="${o.opacity}"`}`;
}

/** Та же геометрия квадратичных кривых, что в view/draw.ts. */
export function loopsToSvg(loops: Loops, precision=3): string {
  const out: string[] = [];
  const coarse=precision!==3,grid=10**precision,unit=coarse?grid*2:1000;
  const number=(value:number)=>{const s=String(value/unit);return value>0&&value<unit?s.slice(1):value<0&&value>-unit?'-'+s.slice(2):s;};
  const pair=(x:number,y:number)=>number(x)+(y<0?'':' ')+number(y);
  for (const p of loops) {
    const n = p.length / 2;
    if (n < 3) continue;
    // В экспортных пресетах сначала округляем контрольный многоугольник, затем берём
    // середины рёбер. Поэтому T остаётся точным отражением и не накапливает ошибку.
    let cx=coarse?Math.round(p[0]*grid)*2:0,cy=coarse?Math.round(p[1]*grid)*2:0;
    let x=coarse?(Math.round(p[p.length-2]*grid)*2+cx)/2:Math.round((p[p.length-2]+p[0])*500);
    let y=coarse?(Math.round(p[p.length-1]*grid)*2+cy)/2:Math.round((p[p.length-1]+p[1])*500),previous='M';
    out.push('M'+pair(x,y));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // Контрольная точка следующего сегмента — отражение предыдущей: команда T
      // почти вдвое короче Q. Каждые 16 сегментов Q ограничивает накопление округления.
      const nextCX=coarse?Math.round(p[2*j]*grid)*2:0,nextCY=coarse?Math.round(p[2*j+1]*grid)*2:0;
      const nx=coarse?(cx+nextCX)/2:Math.round((p[2*i]+p[2*j])*500);
      const ny=coarse?(cy+nextCY)/2:Math.round((p[2*i+1]+p[2*j+1])*500),q=i%16===0;
      const rx=nx-x,ry=ny-y,upper=q?'Q':'T',lower=q?'q':'t';
      let absolute=pair(nx,ny),relative=pair(rx,ry);
      // Без промежуточных массивов и регулярных выражений на каждой паре координат.
      if(q){if(!coarse){cx=Math.round(p[2*i]*1000);cy=Math.round(p[2*i+1]*1000);}absolute=pair(cx,cy)+(nx<0?'':' ')+absolute;relative=pair(cx-x,cy-y)+(rx<0?'':' ')+relative;}
      const a=(previous===upper?(absolute[0]==='-'?'':' '):upper)+absolute;
      const r=(previous===lower?(relative[0]==='-'?'':' '):lower)+relative,useRelative=r.length<a.length;
      out.push(useRelative?r:a);previous=useRelative?lower:upper;x=nx;y=ny;
      if(coarse){cx=nextCX;cy=nextCY;}
    }
    out.push('Z');
  }
  return out.join('');
}

async function hash(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export function exportSize(data: DocumentData): {x:number;y:number;width:number;height:number} {
  if(data.exportBounds){const b=data.exportBounds;return {x:b.minX,y:b.minY,width:b.maxX-b.minX,height:b.maxY-b.minY};}
  let box=data.objects[0]?.bbox??data.emptyBounds??{minX:0,minY:0,maxX:1280,maxY:800};
  for(let i=1;i<data.objects.length;i++)box=bboxUnion(box,data.objects[i].bbox);
  const area=data.exportArea;
  if(area)return {x:0,y:0,width:area.width,height:area.height};
  const step=data.grid.enabled&&data.grid.save?data.grid.step:1;
  const x=Math.floor((box.minX-12)/step)*step,y=Math.floor((box.minY-12)/step)*step;
  return {x,y,width:Math.ceil((box.maxX+12)/step)*step-x,height:Math.ceil((box.maxY+12)/step)*step-y};
}

export async function encodeSvg(data: DocumentData, metadataEnabled=true, precision=3): Promise<string> {
  // Вложенный SVG из другого редактора может уже содержать наши старые id.
  const sources=data.objects.flatMap(o=>o.kind==='svg'?[o.source]:[]);
  let prefix='phaint-',attempt=0;
  while(sources.some(source=>source.includes(prefix)))prefix=`phaint${++attempt}-`;
  const area=data.exportArea;
  const exportPrecision=data.exportOptions?precision:undefined;
  const {x,y,width,height}=exportSize(data);
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">\n`;
  const parts: string[] = [];
  const erase=data.exportOptions?.vectorMasks?vectorErasedSvg:maskedSvg;
  if(area)parts.push(`<g transform="${transform(area.matrix,exportPrecision)}">`);
  let vectorTransform:string|null=null;
  const closeVectors=()=>{if(vectorTransform!==null){parts.push('</g>');vectorTransform=null;}};
  if(data.grid.enabled&&data.grid.save){
    parts.push(gridSvg(area?.bounds??{minX:x,minY:y,maxX:x+width,maxY:y+height},data.grid.step,`${prefix}grid`,data.exportOptions?.grid==='paths'));
  }
  for (const o of [...data.objects].sort((a,b) => a.z-b.z)) {
    if(o.kind!=='vector')closeVectors();
    if (o.kind === 'stroke') {
      const scale=matrixScale(o.matrix)||1,digits=Math.min(8,precision+Math.max(0,Math.ceil(Math.log10(scale))));
      const options=vectorOptions(data.exportOptions),tolerance=data.exportOptions?options.tolerance:0;
      // Степень потерь задаётся в единицах экспорта, независимо от матрицы объекта.
      const loops=strokeLoops(o),d=tolerance?compactContours(loops,tolerance/scale,digits,loopsToSvg,o.pts,options.compactThin,contourDetailLoss(tolerance)):loopsToSvg(loops,digits);
      const path=`<path fill="${esc(o.color)}" d="${d}"/>`;
      const b=makeStroke(o.id,o.z,0,0,o.pts,o.color).bbox;
      const body=erase(path,b.maxX-b.minX,b.maxY-b.minY,o.erasures,`${prefix}mask-${o.id}`,b.minX,b.minY,scale);
      parts.push(`<g${o.opacity===undefined?'':` opacity="${o.opacity}"`}${o.marker?' style="mix-blend-mode:multiply"':''} transform="${o.matrix?transform(objectMatrix(o),exportPrecision):`translate(${position(o.ox,exportPrecision)} ${position(o.oy,exportPrecision)})`}">${clippedSvg(body,o,`${prefix}clip-${o.id}`)}</g>`);
    } else if(o.kind==='vector') {
      const matrix=transform(objectMatrix(o),exportPrecision);
      if(vectorTransform!==matrix){closeVectors();parts.push(`<g transform="${matrix}">`);vectorTransform=matrix;}
      const asset=`<path id="${prefix}${o.id}" d="${esc(compactPath(o.d))}"${vectorAttributes(o)}/>`;
      const b=o.bounds;
      const body=erase(asset,b.maxX-b.minX,b.maxY-b.minY,o.erasures,`${prefix}mask-${o.id}`,b.minX,b.minY,matrixScale(o.matrix));
      parts.push(clippedSvg(body,o,`${prefix}clip-${o.id}`));
    } else {
      // Самостоятельный SVG остаётся SVG: никакой растеризации при записи.
      const source=o.kind==='svg'&&data.exportOptions?.vectorMasks&&/<mask\b/.test(o.source)
        ?(await import('./svg-optimize.ts')).vectorizeEraserMasks(o.source,matrixScale(o.matrix)):o.source;
      const content=o.kind==='svg' ? source : `<image xmlns:xlink="http://www.w3.org/1999/xlink" width="${o.width}" height="${o.height}" xlink:href="${o.source}"/>`;
      const asset=`<!--phaint-asset-${o.id}-->${content}<!--phaint-end-${o.id}-->`;
      const body=o.kind==='svg' ? erase(asset,o.width,o.height,o.erasures,`${prefix}mask-${o.id}`,0,0,matrixScale(o.matrix)) : asset;
      parts.push(`<g transform="${o.matrix?transform(objectMatrix(o),exportPrecision):`translate(${position(o.ox,exportPrecision)} ${position(o.oy,exportPrecision)})`}">${clippedSvg(body,o,`${prefix}clip-${o.id}`)}</g>`);
    }
  }
  closeVectors();
  if(area)parts.push('</g>');
  const tail = parts.join('\n') + '\n</svg>\n';
  if(!metadataEnabled)return head+tail;
  const digest = await hash(head + tail);
  let payload=encodeData(data,true,prefix),encoding='';
  // Внешние контуры не дублируются. Повторяющиеся свойства пути сжимаются только в metadata;
  // видимые пути остаются обычным SVG, пригодным для любого редактора.
  if(payload.length>4096){
    const stream=new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate'));
    const packed=encodeBytes(new Uint8Array(await new Response(stream).arrayBuffer()));
    if(packed.length<payload.length){payload=JSON.stringify(packed);encoding='"encoding":"deflate-base64",';}
  }
  const metadata = `{"hash":"${digest}",${encoding}"data":${payload}}`;
  return head + `<metadata id="phaint-source">${metadata.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</metadata>\n` + tail;
}

/** null означает обычный SVG или SVG, который изменили во внешнем редакторе. */
export async function nativeSvgData(svg: string): Promise<DocumentData | null> {
  const match = /<metadata id="phaint-source">([\s\S]*?)<\/metadata>\n/.exec(svg);
  if (!match) return null;
  try {
    const meta = object(JSON.parse(unesc(match[1])));
    const visible = svg.slice(0, match.index) + svg.slice(match.index + match[0].length);
    if (meta.hash !== await hash(visible)) return null;
    let payload=meta.data;
    if(meta.encoding==='deflate-base64'&&typeof payload==='string'){
      const bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));
      const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
      const decoder=new TextDecoder();let decoded='',length=0;
      for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_FILE_BYTES){await reader.cancel();return null;}decoded+=decoder.decode(value,{stream:true});}
      payload=JSON.parse(decoded+decoder.decode());
    }
    const data=object(payload);
    const prefix=data.vectorPrefix??'phaint-';
    if(typeof prefix!=='string'||!/^phaint\d*-$/.test(prefix))return null;
    if(Array.isArray(data.objects)) for(const value of data.objects) {
      const o=object(value);
      if(o.asset===undefined) continue;
      const id=finite(o.asset,1,Number.MAX_SAFE_INTEGER-1);
      if(o.kind==='vector'){
        const path=new RegExp(`<path id="${prefix}${id}" d="([^"]*)"`).exec(visible);
        if(path){o.d=unesc(path[1]);continue;}
      }
      const start=`<!--phaint-asset-${id}-->`, end=`<!--phaint-end-${id}-->`;
      const at=visible.indexOf(start), until=visible.indexOf(end,at+start.length);
      if(at<0||until<0) return null;
      const content=visible.slice(at+start.length,until);
      if(o.kind==='vector')o.d=unesc(/ d="([^"]*)"/.exec(content)?.[1]??'');
      else o.source=o.kind==='image' ? /href="([^"]+)"/.exec(content)?.[1] : content;
    }
    return decodeData(JSON.stringify(data));
  } catch {
    // Даже без служебных данных видимое векторное изображение можно открыть.
    return null;
  }
}
