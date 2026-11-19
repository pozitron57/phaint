// Качество экспорта. SVG/PDF остаются векторными, растр обрабатывается только в копии.
export type VectorQuality='maximum'|'high'|'compact';
export interface VectorOptions { quality:VectorQuality; compression?:number; precision?:number; tolerance?:number; compactThin?:boolean }
export interface SvgExportOptions extends VectorOptions { editable:boolean; svgo?:boolean; grid?:'paths'; vectorMasks?:boolean }
export interface RasterOptions { width:number; /** Только миграция прежнего размера до первого экспорта. */ scale?:number }
export interface ExportSettings {
  format:'svg'|'pdf'|'png'|'jpg';
  includeGrid:boolean;
  svg:VectorOptions & {editable:boolean;svgo:boolean};
  pdf:VectorOptions & {layout:'pages'|'sheet'};
  png:RasterOptions & {compression:number};
  jpg:RasterOptions & {quality:number};
}
export const VECTOR_QUALITY={
  maximum:{label:'Максимальное',precision:3,tolerance:0,pixelsPerUnit:Infinity,jpeg:1},
  high:{label:'Высокое',precision:2,tolerance:.04,pixelsPerUnit:3,jpeg:.92},
  compact:{label:'Компактное',precision:1,tolerance:.12,pixelsPerUnit:1.5,jpeg:.8},
} as const;
export const DETAIL_LOSS_TOLERANCE=3;
export const MAX_CONTOUR_TOLERANCE=14;
export const MAX_VECTOR_COMPRESSION=20;
/** Старые допуски до 12 не меняются; новый край немного сильнее ослабляет защиту. */
export const contourDetailLoss=(tolerance:number):number=>Math.min(1.1,Math.max(0,(tolerance-DETAIL_LOSS_TOLERANCE)/9));
// Уровень сжатия — целое число, не пиксели. Положения бегунка равномерны;
// внутренние допуски оставляют точные варианты для тонкого почерка. 19 — прежний максимум.
const COMPRESSION_TOLERANCE=[0,.02,.04,.08,.12,.2,.3,.45,.65,.9,1.2,1.6,2.2,3,4.5,6,7.5,9,10.5,12,14] as const;
export const compressionLevel=(value:number):number=>Number.isFinite(value)?Math.round(Math.max(0,Math.min(MAX_VECTOR_COMPRESSION,value))):0;
/** При первом открытии нового диалога выбираем ближайшую ступень старого допуска. */
export function vectorCompression(options:VectorOptions):number {
  if(Number.isFinite(options.compression))return compressionLevel(options.compression!);
  const {tolerance}=vectorOptions(options);let best=0;
  for(let i=1;i<COMPRESSION_TOLERANCE.length;i++)if(Math.abs(COMPRESSION_TOLERANCE[i]-tolerance)<Math.abs(COMPRESSION_TOLERANCE[best]-tolerance))best=i;
  return best;
}
export function vectorOptions(options?:VectorOptions):{precision:number;tolerance:number;compactThin:boolean;quality:VectorQuality} {
  if(Number.isFinite(options?.compression)){
    const level=compressionLevel(options!.compression!);
    return {precision:level===0?3:level<4?2:level<14?1:0,tolerance:COMPRESSION_TOLERANCE[level],compactThin:level>=5,quality:level===0?'maximum':level<4?'high':'compact'};
  }
  const preset=VECTOR_QUALITY[options?.quality??'maximum'];
  return {precision:Number.isFinite(options?.precision)?Math.min(4,Math.max(0,Math.round(options!.precision!))):preset.precision,
    tolerance:Number.isFinite(options?.tolerance)?Math.min(MAX_CONTOUR_TOLERANCE,Math.max(0,options!.tolerance!)):preset.tolerance,
    compactThin:options?.compactThin===true,quality:options?.quality??'maximum'};
}
export function defaultExportSettings():ExportSettings {
  return {format:'pdf',includeGrid:true,svg:{quality:'maximum',editable:true,svgo:false},pdf:{quality:'maximum',layout:'pages'},png:{width:0,compression:6},jpg:{width:0,quality:95}};
}
/** Скрытая сетка и промежутки за исходными страницами PDF в файл не попадают. */
export function exportHasGrid(settings:ExportSettings,visible:boolean,pdfPages=0):boolean {
  return visible&&settings.includeGrid&&!(settings.format==='pdf'&&pdfPages>0&&settings.pdf.layout==='pages');
}
export function normalizeExportSettings(settings:ExportSettings,raw?:unknown):void {
  if(!['svg','pdf','png','jpg'].includes(settings.format))settings.format='pdf';
  settings.includeGrid=settings.includeGrid!==false;
  if(settings.pdf.layout!=='sheet')settings.pdf.layout='pages';
  for(const field of ['svg','pdf'] as const)if(!Object.hasOwn(VECTOR_QUALITY,settings[field].quality))settings[field].quality='maximum';
  for(const field of ['svg','pdf'] as const){
    const source=raw&&typeof raw==='object'?(raw as Record<string,unknown>)[field]:undefined;
    const compression=source&&typeof source==='object'?(source as Record<string,unknown>).compression:undefined;
    if(typeof compression==='number'&&Number.isFinite(compression))settings[field].compression=compressionLevel(compression);
    else delete settings[field].compression;
    if(source&&typeof source==='object'&&(source as Record<string,unknown>).compactThin===true)settings[field].compactThin=true;
    else delete settings[field].compactThin;
    if(source&&typeof source==='object')for(const key of ['precision','tolerance'] as const){
      const value=(source as Record<string,unknown>)[key];if(typeof value==='number'&&Number.isFinite(value))settings[field][key]=value;
    }
    const values=vectorOptions(settings[field]);for(const key of ['precision','tolerance'] as const)if(settings[field][key]!==undefined)settings[field][key]=values[key];
  }
  for(const field of ['png','jpg'] as const){
    const options=settings[field];options.width=Math.round(Math.max(0,Math.min(12000,options.width)));
    const source=raw&&typeof raw==='object'?(raw as Record<string,unknown>)[field]:undefined;
    if(!options.width&&source&&typeof source==='object'){
      const scale=(source as Record<string,unknown>).scale;
      if(typeof scale==='number'&&[1,2,3,4].includes(scale))options.scale=scale;
    }
  }
  settings.png.compression=Math.round(Math.min(9,Math.max(0,settings.png.compression)));
  settings.jpg.quality=Math.round(Math.min(100,Math.max(10,settings.jpg.quality)));
}
/** Максимальная ширина с учётом пропорций: до 24 Мп и 12 000 px по каждой стороне. */
export function rasterWidthLimit(width:number,height:number):number {
  const ratio=width/height;return Math.max(1,Math.min(12000,Math.floor(12000*ratio),Math.floor(Math.sqrt(24000000*ratio))));
}
export function rasterSize(width:number,height:number,targetWidth:number):{width:number;height:number} {
  const w=Math.max(1,Math.min(rasterWidthLimit(width,height),Math.round(targetWidth)));
  return {width:w,height:Math.max(1,Math.min(12000,Math.round(w*height/width),Math.floor(24000000/w)))};
}
/** Максимальное растяжение матрицы, в том числе при повороте/отражении/сдвиге осей. */
export function matrixScale(m?:{a:number;b:number;c:number;d:number}):number {
  if(!m)return 1;
  const u=Math.hypot(m.a+m.d,m.b-m.c),v=Math.hypot(m.a-m.d,m.b+m.c);
  return (u+v)/2;
}
export function exportImageSize(width:number,height:number,worldWidth:number,worldHeight:number,quality:VectorQuality):{width:number;height:number} {
  if(quality==='maximum')return {width,height};
  const density=VECTOR_QUALITY[quality].pixelsPerUnit;
  const factor=Math.min(1,Math.max(worldWidth*density/width,worldHeight*density/height),12000/Math.max(width,height),Math.sqrt(16000000/(width*height)));
  const w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.min(Math.round(height*factor),Math.floor(16000000/w)));
  return {width:w,height:h};
}
