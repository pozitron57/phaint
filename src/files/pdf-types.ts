// Исходный PDF хранится один раз; его страницы — закреплённые подложки холста.
import type { Mat } from '../core/geom.ts';
export interface PdfSource { data:string; name:string }
export interface PdfPageRef { index:number; transform:Mat }
export interface PdfLayer { svg:string; multiply?:boolean }
export interface PdfPagePlacement { page:PdfPageRef; x:number; y:number; width:number; height:number; layers?:PdfLayer[] }
export interface PdfExportRequest {
  source:PdfSource;
  pages:PdfPagePlacement[];
  layout:'pages'|'sheet';
  bounds:{x:number;y:number;width:number;height:number};
  grid?:{step:number};
  /** Порядок пометок сохранён; каждый маркер — отдельный слой с умножением цвета. */
  layers?:PdfLayer[];
}
