// Вставка, перенос и размер картинок. Пороги захвата и отпускания заданы в экранных пикселях.
import type { Doc } from './doc.ts';
import { bboxPad, bboxUnion, matBBox, type BBox, type Mat, type Pt } from './geom.ts';
import { snapPoint } from './snap.ts';
import { around } from './transform.ts';
import { isLocked, type ImageObj, type Obj } from './types.ts';

const CAPTURE_PX = 8;
const RELEASE_PX = 12;
const NEIGHBOR_PX = 48;
const edges = { x: ['minX','maxX'], y: ['minY','maxY'] } as const;
type Axis = keyof typeof edges;
type Edge = keyof BBox;
interface Match { edge: Edge; line: number; target: ImageObj }
type Guide = { columnX: number } | { from: Pt; to: Pt };

function translated(b: BBox, by: Pt): BBox {
  return { minX:b.minX+by.x, maxX:b.maxX+by.x, minY:b.minY+by.y, maxY:b.maxY+by.y };
}

export class ImageSnap {
  private bounds: BBox;
  private ids: Set<number>;
  private column?: ImageObj | null;
  private held: Partial<Record<Axis, Match>> = {};
  guides: Guide[] = [];

  constructor(bounds: BBox, ids: number[] = []) {
    this.bounds = bounds;
    this.ids = new Set(ids);
  }

  static forSelection(objects: readonly Obj[]): ImageSnap | null {
    if (!objects.length || !objects.every(o => o.kind === 'image' && !isLocked(o))) return null;
    return new ImageSnap(objects.map(o => o.bbox).reduce(bboxUnion), objects.map(o => o.id));
  }

  private neighbors(doc: Doc, box: BBox, scale: number, enabled: boolean): ImageObj[] {
    if (!enabled) return [];
    const other = (o: Obj): o is ImageObj => o.kind === 'image' && !isLocked(o) && !this.ids.has(o.id);
    // Левое поле ищем один раз на жест, включая картинки за пределами экрана.
    if (this.column === undefined) {
      this.column = null;
      for (const o of doc.values()) {
        if (other(o) && (!this.column || o.bbox.minX < this.column.bbox.minX)) this.column = o;
      }
    }
    return doc.query(bboxPad(box, NEIGHBOR_PX / scale)).filter(other);
  }

  private align(axis: Axis, box: BBox, neighbors: ImageObj[],
    scale: number, cost: (edge: Edge, line: number) => number): Match | undefined {
    const previous = this.held[axis];
    let best: Match | undefined;
    let bestCost = Infinity, bestHeld = false;
    const consider = (edge: Edge, line: number, target: ImageObj) => {
      const sameColumn = edge === 'minX' && line === this.column?.bbox.minX;
      const held = previous?.edge === edge && previous.line === line && (sameColumn || previous.target === target);
      if (Math.abs(box[edge] - line) * scale > (held ? RELEASE_PX : CAPTURE_PX)) return;
      const correction = cost(edge, line);
      if (!Number.isFinite(correction) || (bestHeld && !held)) return;
      if (best && held === bestHeld) {
        if (correction > bestCost) return;
        if (correction === bestCost && (target.z < best.target.z || (target.z === best.target.z && target.id <= best.target.id))) return;
      }
      best = { edge, line, target };
      bestCost = correction;
      bestHeld = held;
    };
    const [min, max] = edges[axis];
    for (const target of neighbors) {
      consider(min, target.bbox[min], target);
      consider(max, target.bbox[max], target);
      consider(min, target.bbox[max], target);
      consider(max, target.bbox[min], target);
    }
    if (axis === 'x' && this.column) consider('minX', this.column.bbox.minX, this.column);
    return best;
  }

  clear(): void {
    this.guides = [];
    this.held = {};
  }

