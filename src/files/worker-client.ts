// Worker создаётся по требованию; отмена завершает его даже внутри синхронного расчёта.
import type { DocumentData } from './codec.ts';
import type { FileWriteStats } from './file-stats.ts';
import { cancelled, checkCancelled } from '../core/cancel.ts';
type Kind = 'svg' | 'svg-file' | 'visual' | 'recovery' | 'decode' | 'native' | 'png';
interface Pending { resolve(value: unknown): void; reject(error: Error): void; clean(): void; chunk?: (data: Uint8Array) => Promise<void> }

export class DocumentWorker {
  private worker: Worker | null = null;
  private seq = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private pending = new Map<number, Pending>();

  run<T>(kind: Kind, data: unknown, signal?: AbortSignal): Promise<T> { return this.request<T>(kind, data, undefined, signal); }
  streamSvg(data: DocumentData, chunk: (data: Uint8Array) => Promise<void>, signal?: AbortSignal): Promise<FileWriteStats> { return this.request<FileWriteStats>('svg', data, chunk, signal); }
  streamRecovery(data: DocumentData, chunk: (data: Uint8Array) => Promise<void>): Promise<void> { return this.request<void>('recovery', data, chunk); }

  dispose(error: Error = cancelled()): void {
    clearTimeout(this.idleTimer);
    const worker = this.worker; this.worker = null; worker?.terminate();
    for (const task of this.pending.values()) { task.clean(); task.reject(error); }
    this.pending.clear();
  }

  private async request<T>(kind: Kind, data: unknown, chunk?: (data: Uint8Array) => Promise<void>, signal?: AbortSignal): Promise<T> {
    checkCancelled(signal); clearTimeout(this.idleTimer);
    if (!this.worker) {
      const worker = this.worker = new Worker('./document-worker.js');
      worker.onmessage = ({ data }) => {
        if (worker !== this.worker) return;
        const task = this.pending.get(data.id);
        if (!task) return;
        if (data.chunk && task.chunk) {
          const ack = (error?: string) => {
            if (worker === this.worker && this.pending.has(data.id)) worker.postMessage({ id: data.id, phase: 'ack', error });
          };
          void Promise.resolve().then(() => task.chunk!(data.chunk)).then(() => ack(), error => ack(String(error)));
          return;
        }
        this.pending.delete(data.id); task.clean();
        if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
        if (!this.pending.size) this.idleTimer = setTimeout(() => {
          if (!this.pending.size && this.worker === worker) this.dispose();
        }, 5000);
      };
      worker.onerror = () => { if (worker === this.worker) this.dispose(new Error('Не удалось обработать документ.')); };
    }
    const worker = this.worker;
    return new Promise<T>((resolve, reject) => {
      const id = ++this.seq, abort = () => this.dispose(signal?.reason ?? cancelled());
      const clean = () => signal?.removeEventListener('abort', abort);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, clean, chunk });
      signal?.addEventListener('abort', abort, { once: true });
      void this.send(worker, id, kind, data, !!chunk).catch(error => {
        const task = this.pending.get(id);
        if (task) { this.pending.delete(id); task.clean(); task.reject(error); }
      });
    });
  }

  private async send(worker: Worker, id: number, kind: Kind, data: unknown, stream: boolean): Promise<void> {
    if ((kind === 'svg' || kind === 'svg-file' || kind === 'visual' || kind === 'recovery') && (data as DocumentData).objects.length > 256) {
      const { objects, ...fields } = data as DocumentData;
      worker.postMessage({ id, kind, phase: 'start', data: fields, stream });
      for (let at = 0; at < objects.length; at += 256) {
        if (worker !== this.worker || !this.pending.has(id)) return;
        worker.postMessage({ id, phase: 'append', data: objects.slice(at, at + 256) });
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      if (worker === this.worker && this.pending.has(id)) worker.postMessage({ id, phase: 'end' });
    } else if (kind === 'png') worker.postMessage({ id, kind, data }, [(data as {bytes: Uint8Array}).bytes.buffer as ArrayBuffer]);
    else worker.postMessage({ id, kind, data, stream });
  }
}
