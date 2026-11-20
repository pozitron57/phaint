// Отдельный фрагмент внешнего SVG с исходными предками и локальными зависимостями.
// Вложенный viewport сохраняет проценты/viewBox, внешняя рамка убирает пустые поля страницы.
import { bboxUnion, matBBox, type BBox } from '../core/geom.ts';
import { makeSvg, type SvgObj } from '../core/types.ts';

const NS='http://www.w3.org/2000/svg';
const resources=new WeakMap<SVGSVGElement,Map<string,Element>>();

export function svgFragment(root:SVGSVGElement,el:SVGGraphicsElement,id:number,ox:number,oy:number):SvgObj|null {
  let originalIds=resources.get(root);
  if(!originalIds){originalIds=new Map([...root.querySelectorAll('[id]')].map(e=>[e.id,e]));resources.set(root,originalIds);}
  const bounds=fragmentBounds(el);if(!bounds)return null;
  const nested=root.cloneNode(false) as SVGSVGElement;
  let branch:Element=el.cloneNode(true) as Element;
  if(el!==root){
    for(let p:Element|null=el.parentElement;p&&p!==root;p=p.parentElement){
      const parent=p.cloneNode(false) as Element;parent.append(branch);branch=parent;
    }
    nested.append(branch);
  }else nested.append(...[...el.children].map(child=>child.cloneNode(true)));
  const included=new Set([...nested.querySelectorAll('[id]')].map(e=>e.id));
  const defs=document.createElementNS(NS,'defs');
  const references=(node:Element):boolean=>{
    for(const e of [node,...node.querySelectorAll('*')])for(const a of e.attributes){
      const refs=[...a.value.matchAll(/url\(\s*['"]?#([^\s'"\)]+)['"]?\s*\)/g)].map(m=>m[1]);
      if(a.localName==='href'&&a.value.startsWith('#'))refs.push(a.value.slice(1));
      for(const ref of refs){
        const target=originalIds!.get(ref);if(!target)return false;
        // Обводка внутри use не входит в getBBox самого use. Пока нельзя надёжно
        // измерить её с учётом symbol/viewBox, оставляем исходный SVG целым.
        if(e.localName==='use'&&[target,...target.querySelectorAll('*')].some(t=>getComputedStyle(t).stroke!=='none'))return false;
        if(included.has(ref))continue;
        included.add(ref);
        const copy=target.cloneNode(true) as Element;
        for(const child of copy.querySelectorAll('[id]'))included.add(child.id);
        // В defs тоже наследуются color, stop-color и другие свойства. Сохраняем
        // цепочку предков ресурса; её id не дублируются с видимой ветвью.
        let branch:Element=copy;
        for(let p:Element|null=target.parentElement;p&&p!==root;p=p.parentElement){
          const parent=p.cloneNode(false) as Element;parent.removeAttribute('id');parent.append(branch);branch=parent;
        }
        defs.append(branch);if(!references(branch))return false;
      }
    }
    return true;
  };
  if(!references(nested))return null;
  if(defs.childElementCount)nested.prepend(defs);
  const width=bounds.maxX-bounds.minX,height=bounds.maxY-bounds.minY;
  if(width<=0||height<=0)return null;
  const crop=document.createElementNS(NS,'svg');
  crop.setAttribute('width',String(width));crop.setAttribute('height',String(height));
  crop.setAttribute('viewBox',`${bounds.minX} ${bounds.minY} ${width} ${height}`);
  crop.append(nested);
  // После сохранения фрагменты окажутся в одном SVG. Их определения не должны
  // перехватывать ссылки друг друга или объектов, вставленных из другого окна.
  const prefix=`phaint-part-${crypto.randomUUID()}-`,ids=new Map<string,string>();
  for(const e of crop.querySelectorAll('[id]'))ids.set(e.id,prefix+ids.size);
  for(const e of [crop,...crop.querySelectorAll('*')])for(const a of e.attributes){
    if(a.name==='id'&&ids.has(a.value))a.value=ids.get(a.value)!;
    else if(a.localName==='href'&&a.value.startsWith('#')&&ids.has(a.value.slice(1)))a.value='#'+ids.get(a.value.slice(1));
    else a.value=a.value.replace(/url\(\s*['"]?#([^\s'"\)]+)['"]?\s*\)/g,(value,ref:string)=>ids.has(ref)?`url(#${ids.get(ref)})`:value);
  }
  return makeSvg(id,id,ox+bounds.minX,oy+bounds.minY,width,height,new XMLSerializer().serializeToString(crop));
}

function fragmentBounds(el:SVGGraphicsElement):BBox|null {
  const ctm=el.getScreenCTM();if(!ctm)return null;
  const b=el.getBBox();let bounds=matBBox(ctm,{minX:b.x,minY:b.y,maxX:b.x+b.width,maxY:b.y+b.height});
  for(const e of [el,...el.querySelectorAll('*')]){
    if(!(e instanceof SVGGraphicsElement)||e.closest('defs'))continue;
    const s=getComputedStyle(e);
    // Маркеры и non-scaling-stroke требуют отдельного расчёта видимой рамки.
    if(s.markerStart!=='none'||s.markerMid!=='none'||s.markerEnd!=='none'||s.vectorEffect!=='none')return null;
    if(s.stroke==='none'||s.display==='none')continue;
    const m=e.getScreenCTM();if(!m)return null;
    const q=e.getBBox(),pad=(parseFloat(s.strokeWidth)||0)*Math.max(1,Number(s.strokeMiterlimit)/2);
    bounds=bboxUnion(bounds,matBBox(m,{minX:q.x-pad,minY:q.y-pad,maxX:q.x+q.width+pad,maxY:q.y+q.height+pad}));
  }
  // Запас на сглаживание, без обрезки букв и тонких обводок на краях.
  return {minX:Math.floor(bounds.minX-1),minY:Math.floor(bounds.minY-1),maxX:Math.ceil(bounds.maxX+1),maxY:Math.ceil(bounds.maxY+1)};
}
