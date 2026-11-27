// Сборка страниц исходного PDF и пометок не занимает главный процесс Electron.
import { setLanguage } from '../src/core/language.ts';
import { parentPort, workerData } from 'node:worker_threads';
import { composePdf, type PdfComposition } from '../src/files/pdf-compose.ts';
setLanguage(workerData);
parentPort!.once('message',async(data:PdfComposition)=>{
  try{const bytes=await composePdf(data);parentPort!.postMessage({bytes},[bytes.buffer as ArrayBuffer]);}
  catch(error){parentPort!.postMessage({error:error instanceof Error?error.message:String(error)});}
});
