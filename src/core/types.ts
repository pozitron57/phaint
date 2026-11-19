// Модель документа. Объекты неизменяемы: любая правка — это новый объект.
// Координаты точек локальные (относительно ox, oy), чтобы на бесконечном холсте
// не терять точность и чтобы перенос объекта не трогал массив точек.
import type { ShapeData, DashStyle } from './shapes.ts';
import type { BBox, Mat, Pt } from './geom.ts';
import type { PdfPageRef } from '../files/pdf-types.ts';

export interface StrokeObj {
  readonly clip?: readonly Pt[];
  readonly kind: 'stroke';
  readonly id: number;
  /** Порядок наложения: больше — выше. */
  readonly z: number;
  readonly ox: number;
  readonly oy: number;
  /** Тройки x, y, w: осевая линия и полная толщина в точке (уже с учётом нажатия). */
  readonly pts: Float32Array;
  readonly color: string;
  readonly dash?: DashStyle;
  readonly shape?: ShapeData;
  readonly marker?: boolean;
  readonly opacity?: number;
  /** Маркер масштабируется как целая полоса, включая некруглые концы после растяжения. */
  readonly matrix?: Mat;
  readonly erasures?: readonly (readonly number[])[];
  /** Мировая рамка с запасом на толщину. */
  readonly bbox: BBox;
}

/** SVG из другого редактора: сохраняем векторный оригинал целиком, включая группы и эффекты. */
export interface SvgObj {
  readonly pdfPage?: PdfPageRef;
  readonly clip?: readonly Pt[];
  readonly kind: 'svg';
  readonly matrix?: Mat;
  readonly erasures?: readonly (readonly number[])[];
  readonly id: number;
  readonly z: number;
  readonly ox: number;
  readonly oy: number;
  readonly width: number;
  readonly height: number;
  readonly source: string;
  readonly bbox: BBox;
}

export interface ImageObj extends Omit<SvgObj, 'kind' | 'erasures'> { readonly kind: 'image' }
export type PdfPageObj = (SvgObj | ImageObj) & { readonly pdfPage:PdfPageRef };
/** Простой путь внешнего SVG; отверстия остаются внутри одного d. */
export interface VectorObj {
  readonly clip?: readonly Pt[];
  readonly kind: 'vector'; readonly id: number; readonly z: number;
  readonly ox: number; readonly oy: number; readonly matrix: Mat;
  readonly d: string; readonly fill: string; readonly stroke: string; readonly strokeWidth: number;
  readonly fillRule: 'nonzero' | 'evenodd'; readonly linecap: CanvasLineCap; readonly linejoin: CanvasLineJoin;
  readonly opacity: number; readonly bounds: BBox; readonly bbox: BBox;
  readonly erasures?: readonly (readonly number[])[];
  readonly background?: boolean;
  /** Контур собственной фигуры после стирания доступен обычному ластику. */
  readonly native?: boolean;
}
export type Obj = StrokeObj | SvgObj | ImageObj | VectorObj;
export function isPdfPage(o:Obj):o is PdfPageObj {return (o.kind==='image'||o.kind==='svg')&&o.pdfPage!==undefined;}
export function isLocked(o:Obj):boolean {return isPdfPage(o);}
export function makeImage(id: number, z: number, ox: number, oy: number, width: number, height: number, source: string): ImageObj {
  return { ...makeSvg(id,z,ox,oy,width,height,source), kind: 'image' };
}

export function makeSvg(id: number, z: number, ox: number, oy: number, width: number, height: number, source: string): SvgObj {
  return { kind: 'svg', id, z, ox, oy, width, height, source, bbox: { minX: ox, minY: oy, maxX: ox + width, maxY: oy + height } };
}

export function strokeBBox(ox: number, oy: number, pts: ArrayLike<number>): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxW = 0;
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const x = pts[i];
    const y = pts[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (pts[i + 2] > maxW) maxW = pts[i + 2];
  }
  // Контур отходит от оси на половину толщины (с малым запасом); плюс пиксель на сглаживание краёв.
  const pad = maxW * 0.6 + 1;
  return { minX: ox + minX - pad, minY: oy + minY - pad, maxX: ox + maxX + pad, maxY: oy + maxY + pad };
}

export function makeStroke(id: number, z: number, ox: number, oy: number, pts: Float32Array, color: string): StrokeObj {
  return { kind: 'stroke', id, z, ox, oy, pts, color, bbox: strokeBBox(ox, oy, pts) };
}
