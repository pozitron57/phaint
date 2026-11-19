// Отмена вычислений действительно завершает Worker; поздние ответы не портят следующую операцию.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DocumentWorker} from '../src/files/worker-client.ts';
import {cancelled} from '../src/core/cancel.ts';
class FakeWorker {
  static instances:FakeWorker[]=[];
  messages:unknown[]=[];terminated=false;
  onmessage:((event:{data:unknown})=>void)|null=null;
  onerror:(()=>void)|null=null;
  constructor(){FakeWorker.instances.push(this);}
  postMessage(data:unknown){this.messages.push(data);}
  terminate(){this.terminated=true;}
  reply(data:unknown){this.onmessage?.({data});}
}
test('Worker: отмена, поздний ответ, новая операция и очистка потока',async()=>{
  const original=globalThis.Worker;globalThis.Worker=FakeWorker as unknown as typeof Worker;
  const client=new DocumentWorker();
  try{
    const signal=new AbortController();
    const first=client.run('native','svg',signal.signal),rejected=assert.rejects(first,{name:'AbortError'});
    const old=FakeWorker.instances.at(-1)!;signal.abort(cancelled());await rejected;assert.ok(old.terminated);
    const second=client.run<string>('native','another');const next=FakeWorker.instances.at(-1)!;
    old.reply({id:2,result:'late'});next.reply({id:2,result:'new'});assert.equal(await second,'new');
    const cancelledSignal=new AbortController();cancelledSignal.abort(cancelled());
    const count=FakeWorker.instances.length;await assert.rejects(client.run('native','x',cancelledSignal.signal),{name:'AbortError'});
    assert.equal(FakeWorker.instances.length,count);
  }finally{client.dispose();globalThis.Worker=original;}
});
test('Worker: после отмены порционной отправки не уходят новые пачки и подтверждения',async()=>{
  const original=globalThis.Worker;globalThis.Worker=FakeWorker as unknown as typeof Worker;
  const client=new DocumentWorker();
  try{
    const signal=new AbortController(),data={objects:new Array(2000).fill({kind:'stroke'})};
    const result=client.run('visual',data,signal.signal),rejected=assert.rejects(result,{name:'AbortError'});
    const worker=FakeWorker.instances.at(-1)!;signal.abort(cancelled());await rejected;
    const count=worker.messages.length;await new Promise(r=>setTimeout(r,15));assert.equal(worker.messages.length,count);
  }finally{client.dispose();globalThis.Worker=original;}
});
