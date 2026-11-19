// Сборка страниц исходного PDF и пометок не занимает главный процесс Electron.
import { parentPort } from 'node:worker_threads';
import { composePdf, type PdfComposition } from '../src/files/pdf-compose.ts';
parentPort!.once('message',async(data:PdfComposition)=>{
  try{const bytes=await composePdf(data);parentPort!.postMessage({bytes},[bytes.buffer as ArrayBuffer]);}
  catch(error){parentPort!.postMessage({error:error instanceof Error?error.message:String(error)});}
});
