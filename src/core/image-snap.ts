// Вставка и перенос картинок по сетке и краям соседей. Пороги заданы в экранных пикселях.
import type { Doc } from './doc.ts';
import { bboxPad, bboxUnion, type BBox, type Pt } from './geom.ts';
import { snapPoint } from './snap.ts';
import { isLocked, type ImageObj, type Obj } from './types.ts';

const CAPTURE_PX = 8;
const RELEASE_PX = 12;
const NEIGHBOR_PX = 48;

interface Alignment {
  target: ImageObj;
  line: number;
  offset: number;
}

function alignAxis(axis: 'x' | 'y', bounds: BBox, delta: Pt, neighbors: ImageObj[], scale: number, previous?: Alignment): Alignment | undefined {
  const travel = delta[axis];
  if (previous && neighbors.includes(previous.target) && Math.abs(previous.offset - travel) <= RELEASE_PX / scale) return previous;

  const min = axis === 'x' ? 'minX' : 'minY', max = axis === 'x' ? 'maxX' : 'maxY';
  let best: Alignment | undefined;
  let distance = CAPTURE_PX / scale;
  for (const target of neighbors) {
    const low = target.bbox[min], high = target.bbox[max];
    // Одноимённые края — для ряда или столбца, противоположные — для стыка.
    const pairs = [
      [bounds[min], low], [bounds[max], high], [bounds[min], high], [bounds[max], low],
    ];
    for (const [source, line] of pairs) {
      const offset = line - source, error = Math.abs(offset - travel);
      if (error > distance) continue;
      if (best && error === distance && (target.z < best.target.z || (target.z === best.target.z && target.id <= best.target.id))) continue;
      best = { target, line, offset };
      distance = error;
    }
  }
  return best;
}

export class ImageSnap {
  private bounds: BBox;
  private ids: Set<number>;
  private x?: Alignment;
  private y?: Alignment;
  guides: [Pt, Pt][] = [];

  constructor(bounds: BBox, ids: number[] = []) {
    this.bounds = bounds;
    this.ids = new Set(ids);
  }

  static forSelection(objects: readonly Obj[]): ImageSnap | null {
    if (!objects.length || !objects.every(o => o.kind === 'image' && !isLocked(o))) return null;
    return new ImageSnap(objects.map(o => o.bbox).reduce(bboxUnion), objects.map(o => o.id));
  }

  move(doc: Doc, delta: Pt, scale: number, gridStep: number | null, alignImages: boolean): Pt {
    const b = this.bounds;
    const box = { minX: b.minX + delta.x, maxX: b.maxX + delta.x, minY: b.minY + delta.y, maxY: b.maxY + delta.y };
    const neighbors = alignImages ? doc.query(bboxPad(box, NEIGHBOR_PX / scale))
      .filter((o): o is ImageObj => o.kind === 'image' && !isLocked(o) && !this.ids.has(o.id)) : [];
    this.x = alignAxis('x', b, delta, neighbors, scale, this.x);
    this.y = alignAxis('y', b, delta, neighbors, scale, this.y);
    const grid = gridStep ? snapPoint({ x: box.minX, y: box.minY }, gridStep) : null;
    const x = this.x?.offset ?? (grid ? grid.x - b.minX : delta.x);
    const y = this.y?.offset ?? (grid ? grid.y - b.minY : delta.y);

    this.guides = [];
    const pad = 6 / scale;
    if (this.x) {
      const { line, target } = this.x;
      this.guides.push([{ x: line, y: Math.min(b.minY + y, target.bbox.minY) - pad },
        { x: line, y: Math.max(b.maxY + y, target.bbox.maxY) + pad }]);
    }
    if (this.y) {
      const { line, target } = this.y;
      this.guides.push([{ x: Math.min(b.minX + x, target.bbox.minX) - pad, y: line },
        { x: Math.max(b.maxX + x, target.bbox.maxX) + pad, y: line }]);
    }
    return { x, y };
  }
}
