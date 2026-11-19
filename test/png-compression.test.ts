// Независимый PNG-декодер проверяет неизменность пикселей на всех уровнях сжатия.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {recompressPng} from '../src/files/png-compression.ts';
const UPNG=createRequire(import.meta.url)('@pdf-lib/upng').default as typeof import('@pdf-lib/upng');

test('PNG: 0–9 меняет только сжатие, пиксели и прозрачность совпадают',()=>{
  const w=160,h=90,pixels=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=4*(y*w+x);pixels[i]=x%31;pixels[i+1]=y%37;pixels[i+2]=(x+y)%53;pixels[i+3]=x%7===0?80:255;}
  const png=new Uint8Array(UPNG.encode([pixels.buffer],w,h,0)),sizes:number[]=[];
  for(let level=0;level<=9;level++){
    const result=recompressPng(png,level),decoded=UPNG.decode(result.buffer as ArrayBuffer);
    assert.equal(decoded.width,w);assert.equal(decoded.height,h);
    assert.deepEqual(new Uint8Array(UPNG.toRGBA8(decoded)[0]),pixels);sizes.push(result.length);
  }
  assert.ok(sizes[6]<sizes[0]/4&&sizes[9]<sizes[0]/4,'сжатие действует');
  assert.throws(()=>recompressPng(png,-1));assert.throws(()=>recompressPng(png,10));assert.throws(()=>recompressPng(png,.5));assert.throws(()=>recompressPng(png.subarray(0,25),6));
});
