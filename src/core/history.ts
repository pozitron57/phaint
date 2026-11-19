// Отмена и повтор. Правка — пара списков «добавлено / удалено»; отмена применяет её наоборот.
import type { Doc } from './doc.ts';
import type { Obj } from './types.ts';
import { HistoryMemory } from './history-memory.ts';

export const HISTORY_BYTES = 128 * 1024 * 1024;

export interface Edit {
  readonly added: readonly Obj[];
  readonly removed: readonly Obj[];
}

interface Entry { edit: Edit; before: number; after: number; group?: object; redoBefore?: Entry[] }

/** Последовательные правки: промежуточные фрагменты не попадают в итоговую отмену. */
function combine(first: Edit, next: Edit): Edit {
  const added = new Map(first.added.map(o => [o.id, o]));
  const removed = new Map(first.removed.map(o => [o.id, o]));
  for (const o of next.removed) if (!added.delete(o.id)) removed.set(o.id, o);
  for (const o of next.added) added.set(o.id, o);
  return { added: [...added.values()], removed: [...removed.values()] };
}

export class History {
  private doc: Doc;
  private undone: Entry[] = [];
  private done: Entry[] = [];
  private sequence = 0;
  private memory = new HistoryMemory();
  readonly maxBytes: number;
  onTrim?: (oversized: boolean) => void;
  get bytes(): number { return this.memory.bytes; }
  /** Идентификатор состояния: отмена к сохранённому состоянию снимает признак изменений. */
  state = 0;

  constructor(doc: Doc, maxBytes = HISTORY_BYTES) {
    this.doc = doc;
    this.maxBytes = Math.max(0, maxBytes);
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  /** Применить правку к документу и запомнить её. */
  commit(edit: Edit, group?: object): void {
    if (!edit.added.length && !edit.removed.length) return;
    const previous = this.done.at(-1);
    if (previous?.group && previous.group !== group) this.endGroup(previous.group);
    const last = this.done.at(-1);
    const entry: Entry = group && last?.group === group ? last
      : { edit, before: this.state, after: this.state, group, redoBefore: group ? [...this.undone] : undefined };
    if (entry === last) {
      const next = combine(entry.edit, edit);
      this.memory.retain(next); this.memory.release(entry.edit); entry.edit = next;
    } else {
      this.done.push(entry); this.memory.retain(edit);
      if (!group) for (const old of this.undone) this.memory.release(old.edit);
    }
    entry.after = ++this.sequence;
    this.state = entry.after;
    this.undone.length = 0;
    // Незавершённый жест и прежний Redo временно удерживаются для точного Esc.
    if (!group) this.trim();
    this.doc.apply(edit.added, edit.removed);
  }

  /** Один проход ластика — одна отмена, даже если он менял документ во многих кадрах. */
  endGroup(group: object): void {
    const entry = this.done.at(-1);
    if (entry?.group === group) {
      for (const old of entry.redoBefore ?? []) this.memory.release(old.edit);
      delete entry.group; delete entry.redoBefore; this.trim();
    }
  }

  cancelGroup(group: object): void {
    const entry = this.done.at(-1);
    if (entry?.group !== group) return;
    this.done.pop(); this.state = entry.before;
    this.memory.release(entry.edit);
    this.undone = entry.redoBefore ?? [];
    this.doc.apply(entry.edit.removed, entry.edit.added);
  }

  undo(): boolean {
    const pending = this.done.at(-1)?.group;
    if (pending) this.endGroup(pending);
    const entry = this.done.pop();
    if (!entry) return false;
    const { edit } = entry;
    this.state = entry.before;
    this.undone.push(entry);
    this.doc.apply(edit.removed, edit.added);
    return true;
  }

  redo(): boolean {
    const entry = this.undone.pop();
    if (!entry) return false;
    const { edit } = entry;
    this.state = entry.after;
    this.done.push(entry);
    this.doc.apply(edit.added, edit.removed);
    return true;
  }

  clear(): void {
    this.done.length = this.undone.length = 0;
    this.memory.clear();
    this.state = ++this.sequence;
  }

  private trim(): void {
    let count = 0;
    while (count < this.done.length && this.bytes > this.maxBytes) {
      this.memory.release(this.done[count++].edit);
    }
    if (count) { this.done.splice(0, count); this.onTrim?.(!this.done.length); }
  }
}
