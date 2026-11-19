// Короткие квадратичные/кубические кривые вместо готового контура. Не фильтр пера.
// Проверяется вся дуга между отсчётами: выпуклая оболочка разности двух кривых
// ограничивает ошибку в обе стороны, включая выбросы между контрольными замерами.
export interface ContourPoint { x:number; y:number; tolerance:number }
export interface Curve { p0:ContourPoint; p1:ContourPoint; p2:ContourPoint; p3:ContourPoint; line:boolean; tolerance:number; quadratic?:ContourPoint }
type XY={x:number;y:number};
const point=(x:number,y:number):ContourPoint=>({x,y,tolerance:0});
const unit=(x:number,y:number):XY=>{const n=Math.hypot(x,y)||1;return {x:x/n,y:y/n};};
const mix=(a:XY,b:XY,t:number):ContourPoint=>point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
export function curvePoint(c:Curve,t:number):ContourPoint {
  const s=1-t;return point(s*s*s*c.p0.x+3*s*s*t*c.p1.x+3*s*t*t*c.p2.x+t*t*t*c.p3.x,s*s*s*c.p0.y+3*s*s*t*c.p1.y+3*s*t*t*c.p2.y+t*t*t*c.p3.y);
}
function derivative(c:Curve,t:number):XY {
  const s=1-t;return {x:3*(s*s*(c.p1.x-c.p0.x)+2*s*t*(c.p2.x-c.p1.x)+t*t*(c.p3.x-c.p2.x)),y:3*(s*s*(c.p1.y-c.p0.y)+2*s*t*(c.p2.y-c.p1.y)+t*t*(c.p3.y-c.p2.y))};
}
/** Часть кубической кривой, без изменения её формы. */
export function curvePart(c:Curve,a:number,b:number):Curve {
  const p0=curvePoint(c,a),p3=curvePoint(c,b),d0=derivative(c,a),d1=derivative(c,b),h=(b-a)/3;
  return {...c,p0,p1:point(p0.x+h*d0.x,p0.y+h*d0.y),p2:point(p3.x-h*d1.x,p3.y-h*d1.y),p3};
}
function parameters(p:ContourPoint[],a:number,b:number):number[] {
  const u=[0];for(let i=a+1;i<=b;i++)u.push(u.at(-1)!+Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y));
  const length=u.at(-1)!||1;return u.map(v=>v/length);
}
function generate(p:ContourPoint[],a:number,b:number,u:number[],t0:XY,t1:XY):Curve {
  const p0=p[a],p3=p[b];let aa=0,ab=0,bb=0,ax=0,bx=0;
  for(let i=a;i<=b;i++){
    const t=u[i-a],s=1-t,b1=3*s*s*t,b2=3*s*t*t;
    const x=p[i].x-p0.x*(s*s*s+b1)-p3.x*(b2+t*t*t),y=p[i].y-p0.y*(s*s*s+b1)-p3.y*(b2+t*t*t);
    aa+=b1*b1;ab-=b1*b2*(t0.x*t1.x+t0.y*t1.y);bb+=b2*b2;
    ax+=b1*(t0.x*x+t0.y*y);bx-=b2*(t1.x*x+t1.y*y);
  }
  const determinant=aa*bb-ab*ab,length=Math.hypot(p3.x-p0.x,p3.y-p0.y);
  let alpha=determinant?((ax*bb-bx*ab)/determinant):length/3,beta=determinant?((aa*bx-ab*ax)/determinant):length/3;
  if(alpha<length*1e-6||beta<length*1e-6||alpha>length*3||beta>length*3)alpha=beta=length/3;
  let tolerance=Infinity;for(let i=a;i<=b;i++)tolerance=Math.min(tolerance,p[i].tolerance);
  return {p0,p1:point(p0.x+t0.x*alpha,p0.y+t0.y*alpha),p2:point(p3.x-t1.x*beta,p3.y-t1.y*beta),p3,line:false,tolerance};
}
function quadratic(c:Curve,p:ContourPoint[],a:number,b:number,u:number[]):Curve {
  let xx=0,yy=0,weight=0;
  for(let i=a+1;i<b;i++){
    const t=u[i-a],s=1-t,k=2*s*t;weight+=k*k;
    xx+=k*(p[i].x-s*s*c.p0.x-t*t*c.p3.x);yy+=k*(p[i].y-s*s*c.p0.y-t*t*c.p3.y);
  }
  const q=weight?point(xx/weight,yy/weight):mix(c.p0,c.p3,.5);
  return {...c,p1:mix(c.p0,q,2/3),p2:mix(c.p3,q,2/3),quadratic:q};
}
/** Сопоставление целых дуг, а не только отсчётов: каждый участок остаётся в своей трубке. */
function error(c:Curve,p:ContourPoint[],a:number,b:number,u:number[]):{ratio:number;split:number} {
  let ratio=0,split=(a+b)>>1;
  for(let i=a;i<b;i++){
    const part=curvePart(c,u[i-a],u[i+1-a]),start=p[i],end=p[i+1],limit=Math.min(start.tolerance,end.tolerance)*.72;
    const source=[start,mix(start,end,1/3),mix(start,end,2/3),end],target=[part.p0,part.p1,part.p2,part.p3];
    for(let k=0;k<4;k++){
      const r=Math.hypot(source[k].x-target[k].x,source[k].y-target[k].y)/Math.max(1e-12,limit);
      if(r>ratio){ratio=r;split=Math.max(a+1,Math.min(b-1,i+(k>1?1:0)));}
    }
  }
  return {ratio,split};
}
function reparameterize(c:Curve,p:ContourPoint[],a:number,b:number,u:number[]):number[]|null {
  const result=[0];
  for(let i=a+1;i<b;i++){
    const t=u[i-a],s=1-t,q=curvePoint(c,t),d=derivative(c,t),x=q.x-p[i].x,y=q.y-p[i].y;
    const ddx=6*(s*(c.p2.x-2*c.p1.x+c.p0.x)+t*(c.p3.x-2*c.p2.x+c.p1.x)),ddy=6*(s*(c.p2.y-2*c.p1.y+c.p0.y)+t*(c.p3.y-2*c.p2.y+c.p1.y));
    const denominator=d.x*d.x+d.y*d.y+x*ddx+y*ddy,v=denominator?t-(x*d.x+y*d.y)/denominator:t;
    if(v<=result.at(-1)!||v>=1||!Number.isFinite(v))return null;result.push(v);
  }
  result.push(1);return result;
}
export function fitContour(points:ContourPoint[]):Curve[] {
  const n=points.length;if(n<3)return [];
  const p=[...points,points[0]],corners=new Set<number>(),breaks=new Set([0,n]);
  // Экстремумы фиксированы: кривая не перескакивает через петлю целиком.
  for(const axis of ['x','y'] as const)for(const sign of [-1,1]){
    let at=0;for(let i=1;i<n;i++)if(p[i][axis]*sign>p[at][axis]*sign)at=i;breaks.add(at);
  }
  for(let i=0;i<n;i++){
    const prev=p[(i+n-1)%n],next=p[(i+1)%n],a=unit(p[i].x-prev.x,p[i].y-prev.y),b=unit(next.x-p[i].x,next.y-p[i].y);
    if(a.x*b.x+a.y*b.y<.8660254){corners.add(i);breaks.add(i);}
  }
  const tangent=(i:number,outgoing:boolean):XY=>{
    const at=i%n,prev=p[(at+n-1)%n],next=p[(at+1)%n],a=unit(p[at].x-prev.x,p[at].y-prev.y),b=unit(next.x-p[at].x,next.y-p[at].y);
    return corners.has(at)?(outgoing?b:a):unit(a.x+b.x,a.y+b.y);
  };
  const result:Curve[]=[];
  const fit=(a:number,b:number,depth=0):void=>{
    let u=parameters(p,a,b),curve=generate(p,a,b,u,tangent(a,true),tangent(b,false));
    const line={...curve,p1:mix(p[a],p[b],1/3),p2:mix(p[a],p[b],2/3),line:true};
    if(b===a+1||error(line,p,a,b,u).ratio<=1){result.push(line);return;}
    // Квадратичная Безье короче в SVG; допустима лишь с той же проверкой всей дуги.
    const q=quadratic(curve,p,a,b,u);if(error(q,p,a,b,u).ratio<=1){result.push(q);return;}
    let failure=error(curve,p,a,b,u);
    for(let i=0;i<3&&failure.ratio>1&&failure.ratio<16;i++){
      const next=reparameterize(curve,p,a,b,u);if(!next)break;
      u=next;curve=generate(p,a,b,u,tangent(a,true),tangent(b,false));failure=error(curve,p,a,b,u);
    }
    if(failure.ratio<=1){result.push(curve);return;}
    const split=depth<24?failure.split:(a+b)>>1;fit(a,split,depth+1);fit(split,b,depth+1);
  };
  const indices=[...breaks].sort((a,b)=>a-b);for(let i=1;i<indices.length;i++)if(indices[i]>indices[i-1])fit(indices[i-1],indices[i]);
  return result;
}

