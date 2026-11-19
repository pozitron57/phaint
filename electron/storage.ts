// Надёжная запись: отдельный временный файл, fsync, атомарная замена. Старый файл жив до rename.
// Очередь предотвращает гонки сохранения настроек и резервных копий.
import { open, rename, rm, mkdir, stat } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_FILE_BYTES } from '../src/files/codec.ts';

/** Потоковая запись большого SVG: на диске всё ещё видна прежняя версия до commit(). */
export class AtomicWriter {
  private file: string;
  private temp: string;
  private handle: Awaited<ReturnType<typeof open>> | null;
  private bytes = 0;

  private constructor(file: string, temp: string, handle: Awaited<ReturnType<typeof open>>) {
    this.file = file; this.temp = temp; this.handle = handle;
  }

  static async create(file: string): Promise<AtomicWriter> {
    await mkdir(dirname(file), { recursive: true });
    const temp = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`);
    let mode = 0o600;
    try { mode = (await stat(file)).mode & 0o777; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    return new AtomicWriter(file, temp, await open(temp, 'wx', mode));
  }

  async write(data: Uint8Array): Promise<void> {
    this.bytes += data.byteLength;
    if (this.bytes > MAX_FILE_BYTES) throw new Error('SVG больше 256 МБ.');
    if (!this.handle) throw new Error('Запись файла уже завершена.');
    await this.handle.writeFile(data);
  }

  async commit(): Promise<void> {
    if (!this.handle) throw new Error('Запись файла уже завершена.');
    await this.handle.sync(); await this.handle.close(); this.handle = null;
    await rename(this.temp, this.file);
  }

  async abort(): Promise<void> {
    await this.handle?.close(); this.handle = null;
    await rm(this.temp, { force: true });
  }
}

export async function atomicWrite(file: string, data: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temp = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`);
  let mode = 0o600;
  try { mode = (await stat(file)).mode & 0o777; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  try {
    const handle = await open(temp, 'wx', mode);
    try { await handle.writeFile(data, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}

export async function readLimited(file: string): Promise<string> {
  const handle = await open(file, 'r');
  try {
    if ((await handle.stat()).size > MAX_FILE_BYTES) throw new Error('Файл больше 256 МБ.');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}

export class WriteQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
  async idle(): Promise<void> { await this.tail; }
}

export async function readOptional(file: string): Promise<string | null> {
  try { return await readLimited(file); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
