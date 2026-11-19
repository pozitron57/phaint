// Меняем только zlib-поток PNG. Фильтры, пиксели и цветовые профили остаются прежними.
// Вызывается в Worker; рабочий холст не ждёт распаковки и сжатия больших картинок.
import {unzlibSync,zlibSync} from 'fflate';

const signature=[137,80,78,71,13,10,26,10];
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes:Uint8Array):number {let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function recompressPng(bytes:Uint8Array,level:number):Uint8Array {
  if(!Number.isInteger(level)||level<0||level>9)throw new Error('Степень сжатия PNG должна быть от 0 до 9.');
  if(!signature.every((b,i)=>bytes[i]===b))throw new Error('Повреждён PNG.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks:Array<{type:string;start:number;end:number}>=[],idats:Uint8Array[]=[];
  let total=0,expected=0,finished=false;
  for(let at=8;at<bytes.length;){
    if(at+12>bytes.length)throw new Error('Повреждён PNG.');
    const length=view.getUint32(at),end=at+length+12;if(end>bytes.length)throw new Error('Повреждён PNG.');
    const type=String.fromCharCode(...bytes.subarray(at+4,at+8));chunks.push({type,start:at,end});
    if(type==='IHDR'){
      const w=view.getUint32(at+8),h=view.getUint32(at+12),depth=bytes[at+16],color=bytes[at+17];
      const channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[color];
      if(length!==13||w<1||h<1||w>12000||h>12000||w*h>24000000||!channels||![1,2,4,8,16].includes(depth)||bytes[at+20]!==0)throw new Error('Неподдерживаемый размер или формат PNG.');
      expected=h*(1+Math.ceil(w*channels*depth/8));
    }
    if(type==='IDAT'){const data=bytes.subarray(at+8,end-4);idats.push(data);total+=data.length;}
    if(type==='IEND'){finished=true;break;}at=end;
  }
  if(!finished||!expected||!idats.length||expected>192012000)throw new Error('Повреждён PNG.');
  const compressed=new Uint8Array(total);let at=0;for(const data of idats){compressed.set(data,at);at+=data.length;}
  const raw=unzlibSync(compressed,{out:new Uint8Array(expected)});
  if(raw.length!==expected)throw new Error('Неверная длина данных PNG.');
  const packed=zlibSync(raw,{level:level as 0|1|2|3|4|5|6|7|8|9});
  const chunk=new Uint8Array(packed.length+12),cv=new DataView(chunk.buffer);cv.setUint32(0,packed.length);chunk.set([73,68,65,84],4);chunk.set(packed,8);cv.setUint32(chunk.length-4,crc32(chunk.subarray(4,-4)));
  const size=8+chunk.length+chunks.filter(c=>c.type!=='IDAT').reduce((sum,c)=>sum+c.end-c.start,0),result=new Uint8Array(size);
  result.set(signature);at=8;let added=false;
  for(const c of chunks){
    if(c.type==='IDAT'){if(added)continue;result.set(chunk,at);at+=chunk.length;added=true;}
    else{result.set(bytes.subarray(c.start,c.end),at);at+=c.end-c.start;}
  }
  return result;
}
