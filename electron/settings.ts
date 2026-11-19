// Общие настройки на диске: окно записывает только свои изменения относительно прочитанного снимка.
// Так закрытие старого окна не возвращает чужие цвета, толщины и назначения клавиш назад.
import { mergeSettings, type Settings } from '../src/core/settings.ts';
import { atomicWrite, readOptional, WriteQueue } from './storage.ts';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);

export function mergeWindowSettings(current: unknown, before: unknown, after: unknown): unknown {
  if (JSON.stringify(before) === JSON.stringify(after)) return current;
  if (!record(before) || !record(after)) return after;
  const result: RecordValue = record(current) ? { ...current } : {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (!Object.hasOwn(after, key)) delete result[key];
    else result[key] = mergeWindowSettings(result[key], before[key], after[key]);
  }
  return result;
}

export class WindowSettings {
  private file: string;
  private current: Promise<Settings>;
  private snapshots = new Map<number, Settings>();
  private queue = new WriteQueue();

  constructor(file: string, testing: boolean) {
    this.file = file;
    this.current = (testing ? Promise.resolve(null) : readOptional(file).then(text => text ? JSON.parse(text) : null))
      .catch(() => null).then(mergeSettings);
  }

  load(owner: number): Promise<Settings> {
    return this.queue.run(async () => {
      const settings = structuredClone(await this.current);
      this.snapshots.set(owner, settings);
      return structuredClone(settings);
    });
  }

  save(owner: number, data: unknown): Promise<void> {
    return this.queue.run(async () => {
      const current = await this.current, before = this.snapshots.get(owner) ?? current;
      const after = mergeSettings(data);
      const next = mergeSettings(mergeWindowSettings(current, before, after));
      await atomicWrite(this.file, JSON.stringify(next, null, 2));
      this.current = Promise.resolve(next);
      this.snapshots.set(owner, after);
    });
  }

  forget(owner: number): void { void this.queue.run(async () => { this.snapshots.delete(owner); }); }
  idle(): Promise<void> { return this.queue.idle(); }
}
