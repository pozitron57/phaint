// Фоновая сериализация. Снимки приходят небольшими пачками, SVG уходит порциями с подтверждением
// записи: большой документ не копируется целиком в UI-поток и не заполняет очередь сообщений.
import { isLanguage, setLanguage } from '../core/language.ts';
import { decodeData, encodeData, nativeSvgData, type DocumentData } from './codec.ts';
import { recompressPng } from './png-compression.ts';
import { serializeSvg } from './svg-export.ts';
import { utf8Size } from './file-stats.ts';

interface Job { id: number; kind: string; data: DocumentData; stream: boolean }
const jobs = new Map<number, Job>();
const acknowledgements = new Map<number, { resolve(): void; reject(error: Error): void }>();
async function run(id: number, kind: string, data: unknown, stream = false): Promise<void> {
  try {
    if(kind==='png'){
      const {bytes,level}=data as {bytes:Uint8Array;level:number},result=recompressPng(bytes,level);
      self.postMessage({id,result},{transfer:[result.buffer]});return;
    }
    if (stream) {
      const result = kind === 'svg' ? await serializeSvg(data as DocumentData,true) : {text:encodeData(data as DocumentData)};
      const {text}=result,encoder = new TextEncoder();let bytes=0;
      for (let at = 0; at < text.length;) {
        let end = Math.min(at + 128 * 1024, text.length);
        // Не разрывать суррогатную пару между порциями UTF-8 (например, символ в тексте SVG).
        const last = text.charCodeAt(end - 1);
        if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
        const chunk = encoder.encode(text.slice(at, end));
        bytes+=chunk.byteLength;
        await new Promise<void>((resolve, reject) => {
          acknowledgements.set(id, { resolve, reject });
          self.postMessage({ id, chunk }, { transfer: [chunk.buffer] });
        });
        at = end;
      }
      self.postMessage({ id, result:kind==='svg'?{bytes,processing:result.processing}:null });
    } else {
      if(kind==='svg-file'){
        const {text,processing}=await serializeSvg(data as DocumentData,true);
        self.postMessage({id,result:{text,stats:{bytes:utf8Size(text),processing}}});return;
      }
      const result = kind === 'svg' ? (await serializeSvg(data as DocumentData,true)).text
        : kind === 'visual' ? (await serializeSvg(data as DocumentData,false)).text
        : kind === 'recovery' ? encodeData(data as DocumentData)
        : kind === 'decode' ? decodeData(data as string)
        : await nativeSvgData(data as string);
      self.postMessage({ id, result });
    }
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
}
self.onmessage = (event: MessageEvent) => {
  if(isLanguage(event.data.language))setLanguage(event.data.language);
  const { id, kind, data, phase, stream, error } = event.data;
  if (phase === 'ack') {
    const ack = acknowledgements.get(id); acknowledgements.delete(id);
    if (error) ack?.reject(new Error(error)); else ack?.resolve();
  } else if (phase === 'start') jobs.set(id, { id, kind, stream, data: { ...data, objects: [] } });
  else if (phase === 'append') jobs.get(id)?.data.objects.push(...data);
  else if (phase === 'end') {
    const job = jobs.get(id); jobs.delete(id);
    if (job) void run(id, job.kind, job.data, job.stream);
  } else void run(id, kind, data, stream);
};