/** Координаты округляются до перевода в относительные; тонкие места получают больше знаков. */
export function curvesSvg(curves:Curve[],precision:number):string|null {
  if(!curves.length)return null;
  const digits=curves.map(c=>Math.min(8,Math.max(precision,Math.ceil(-Math.log10(Math.max(c.tolerance,1e-8)*.12)))));
  const rounded=(p:XY,d:number):XY=>{const factor=10**d;return {x:Math.round(p.x*factor)/factor,y:Math.round(p.y*factor)/factor};};
  const ends=curves.map((c,i)=>rounded(c.p0,Math.max(digits[i],digits[(i+curves.length-1)%curves.length])));
  const num=(v:number)=>String(Number(v.toFixed(8))).replace(/^0\./,'.').replace(/^-0\./,'-.');
  const pair=(p:XY)=>num(p.x)+(p.y<0?'':' ')+num(p.y),relative=(p:XY,o:XY)=>pair({x:p.x-o.x,y:p.y-o.y});
  let path='M'+pair(ends[0]),previous='';
  for(let i=0;i<curves.length;i++){
    const c=curves[i],start=ends[i],end=ends[(i+1)%curves.length];let command:string,values:string;
    if(c.line){
      if(start.x===end.x&&start.y===end.y)continue;
      if(start.x===end.x){command='v';values=num(end.y-start.y);}else if(start.y===end.y){command='h';values=num(end.x-start.x);}
      else{const abs=pair(end),rel=relative(end,start);command=rel.length<abs.length?'l':'L';values=command==='l'?rel:abs;}
    }else if(c.quadratic){
      const q=rounded(c.quadratic,digits[i]),abs=pair(q)+' '+pair(end),rel=relative(q,start)+' '+relative(end,start);
      command=rel.length<abs.length?'q':'Q';values=command==='q'?rel:abs;
    }else{
      const p1=rounded(c.p1,digits[i]),p2=rounded(c.p2,digits[i]),abs=[p1,p2,end].map(pair).join(' '),rel=[p1,p2,end].map(p=>relative(p,start)).join(' ');
      command=rel.length<abs.length?'c':'C';values=command==='c'?rel:abs;
    }
    path+=(command===previous?(values[0]==='-'?'':' '):command)+values;previous=command;
  }
  return path+'Z';
}
