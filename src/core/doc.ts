// Документ: все объекты холста + пространственный индекс + оповещение об изменениях.
// Менять документ можно только через apply(); отмена и повтор живут в history.ts.
import type { BBox } from './geom.ts';
import { SpatialIndex } from './spatial.ts';
import type { Obj } from './types.ts';
import { maskDamage } from './mask-damage.ts';

export interface DocChange {
  /** Полная замена документа: старый кэш плиток можно освободить сразу. */
  readonly reset?: boolean;
  readonly added: readonly Obj[];
  readonly removed: readonly Obj[];
  /** Только добавление поверх всего остального: отрисовщик может дорисовать объекты, не перерисовывая плитки. */
  readonly top: boolean;
  /** Менялась только маска: точная область для быстрой перерисовки и её отмены. */
  readonly damage?: BBox;
}

type Listener = (change: DocChange) => void;

/** Пачки больше этого размера не дорисовываются «поверх», а перерисовываются плитками по бюджету времени. */
const TOP_LIMIT = 64;

export class Doc {
  private objs = new Map<number, Obj>();
  private index = new SpatialIndex();
  private listeners: Listener[] = [];
  private idSeq = 1;
  private maxZ = 0;

  get size(): number {
    return this.objs.size;
  }

  get(id:number):Obj|undefined {return this.objs.get(id);}

  nextId(): number {
    return this.idSeq++;
  }

  /** z для нового объекта, который должен лечь поверх всех. */
  topZ(): number {
    return this.maxZ + 1;
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  /** Открытие другого документа: не удаляем десятки тысяч объектов из дерева по одному. */
  replace(objects: readonly Obj[]): void {
    const removed = [...this.objs.values()];
    this.objs.clear();
    this.index.clear();
    this.idSeq = 1;
    this.maxZ = 0;
    for (const o of objects) {
      this.objs.set(o.id, o);
      this.idSeq = Math.max(this.idSeq, o.id + 1);
      this.maxZ = Math.max(this.maxZ, o.z);
    }
    this.index.load(objects);
    for (const fn of this.listeners) fn({ added: objects, removed, top: false, reset: true });
  }

  apply(added: readonly Obj[], removed: readonly Obj[]): void {
    for (const o of removed) {
      if (this.objs.delete(o.id)) this.index.remove(o);
    }
    let top = removed.length === 0 && added.length <= TOP_LIMIT;
    let prevZ = this.maxZ;
    for (const o of added) {
      if (o.z <= prevZ) top = false;
      prevZ = o.z;
      this.objs.set(o.id, o);
      if (o.z > this.maxZ) this.maxZ = o.z;
      if (o.id >= this.idSeq) this.idSeq = o.id + 1;
    }
    if (added.length > TOP_LIMIT) this.index.load(added);
    else for (const o of added) this.index.insert(o);
    const change: DocChange = { added, removed, top,damage:maskDamage(added,removed) };
    for (const fn of this.listeners) fn(change);
  }

  /** Объекты, чьи рамки пересекают b. Порядок произвольный. */
  query(b: BBox): Obj[] {
    return this.index.search(b);
  }

  values(): IterableIterator<Obj> {
    return this.objs.values();
  }
}
