// Общая отмена асинхронных вычислений; не применяется к уже начатой атомарной замене файла.
import { t } from './language.ts';
export const cancelled = (): DOMException => new DOMException(t('error.cancelled'), 'AbortError');
export const isCancelled = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';
export function checkCancelled(signal?: AbortSignal): void { signal?.throwIfAborted(); }

export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? cancelled());
    const clean = () => signal.removeEventListener('abort', abort);
    promise.then(value => { clean(); signal.aborted ? abort() : resolve(value); }, error => { clean(); reject(error); });
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}

/** Даём кнопке отмены обработаться между синхронными этапами/порциями. */
export async function cancellationPoint(signal?: AbortSignal): Promise<void> {
  checkCancelled(signal);
  if (signal) await new Promise<void>(resolve => setTimeout(resolve, 0));
  checkCancelled(signal);
}
