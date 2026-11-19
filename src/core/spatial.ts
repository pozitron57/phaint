// Пространственный индекс объектов (R-дерево): быстрый ответ на вопрос
// «что лежит в этом прямоугольнике» без перебора всего документа.
import RBush from 'rbush';
import type { BBox } from './geom.ts';
import type { Obj } from './types.ts';

interface Item extends BBox {
  obj: Obj;
}

export class SpatialIndex {
  private tree = new RBush<Item>(12);
  private items = new Map<number, Item>();

  insert(obj: Obj): void {
    const item: Item = { ...obj.bbox, obj };
    this.items.set(obj.id, item);
    this.tree.insert(item);
  }

  /** Быстрая вставка большой пачки. */
  load(objs: readonly Obj[]): void {
    const batch: Item[] = [];
    for (const obj of objs) {
      const item: Item = { ...obj.bbox, obj };
      this.items.set(obj.id, item);
      batch.push(item);
    }
    this.tree.load(batch);
  }

  remove(obj: Obj): void {
    const item = this.items.get(obj.id);
    if (!item) return;
    this.items.delete(obj.id);
    this.tree.remove(item);
  }

  search(b: BBox): Obj[] {
    const found = this.tree.search(b);
    const out: Obj[] = new Array(found.length);
    for (let i = 0; i < found.length; i++) out[i] = found[i].obj;
    return out;
  }

  clear(): void {
    this.tree.clear();
    this.items.clear();
  }
}
