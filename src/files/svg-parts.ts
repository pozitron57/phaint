// Простые SVG разбираются на пути без восстановления осевых линий. Эффекты остаются целым SVG.
// getBBox/getScreenCTM нужны только при открытии; в рисовании и сохранении DOM не участвует.
import type { VectorObj } from '../core/types.ts';
import { matBBox, type Mat } from '../core/geom.ts';
export function svgParts(source:string,ox:number,oy:number):VectorObj[]|null {
  const parsed=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
  if([...parsed.querySelectorAll('*')].some(e=>!['g','path','rect','circle','ellipse','line','polyline','polygon','title','desc'].includes(e.localName)))return null;
  const root=document.importNode(parsed,true) as unknown as SVGSVGElement;
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1';
  host.append(root);document.body.append(host);
  try{
    const out:VectorObj[]=[];let id=1;
    for(const e of [root,...root.querySelectorAll('*')]){
      const style=getComputedStyle(e);
      if(style.filter!=='none'||style.clipPath!=='none'||style.maskImage!=='none'||style.mixBlendMode!=='normal')return null;
      if((e.localName==='g'||e===root)&&Number(style.opacity)!==1)return null;
      if(!['path','rect','circle','ellipse','line','polyline','polygon'].includes(e.localName))continue;
      if(style.visibility!=='visible')continue;
      let hidden=false;for(let p:Element|null=e;p&&p!==host;p=p.parentElement)if(getComputedStyle(p).display==='none')hidden=true;
      if(hidden)continue;
      const el=e as SVGGraphicsElement,b=el.getBBox(),ctm=el.getScreenCTM();if(!ctm)return null;
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
      if(!d)continue;
      if(style.fill.includes('url(')||style.stroke.includes('url(')||style.strokeDasharray!=='none')return null;
      if(Number(style.fillOpacity)!==1||Number(style.strokeOpacity)!==1||style.vectorEffect!=='none'||style.markerStart!=='none'||style.markerMid!=='none'||style.markerEnd!=='none')return null;
      if((Number(style.opacity)!==1&&style.fill!=='none'&&style.stroke!=='none')||Number(style.strokeMiterlimit)!==4||style.paintOrder!=='normal')return null;
      if(![style.fill,style.stroke].every(c=>/^(none|transparent|rgba?\([\d\s.,%]+\))$/.test(c)))return null;
      const sw=parseFloat(style.strokeWidth)||0,pad=style.stroke==='none'?0:sw*2;
      // Рамка округляется только наружу; геометрия d остаётся точной.
      const bounds={minX:Math.floor((b.x-pad)*100)/100,minY:Math.floor((b.y-pad)*100)/100,maxX:Math.ceil((b.x+b.width+pad)*100)/100,maxY:Math.ceil((b.y+b.height+pad)*100)/100};
      const bbox=matBBox({...matrix,e:matrix.e+ox,f:matrix.f+oy},bounds);
      const bg=out.length===0&&Number(style.opacity)===1&&style.stroke==='none'&&e.localName==='rect'&&style.fill==='rgb(255, 255, 255)'&&bbox.minX<=ox+.01&&bbox.minY<=oy+.01&&bbox.maxX>=ox+root.width.baseVal.value-.01&&bbox.maxY>=oy+root.height.baseVal.value-.01;
      out.push({kind:'vector',id,z:id++,ox,oy,matrix,d,fill:style.fill,stroke:style.stroke,strokeWidth:sw,
        fillRule:style.fillRule==='evenodd'?'evenodd':'nonzero',linecap:style.strokeLinecap as CanvasLineCap,linejoin:style.strokeLinejoin as CanvasLineJoin,
        opacity:Number(style.opacity),bounds,bbox,...(bg?{background:true}:{})});
    }
    return out.length?out:null;
  }finally{host.remove();}
}
