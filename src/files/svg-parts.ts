// Разбираем внешний SVG по объектам: простая геометрия — контуры, остальное — фрагменты SVG.
// Групповая прозрачность/обрезка сохраняют группу; эффекты смешивания требуют целого оригинала.
import type { Obj, VectorObj } from '../core/types.ts';
import { matBBox, type Mat } from '../core/geom.ts';
import { svgFragment } from './svg-fragment.ts';

const SHAPES=['path','rect','circle','ellipse','line','polyline','polygon'];
const RESOURCES=['defs','style','title','desc','metadata'];

export function svgParts(source:string,ox:number,oy:number):Obj[]|null {
  const parsed=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
  // Извлечение меняет контекст CSS-селекторов и геометрии, заданной через CSS.
  if(parsed.querySelector('style'))return null;
  const root=document.importNode(parsed,true) as unknown as SVGSVGElement;
  const host=document.createElement('div');
  // SVG не должен стоять на текстовой базовой линии: у маленьких страниц это даёт
  // лишний сдвиг в getScreenCTM, который затем увеличивается вместе с рисунком.
  host.style.cssText='position:fixed;left:0;top:0;display:grid;opacity:0;pointer-events:none;z-index:-1';
  host.append(root);document.body.append(host);
  try{
    // Смешивание с соседями и фильтры могут зависеть от всего рисунка и выходить за рамку.
    // Не меняем их внешний вид ради разделения на объекты.
    for(const e of [root,...root.querySelectorAll('*')]){
      const s=getComputedStyle(e);
      if(s.filter!=='none'||s.mixBlendMode!=='normal')return null;
    }
    const out:Obj[]=[];
    const walk=(e:Element):boolean=>{
      if(RESOURCES.includes(e.localName))return true;
      const s=getComputedStyle(e);
      if(s.display==='none')return true;
      const container=e===root||e.localName==='g';
      if(container&&Number(s.opacity)===1&&s.clipPath==='none'&&s.maskImage==='none'){
        for(const child of e.children)if(!walk(child))return false;
        return true;
      }
      // У текста и use потомок может снова включить visibility, поэтому такой
      // фрагмент сохраняем целиком; простая скрытая фигура ничего не рисует.
      if(s.visibility!=='visible'&&SHAPES.includes(e.localName))return true;
      if(!(e instanceof SVGGraphicsElement))return false;
      const id=out.length+1;
      const vector=vectorPart(e,s,id,ox,oy);
      const o=vector??svgFragment(root,e,id,ox,oy);
      if(!o)return false;
      const b=o.bbox;
      const bg=out.length===0&&vector&&Number(s.opacity)===1&&s.stroke==='none'&&e.localName==='rect'&&s.fill==='rgb(255, 255, 255)'&&b.minX<=ox+.01&&b.minY<=oy+.01&&b.maxX>=ox+root.width.baseVal.value-.01&&b.maxY>=oy+root.height.baseVal.value-.01;
      out.push(bg?{...vector,background:true}:o);return true;
    };
    return walk(root)&&out.length?out:null;
  }finally{host.remove();}
}

function vectorPart(e:SVGGraphicsElement,s:CSSStyleDeclaration,id:number,ox:number,oy:number):VectorObj|null {
  if(!SHAPES.includes(e.localName)||s.clipPath!=='none'||s.maskImage!=='none')return null;
  if(s.fill.includes('url(')||s.stroke.includes('url(')||s.strokeDasharray!=='none')return null;
  if(Number(s.fillOpacity)!==1||Number(s.strokeOpacity)!==1||s.vectorEffect!=='none'||s.markerStart!=='none'||s.markerMid!=='none'||s.markerEnd!=='none')return null;
  if((Number(s.opacity)!==1&&s.fill!=='none'&&s.stroke!=='none')||Number(s.strokeMiterlimit)!==4||s.paintOrder!=='normal')return null;
  if(![s.fill,s.stroke].every(c=>/^(none|transparent|rgba?\([\d\s.,%]+\))$/.test(c)))return null;
  const b=e.getBBox(),ctm=e.getScreenCTM();if(!ctm)return null;
  const matrix:Mat={a:ctm.a,b:ctm.b,c:ctm.c,d:ctm.d,e:ctm.e,f:ctm.f};
  let d=e.getAttribute('d')??'';
  const n=(name:string)=>{const value=(e as unknown as Record<string,{baseVal?:SVGLength}>)[name];return value?.baseVal?.value??Number(e.getAttribute(name)??0);};
  if(e.localName==='rect'){
    if(n('rx')||n('ry'))return null;const x=n('x'),y=n('y'),w=n('width'),h=n('height');d=`M${x} ${y}h${w}v${h}h${-w}Z`;
  }else if(e.localName==='circle'||e.localName==='ellipse'){
    const x=n('cx'),y=n('cy'),rx=e.localName==='circle'?n('r'):n('rx'),ry=e.localName==='circle'?n('r'):n('ry');
    d=`M${x-rx} ${y}a${rx} ${ry} 0 1 0 ${2*rx} 0a${rx} ${ry} 0 1 0 ${-2*rx} 0Z`;
  }else if(e.localName==='line')d=`M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
  else if(e.localName==='polyline'||e.localName==='polygon')d=`M${e.getAttribute('points')??''}${e.localName==='polygon'?'Z':''}`;
  if(!d)return null;
  const sw=parseFloat(s.strokeWidth)||0,pad=s.stroke==='none'?0:sw*2;
  // Рамка округляется только наружу; геометрия d остаётся точной.
  const bounds={minX:Math.floor((b.x-pad)*100)/100,minY:Math.floor((b.y-pad)*100)/100,maxX:Math.ceil((b.x+b.width+pad)*100)/100,maxY:Math.ceil((b.y+b.height+pad)*100)/100};
  const bbox=matBBox({...matrix,e:matrix.e+ox,f:matrix.f+oy},bounds);
  return {kind:'vector',id,z:id,ox,oy,matrix,d,fill:s.fill,stroke:s.stroke,strokeWidth:sw,
    fillRule:s.fillRule==='evenodd'?'evenodd':'nonzero',linecap:s.strokeLinecap as CanvasLineCap,linejoin:s.strokeLinejoin as CanvasLineJoin,
    opacity:Number(s.opacity),bounds,bbox};
}
