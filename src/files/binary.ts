// Двоичные вложения SVG; без spread больших буферов и без сетевых запросов.
export function base64(bytes:Uint8Array):string {
  let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);
}
export function fromBase64(value:string):Uint8Array {return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export const imageTypes:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp'};