  private show(box: BBox, scale: number, x?: Match, y?: Match): void {
    this.clear();
    const pad = 6 / scale;
    if (x && Math.abs(box[x.edge] - x.line) * scale < 1e-5) {
      this.held.x = x;
      if (x.edge === 'minX' && x.line === this.column?.bbox.minX) this.guides.push({columnX:x.line});
      else this.guides.push({ from:{x:x.line,y:Math.min(box.minY,x.target.bbox.minY)-pad},
        to:{x:x.line,y:Math.max(box.maxY,x.target.bbox.maxY)+pad} });
    }
    if (y && Math.abs(box[y.edge] - y.line) * scale < 1e-5) {
      this.held.y = y;
      this.guides.push({ from:{x:Math.min(box.minX,y.target.bbox.minX)-pad,y:y.line},
        to:{x:Math.max(box.maxX,y.target.bbox.maxX)+pad,y:y.line} });
    }
  }

  move(doc: Doc, delta: Pt, scale: number, gridStep: number | null, alignImages: boolean): Pt {
    const box = translated(this.bounds, delta);
    const neighbors = this.neighbors(doc, box, scale, alignImages);
    const cost = (edge: Edge, line: number) => Math.abs(box[edge] - line);
    const x = alignImages ? this.align('x', box, neighbors, scale, cost) : undefined;
    const y = alignImages ? this.align('y', box, neighbors, scale, cost) : undefined;
    const grid = gridStep ? snapPoint({x:box.minX,y:box.minY}, gridStep) : null;
    const by = {
      x:x ? x.line-this.bounds[x.edge] : grid ? grid.x-this.bounds.minX : delta.x,
      y:y ? y.line-this.bounds[y.edge] : grid ? grid.y-this.bounds.minY : delta.y,
    };
    this.show(translated(this.bounds, by), scale, x, y);
    return by;
  }

  /** Поправка к уже рассчитанному размеру. Положительный множитель сохраняет сторону отражения. */
  resize(doc: Doc, box: BBox, pivot: Pt, corner: Pt, independent: boolean,
    scale: number, gridStep: number | null, alignImages: boolean): Mat {
    const neighbors = this.neighbors(doc, box, scale, alignImages);
    const reach = {
      x:Math.max(Math.abs(box.minX-pivot.x),Math.abs(box.maxX-pivot.x)),
      y:Math.max(Math.abs(box.minY-pivot.y),Math.abs(box.maxY-pivot.y)),
    };
    const choose = (axis: Axis) => {
      const fixed = pivot[axis];
      const extent = independent ? reach[axis] : Math.max(reach.x,reach.y);
      const factor = (edge: Edge, line: number) => {
        const arm = box[edge] - fixed;
        if (Math.abs(arm) * scale < 1e-6) return NaN;
        const k = (line - fixed) / arm;
        return k > 0 ? k : NaN;
      };
      const cost = (edge: Edge, line: number) => {
        const delta = Math.abs(factor(edge,line)-1);
        // У длинной узкой картинки пиксель по высоте может потребовать сотен пикселей по ширине.
        return delta*extent*scale <= NEIGHBOR_PX ? delta : Infinity;
      };
      const match = alignImages ? this.align(axis, box, neighbors, scale, cost) : undefined;
      if (match) return { k:factor(match.edge,match.line), match };
      if (gridStep) {
        const [min,max] = edges[axis];
        const edge = corner[axis] < fixed ? min : max;
        const k = factor(edge, Math.round(box[edge]/gridStep)*gridStep);
        if (Number.isFinite(k)) return { k };
      }
      return undefined;
    };
    const x = choose('x'), y = choose('y');
    let kx = x?.k ?? 1, ky = y?.k ?? 1;
    if (!independent) {
      // Для одного масштаба смещение угла пропорционально |k − 1| по обеим осям.
      let factor = Math.abs(kx-1) <= Math.abs(ky-1) ? kx : ky;
      if (!y || (x?.match && !y.match)) factor = kx;
      else if (!x || (y.match && !x.match)) factor = ky;
      kx = ky = factor;
    }
    const correction = around(pivot,{a:kx,b:0,c:0,d:ky,e:0,f:0});
    this.show(matBBox(correction,box), scale, x?.match, y?.match);
    return correction;
  }
}
