// Настоящий экспорт PDF: маски ручки, внешнего SVG и отражённого вектора остаются путями.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const bounds={minX:0,minY:0,maxX:150,maxY:90};
const foreign={kind:'svg',id:1,z:1,ox:20,oy:20,width:180,height:110,bbox:{minX:20,minY:20,maxX:200,maxY:130},
 source:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="110"><defs><linearGradient id="g"><stop stop-color="#315ca8"/><stop offset="1" stop-color="#87b269"/></linearGradient></defs><rect width="180" height="110" fill="url(#g)" opacity=".8"/></svg>',
 erasures:[[30,35,115,80,12],[60,25,120,70,15],[125,22,125,22,11]]};
const vector={kind:'vector',id:2,z:2,ox:0,oy:160,matrix:{a:-1,b:.15,c:.3,d:1,e:380,f:0},bounds,bbox:{minX:230,minY:160,maxX:407,maxY:272.5},
 d:'M0 0H150V90H0ZM65 35H85V55H65Z',fill:'#c9514e',stroke:'none',strokeWidth:0,fillRule:'evenodd',linecap:'butt',linejoin:'miter',opacity:1,
 erasures:[[30,20,90,75,10],[20,30,90,60,8,-1,.2,.3,1,130,-10]]};
const stroke={kind:'stroke',id:3,z:3,ox:20,oy:170,pts:Float32Array.of(0,0,26,60,40,16,110,10,24,150,60,30),color:'#315ca8',bbox:{minX:5,minY:155,maxX:185,maxY:245},erasures:[[55,30,120,30,7],[70,35,110,20,8]]};
const flattened={...foreign,id:4,z:4,ox:230,bbox:{minX:230,minY:20,maxX:410,maxY:130},erasures:[],source:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="110" viewBox="0 0 180 110"><defs><mask id="old" x="0" y="0" width="180" height="110" maskUnits="userSpaceOnUse"><path fill="white" d="M0 0H180V110H0Z"/><path fill="none" stroke="black" stroke-width="20" stroke-linecap="round" d="M30 30h50m-10 0 60 60m0 0h0"/></mask></defs><g mask="url(#old)"><rect width="180" height="110" fill="#87b269"/></g></svg>'};
app.doc.replace([foreign,vector,stroke,flattened]);app.settings.grid.enabled=app.settings.grid.save=true;app.settings.grid.step=20;
const data=app.files.snapshot(),original=await app.files.worker.run('svg',data),canvases=[];
for(const vectorMasks of [false,true]){
 const svg=await app.files.worker.run('visual',{...data,exportOptions:{quality:'high',editable:false,vectorMasks}});
 assert(vectorMasks?!svg.includes('<mask '):svg.includes('<mask '),'нужный способ стирания');
 const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
 const canvas=document.createElement('canvas');canvas.width=Number(root.getAttribute('width'))*4;canvas.height=Number(root.getAttribute('height'))*4;
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();image.src=url;await image.decode();
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvases.push(canvas);
}
const a=canvases[0].getContext('2d').getImageData(0,0,canvases[0].width,canvases[0].height).data,b=canvases[1].getContext('2d').getImageData(0,0,canvases[1].width,canvases[1].height).data;
let sum=0,changed=0;for(let i=0;i<a.length;i+=4){let max=0;for(let k=0;k<3;k++){const d=Math.abs(a[i+k]-b[i+k]);sum+=d;max=Math.max(max,d);}if(max>32)changed++;}
const mae=sum/(a.length/4*3),fraction=changed/(a.length/4);assert(mae<.25&&fraction<.002,`маска и обрезка совпадают: ${mae}, ${fraction}`);
await native.testFiles('choices',{choices:{saves:['векторное-стирание.pdf']}});const pending=app.files.export(),dialog=document.querySelector('.export-dialog');
dialog.querySelector('[data-format="pdf"]').click();
[...dialog.querySelectorAll('button')].at(-1).click();assert(await pending,'PDF записан через обычный экспорт');
const bytes=await native.testFiles('readBytes',{name:'векторное-стирание.pdf'}),path=await native.testFiles('prepareBytes',{name:'проверка-масок.pdf',bytes:Uint8Array.from(bytes)});
assert(await app.files.worker.run('svg',app.files.snapshot())===original,'рабочий документ не изменился');
const preview=document.createElement('div');preview.style.cssText='position:fixed;inset:0;background:white;z-index:10000;display:flex;align-items:center;gap:12px;padding:16px';
for(const [i,canvas] of canvases.entries()){const column=document.createElement('div');column.style.width='49%';column.textContent=i?'Векторное стирание':'Прежняя маска';canvas.style.width='100%';column.append(canvas);preview.append(column);}document.body.append(preview);await test.shot('comparison');preview.remove();
return {ok:true,path,mae,fraction};
