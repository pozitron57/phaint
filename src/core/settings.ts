// Настройки инструментов и интерфейса. Старые файлы настроек дополняются новыми значениями.
import type { PenSettings } from './brush.ts';
import { DEFAULT_ARROW_HEAD, DEFAULT_GAMMA, MIN_GAMMA, MAX_GAMMA, type ArrowHeadStyle, type ShapeKind } from './shapes.ts';
import { validCombo, normalizeCombo } from './actions.ts';
import { DEFAULT_GRID_STEP } from './snap.ts';
import { defaultExportSettings, normalizeExportSettings, type ExportSettings } from '../files/export-options.ts';
export interface GridSettings { enabled:boolean; step:number; save?:boolean }
export interface InkStyle { color:string; dashed:boolean; dotted:boolean; dotSpacing:number; dashLength:number; dashGap:number; round:boolean }
export interface InkSettings extends InkStyle { width:number }
export type DrawingTool = 'pen' | 'marker' | ShapeKind;
export interface Settings {
  version:number;
  stylePerTool:boolean;
  sharedStyle:InkStyle;
  pen:PenSettings & InkSettings;
  line:InkSettings;
  arrow:InkSettings & Required<ArrowHeadStyle> & {both:boolean; doubleHead:Required<ArrowHeadStyle>};
  coordinates:InkStyle & Required<ArrowHeadStyle>;
  ellipse:InkSettings;
  sine:InkSettings & {amplitude:number;period:number};
  parabola:InkSettings;
  hyperbola:InkSettings & {gamma:number};
  adiabat:InkStyle;
  marker:InkSettings & {opacity:number};
  eraser:{width:number;original:boolean};
  selection:{keepWidth:boolean};
  palette:string[];
  customColor:string;
  grid:GridSettings;
  snapToGrid:boolean;
  snapToImages:boolean;
  input:{predict:boolean};
  ui:{toolbar:boolean;debug:boolean};
  keys:Record<string,string[]>;
  export:ExportSettings;
}
export const QUICK_COLORS={blue:'#315ca8',red:'#c9514e',green:'#79ad65'};
const MAX_HEAD_SETTING=30;
export const PALETTE=[QUICK_COLORS.blue,QUICK_COLORS.green,QUICK_COLORS.red,'#000000','#ffffff','#cf914d','#946bb0'];
export const CYCLE=PALETTE.slice(0,3);
const style=():InkStyle=>({color:PALETTE[0],dashed:false,dotted:false,dotSpacing:3,dashLength:4,dashGap:3,round:true});
const ink=():InkSettings=>({width:2.6,...style()});
export function defaultSettings():Settings {
  return {version:13,stylePerTool:false,sharedStyle:style(),coordinates:{...style(),...DEFAULT_ARROW_HEAD},adiabat:style(),pen:{...ink(),pressure:.5,curve:0,smoothing:.25,taper:0,speed:0},
    line:ink(),arrow:{...ink(),...DEFAULT_ARROW_HEAD,both:false,doubleHead:{...DEFAULT_ARROW_HEAD}},ellipse:ink(),
    sine:{...ink(),amplitude:72,period:192},parabola:ink(),hyperbola:{...ink(),gamma:DEFAULT_GAMMA},marker:{...ink(),width:48,color:PALETTE[1],opacity:.5},
    eraser:{width:24,original:false},selection:{keepWidth:true},palette:[...PALETTE],customColor:'#ffffff',
    grid:{enabled:true,step:DEFAULT_GRID_STEP,save:true},snapToGrid:true,snapToImages:true,input:{predict:false},ui:{toolbar:true,debug:false},keys:{},export:defaultExportSettings()};
}
export function mergeSettings(raw:unknown):Settings {
  const base=defaultSettings(),profile=raw as Partial<Settings>|null;
  // До версии 13 координаты брали головки у одиночной стрелки. Свои сохранённые поля имеют приоритет.
  merge(base.sharedStyle,profile?.pen);merge(base.coordinates,profile?.arrow);merge(base.adiabat,profile?.hyperbola);
  // До версии 12 у стрелок был один набор головок. Обе копии начинают с прежних значений.
  merge(base.arrow.doubleHead,profile?.arrow);
  merge(base,raw);base.version=13;
  // Новые исходные размеры один раз применяются и к прежнему профилю, в его клетках.
  if(!raw||typeof raw!=='object'||Number((raw as {version?:number}).version??0)<10){
    const step=base.grid.step>0?base.grid.step:DEFAULT_GRID_STEP;
    base.sine.amplitude=3*step;base.sine.period=8*step;
  }
  if(!raw||typeof raw!=='object'||Number((raw as {version?:number}).version??0)<9)base.grid.save=true;
  if(!/^#[\da-f]{6}$/i.test(base.customColor))base.customColor='#ffffff';
  if(!raw||typeof raw!=='object'||Number((raw as {version?:number}).version??0)<8)base.input.predict=false;base.palette=[...PALETTE];
  const old:Record<string,string>={'#3f6fb5':PALETTE[0],'#4d9160':PALETTE[1],'#2f3136':'#000000'};
  for(const id of ['sharedStyle','pen','line','arrow','coordinates','ellipse','sine','parabola','hyperbola','adiabat','marker'] as const){
    const b=base[id];if('width' in b)b.width=Math.min(id==='marker'?240:60,Math.max(.3,b.width));
    b.color=old[b.color]??b.color;if(!/^#[\da-f]{6}$/i.test(b.color))b.color=PALETTE[0];
    b.dashLength=Math.min(40,Math.max(.5,b.dashLength));b.dashGap=Math.min(40,Math.max(.5,b.dashGap));
    b.dotSpacing=Math.min(20,Math.max(1.25,b.dotSpacing));
  }
  base.marker.opacity=Math.min(1,Math.max(.05,base.marker.opacity));
  base.sine.period=Math.min(2000,Math.max(12,base.sine.period));base.sine.amplitude=Math.min(1000,Math.max(0,base.sine.amplitude));
  base.hyperbola.gamma=Math.min(MAX_GAMMA,Math.max(MIN_GAMMA,base.hyperbola.gamma));
  for (const head of [base.arrow,base.arrow.doubleHead,base.coordinates]) {
    head.headLength=Math.min(MAX_HEAD_SETTING,Math.max(1,head.headLength));head.headWidth=Math.min(MAX_HEAD_SETTING,Math.max(1,head.headWidth));
    head.headRound=Math.min(1,Math.max(0,head.headRound));
    if(head.headType!=='filled')head.headType='open';
  }
  base.eraser.width=Math.min(120,Math.max(2,base.eraser.width));
  normalizeExportSettings(base.export,raw&&typeof raw==='object'?(raw as {export?:unknown}).export:undefined);
  // Прежний общий флажок переносится в экспорт один раз. Затем выборы независимы.
  const exported=raw&&typeof raw==='object'?(raw as {export?:Record<string,unknown>}).export:undefined;
  if(!exported||typeof exported!=='object'||typeof exported.includeGrid!=='boolean')base.export.includeGrid=base.grid.save!==false;
  if(raw&&typeof raw==='object'){
    const keys=(raw as {keys?:unknown}).keys;
    if(keys&&typeof keys==='object')for(const [id,list] of Object.entries(keys))if(/^[a-z][A-Za-z0-9.+_-]{0,100}$/.test(id)&&Array.isArray(list)&&list.every(k=>typeof k==='string'&&validCombo(k,'hold')))base.keys[id]=[...new Set(list.map(normalizeCombo))];
  }return base;
}
function merge(obj: object, src: unknown): void {
  if (!src || typeof src !== 'object') return;
  const target=obj as Record<string,unknown>,from=src as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    const cur = target[key];
    const val = from[key];
    if (val === undefined || val === null) continue;
    if (Array.isArray(cur)) {
      if (Array.isArray(val) && val.length === cur.length && val.every((v) => typeof v === typeof cur[0])) target[key] = val;
    } else if (typeof cur === 'object' && cur !== null) {
      merge(cur as Record<string, unknown>, val);
    } else if (typeof val === typeof cur && (typeof val !== 'number' || Number.isFinite(val))) {
      target[key] = val;
    }
  }
}
