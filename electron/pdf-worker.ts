// PDF разбирается/сжимается в отдельном потоке, не задерживая окно и файловые диалоги.
import { parentPort } from 'node:worker_threads';
import { optimizePdf } from './pdf-optimize.ts';
parentPort!.once('message',async(bytes:Uint8Array)=>{
  try{const result=await optimizePdf(bytes);parentPort!.postMessage({bytes:result},[result.buffer as ArrayBuffer]);}
  catch(error){parentPort!.postMessage({error:String(error)});}
});
