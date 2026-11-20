// Разделение SVG сохраняет пиксели, локальные ссылки, группы и результат повторного открытия.
const {app,test}=window.__phaint,native=window.phaintNative;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
app.settings.grid.enabled=false;app.renderer.invalidateScene();
const tiny=document.createElement('canvas');tiny.width=20;tiny.height=10;const tc=tiny.getContext('2d');tc.fillStyle='#315ca8';tc.fillRect(0,0,20,10);
const cases=[
  {name:'наследование-defs',count:2,body:'<defs color="#c9514e"><linearGradient id="g"><stop stop-color="currentColor"/><stop offset="1" stop-color="#315ca8"/></linearGradient></defs><rect x="40" y="40" width="250" height="60" fill="url(#g)"/><rect x="40" y="180" width="120" height="60" fill="#79ad65"/>'},
  {name:'группы',count:4,body:`<defs><clipPath id="clip"><circle cx="90" cy="70" r="40"/></clipPath><mask id="mask"><rect width="400" height="300" fill="white"/><circle cx="270" cy="60" r="15" fill="black"/></mask></defs><g clip-path="url(#clip)" fill="#c9514e"><rect x="20" y="20" width="130" height="100"/><circle cx="100" cy="100" r="40"/></g><g mask="url(#mask)" fill="#79ad65"><rect x="200" y="20" width="120" height="90"/></g><image x="40" y="180" width="120" height="60" href="${tiny.toDataURL()}"/><text x="200" y="220" font-size="25" visibility="hidden">скрыто<tspan x="200" visibility="visible">Видно</tspan></text>`},
  {name:'масштаб',count:3,attrs:'viewBox="0 0 200 150"',body:'<defs><symbol id="star" viewBox="0 0 20 20"><path fill="#c9514e" d="M10 0L13 7 20 10 13 13 10 20 7 13 0 10 7 7Z"/></symbol></defs><g transform="translate(15 10) rotate(10)"><use href="#star" x="10" y="10" width="35" height="35"/><use href="#star" x="100" y="90" width="50" height="40"/></g><rect x="10%" y="50%" width="25%" height="15%" rx="6" fill="#315ca8"/>'},
  {name:'прозрачный-корень',count:1,attrs:'opacity=".6"',body:'<rect x="40" y="50" width="200" height="70" fill="#315ca8"/><rect x="140" y="80" width="200" height="70" fill="#c9514e"/>'},
  {name:'css',count:1,body:'<style>path:first-of-type{fill:#315ca8}path+path{fill:#c9514e}</style><path d="M40 40h120v60H40Z"/><path d="M40 180h120v60H40Z"/>'},
  {name:'фильтр',count:1,body:'<defs><filter id="blur"><feGaussianBlur stdDeviation="5"/></filter></defs><rect x="40" y="40" width="100" height="60" fill="#315ca8" filter="url(#blur)"/><rect x="40" y="180" width="100" height="60" fill="#c9514e"/>'},
  {name:'обводка-use',count:1,body:'<defs><path id="line" d="M0 0h100" fill="none" stroke="#315ca8" stroke-width="30"/></defs><use href="#line" x="50" y="60"/><use href="#line" x="50" y="200"/>'},
];
const pageWidth=app.view.width/app.view.dpr*.8;
const compare=async(source,bounds=[0,0,pageWidth,pageWidth*300/400])=>{
  await test.idle();const img=new Image(),url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));img.src=url;await img.decode();
  const scene=document.getElementById('scene'),c=document.createElement('canvas');c.width=scene.width;c.height=scene.height;
  const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,c.width,c.height);const m=app.view.matrix();g.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);g.drawImage(img,...bounds);URL.revokeObjectURL(url);
  const a=scene.getContext('2d').getImageData(0,0,c.width,c.height).data,b=g.getImageData(0,0,c.width,c.height).data;
  let delta=0,ink=0;for(let i=0;i<a.length;i+=4){if(b[i]<240||b[i+1]<240||b[i+2]<240)ink++;if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>45)delta++;}
  return delta/Math.max(ink,1);
};
const results=[];
for(const c of cases){
  const source=`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" ${c.attrs??''}>${c.body}</svg>`;
  await native.testFiles('prepare',{name:c.name+'.svg',text:source});await native.testFiles('choices',{choices:{opens:[c.name+'.svg'],unsaved:['discard']}});assert(await app.files.open(),'открытие '+c.name);
  assert(app.doc.size===c.count,c.name+': число объектов '+app.doc.size);
  let error=await compare(source);assert(error<.05,c.name+': пиксели '+error);
  if(c.name==='группы')await test.shot('groups');
  await native.testFiles('choices',{choices:{saves:[c.name+'-сохранено.svg']}});assert(await app.files.save(true),'сохранение '+c.name);
  const saved=await native.testFiles('read',{name:c.name+'-сохранено.svg'}),parsed=new DOMParser().parseFromString(saved,'image/svg+xml'),ids=[...parsed.querySelectorAll('[id]')].map(e=>e.id);
  assert(new Set(ids).size===ids.length,c.name+': определения SVG независимы');
  const exported=await compare(saved,parsed.documentElement.getAttribute('viewBox').split(/\s+/).map(Number));
  assert(exported<.05,c.name+': видимый SVG вне Phaint '+exported);
  await native.testFiles('choices',{choices:{opens:[c.name+'-сохранено.svg']}});assert(await app.files.open(),'повторное открытие '+c.name);assert(app.doc.size===c.count,'состав сохранён '+c.name);
  error=await compare(source);assert(error<.05,c.name+': повторное открытие меняет пиксели '+error);results.push({name:c.name,count:c.count,error});
}
return {ok:true,cases:results};
