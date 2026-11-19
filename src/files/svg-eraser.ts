// Распознаём также маски ластика в SVG после SVGO, когда metadata уже нет.
// Только белый прямоугольник и непрозрачные чёрные круглые отрезки. Произвольные
// полутоновые/сложные маски оставляем как есть: замена их обрезкой неверна.
import {optimize} from 'svgo/dist/svgo.browser.js';
import type {XastElement,XastParent} from 'svgo/lib/types';
import {matMul,type Mat,type Pt,type BBox} from '../core/geom.ts';
import {matrixScale} from './export-options.ts';
import {eraserClipPath} from './eraser-clip.ts';
const numberPattern='[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?';
const identity=():Mat=>({a:1,b:0,c:0,d:1,e:0,f:0});
function numbers(text:string):number[]|null {
  const tokens=text.match(new RegExp(numberPattern,'g'))??[];
  if(text.replace(new RegExp(numberPattern,'g'),'').replace(/[\s,]/g,''))return null;
  const values=tokens.map(Number);return values.every(Number.isFinite)?values:null;
}
function transform(text=''):Mat|null {
  let result=identity(),at=0;
  for(const match of text.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)){
    if(text.slice(at,match.index).trim())return null;at=match.index!+match[0].length;
    const v=numbers(match[2]);if(!v)return null;let m=identity();
    if(match[1]==='matrix'&&v.length===6)[m.a,m.b,m.c,m.d,m.e,m.f]=v;
    else if(match[1]==='translate'&&(v.length===1||v.length===2)){m.e=v[0];m.f=v[1]??0;}
    else if(match[1]==='scale'&&(v.length===1||v.length===2)){m.a=v[0];m.d=v[1]??v[0];}
    else if(match[1]==='rotate'&&(v.length===1||v.length===3)){
      const angle=v[0]*Math.PI/180;m.a=m.d=Math.cos(angle);m.b=Math.sin(angle);m.c=-m.b;
      if(v.length===3){m.e=v[1]-m.a*v[1]-m.c*v[2];m.f=v[2]-m.b*v[1]-m.d*v[2];}
    }else if(match[1]==='skewX'&&v.length===1)m.c=Math.tan(v[0]*Math.PI/180);
    else if(match[1]==='skewY'&&v.length===1)m.b=Math.tan(v[0]*Math.PI/180);
    else return null;
    result=matMul(result,m);
  }
  return text.slice(at).trim()?null:result;
}
interface Subpath {points:Pt[];closed:boolean}
function linearPaths(d:string):Subpath[]|null {
  const tokens=d.match(new RegExp(`[MLHVZmlhvz]|${numberPattern}`,'g'))??[];
  if(d.replace(new RegExp(`[MLHVZmlhvz]|${numberPattern}`,'g'),'').replace(/[\s,]/g,''))return null;
  const out:Subpath[]=[];let x=0,y=0,i=0,command='',current:Subpath|undefined;
  while(i<tokens.length){
    if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];
    if(!command)return null;
    const upper=command.toUpperCase(),relative=command!==upper;
    if(upper==='Z'){if(!current)return null;current.closed=true;({x,y}=current.points[0]);command='';continue;}
    const count=upper==='H'||upper==='V'?1:2,args=tokens.slice(i,i+count).map(Number);
    if(args.length!==count||!args.every(Number.isFinite))return null;i+=count;
    if(upper==='M'||upper==='L'){x=args[0]+(relative?x:0);y=args[1]+(relative?y:0);}
    else if(upper==='H')x=args[0]+(relative?x:0);else if(upper==='V')y=args[0]+(relative?y:0);else return null;
    if(upper==='M'){current={points:[],closed:false};out.push(current);command=relative?'l':'L';}
    if(!current)return null;current.points.push({x,y});
  }
  return out;
}
const only=(a:Record<string,string>,allowed:string[])=>Object.keys(a).every(k=>allowed.includes(k));
function rectangular(node:XastElement):BBox|null {
  const a=node.attributes;
  if(!['#fff','#ffffff','white'].includes(a.fill?.toLowerCase())||!only(a,['fill','x','y','width','height','d','id']))return null;
  if(node.name==='rect'){
    const [x,y,w,h]=[a.x??'0',a.y??'0',a.width,a.height].map(Number);
    return [x,y,w,h].every(Number.isFinite)&&w>0&&h>0?{minX:x,minY:y,maxX:x+w,maxY:y+h}:null;
  }
  if(node.name!=='path')return null;const paths=linearPaths(a.d??'');
  if(paths?.length!==1||!paths[0].closed)return null;
  const p=[...paths[0].points];if(p.length===5&&p[0].x===p[4].x&&p[0].y===p[4].y)p.pop();
  if(p.length!==4||p.some((q,i)=>q.x!==p[(i+1)%4].x&&q.y!==p[(i+1)%4].y))return null;
  const bounds={minX:Math.min(...p.map(p=>p.x)),minY:Math.min(...p.map(p=>p.y)),maxX:Math.max(...p.map(p=>p.x)),maxY:Math.max(...p.map(p=>p.y))};
  return new Set(p.map(p=>`${p.x},${p.y}`)).size===4?bounds:null;
}
function recognize(node:XastElement):{bounds:BBox;marks:number[][]}|null {
  const a=node.attributes;
  if(!a.id||a.maskUnits!=='userSpaceOnUse'||a.maskContentUnits&&a.maskContentUnits!=='userSpaceOnUse'||a['mask-type']&&a['mask-type']!=='luminance'||a.style&&a.style.replace(/[\s;]/g,'')!=='mask-type:luminance')return null;
  if(!only(a,['id','maskUnits','maskContentUnits','x','y','width','height','style','mask-type']))return null;
  const elements=node.children.filter(n=>n.type==='element');
  if(elements.length<2)return null;const background=rectangular(elements[0]);if(!background)return null;
  const [x,y,w,h]=[a.x,a.y,a.width,a.height].map(Number);if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return null;
  const bounds={minX:Math.max(x,background.minX),minY:Math.max(y,background.minY),maxX:Math.min(x+w,background.maxX),maxY:Math.min(y+h,background.maxY)},marks:number[][]=[];
  for(const child of elements.slice(1)){
    const a=child.attributes,r=Number(a['stroke-width'])/2;
    if(child.name!=='path'||a.fill!=='none'||!['#000','#000000','black'].includes(a.stroke?.toLowerCase())||a['stroke-linecap']!=='round'||!Number.isFinite(r)||r<=0)return null;
    if(!only(a,['id','d','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','transform']))return null;
    const paths=linearPaths(a.d??''),m=transform(a.transform);if(!paths||!m)return null;
    for(const path of paths){
      if(path.closed||path.points.length>2&&a['stroke-linejoin']!=='round')return null;
      for(let i=1;i<path.points.length;i++){const p=path.points[i-1],q=path.points[i];marks.push([p.x,p.y,q.x,q.y,r,m.a,m.b,m.c,m.d,m.e,m.f]);}
    }
  }
  return marks.length?{bounds,marks}:null;
}
export function vectorizeEraserMasks(source:string,worldScale=1):string {
  if(!/<mask\b/.test(source))return source;
  let changed=false;
  try{
    const result=optimize(source,{plugins:[{name:'vectorEraserMasks',fn:root=>{
      const masks:XastElement[]=[],uses=new Map<string,Array<{node:XastElement;scale:number}>>();let unsupported=false;
      const walk=(parent:XastParent,scale:number,paintInherited=false)=>{for(const node of parent.children){
        if(node.type!=='element')continue;const a=node.attributes,m=transform(a.transform);
        if(node.name==='style'||a.class||a.style&&/(?:^|;)\s*(?:mask|transform|stroke-opacity|fill-opacity|filter)\s*:/.test(a.style))unsupported=true;
        let s=m?scale*matrixScale(m):NaN;
        if(node.name==='svg'&&a.viewBox){const box=numbers(a.viewBox),w=Number(a.width),h=Number(a.height);s*=box?.length===4&&box[2]>0&&box[3]>0&&w>0&&h>0?Math.max(w/box[2],h/box[3]):NaN;}
        if(node.name==='mask'&&!paintInherited)masks.push(node);
        if(a.mask){const id=/^url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)$/.exec(a.mask)?.[1];if(id){const rows=uses.get(id)??[];rows.push({node,scale:a['clip-path']?NaN:s});uses.set(id,rows);}else unsupported=true;}
        const inherited=paintInherited||!!(a.stroke&&a.stroke!=='none')||['opacity','stroke-opacity','fill-opacity'].some(k=>a[k]!==undefined&&Number(a[k])!==1)||!!a.filter||!!(a.style&&/(?:^|;)\s*(?:stroke|opacity|stroke-opacity|fill-opacity|filter)\s*:/.test(a.style));
        walk(node,s,inherited);
      }};walk(root,worldScale);if(unsupported)return null;
      for(const mask of masks){
        const refs=uses.get(mask.attributes.id),data=recognize(mask);
        if(!refs?.length||!data||refs.some(r=>!Number.isFinite(r.scale)))continue;
        const scale=Math.max(...refs.map(r=>r.scale)),{bounds,marks}=data;
        const d=eraserClipPath(bounds,marks,scale);
        mask.name='clipPath';mask.attributes={id:mask.attributes.id,clipPathUnits:'userSpaceOnUse'};
        mask.children=[{type:'element',name:'path',attributes:{d,transform:`translate(${bounds.minX} ${bounds.minY})`,'clip-rule':'evenodd'},children:[]}];
        for(const {node} of refs){node.attributes['clip-path']=node.attributes.mask;delete node.attributes.mask;}changed=true;
      }
      return null;
    }}]}).data;
    return changed?result:source;
  }catch{return source;}
}
