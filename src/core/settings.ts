// Настройки инструментов и интерфейса. Старые файлы настроек дополняются новыми значениями.
import type { PenSettings } from './brush.ts';
import { DEFAULT_GAMMA, MIN_GAMMA, MAX_GAMMA, type ShapeKind } from './shapes.ts';
import { validCombo, normalizeCombo } from './actions.ts';
import { defaultExportSettings, normalizeExportSettings, type ExportSettings } from '../files/export-options.ts';
export interface GridSettings { enabled:boolean; step:number; save?:boolean }
export interface InkSettings { width:number; color:string; dashed:boolean; dotted:boolean; dotSpacing:number; dashLength:number; dashGap:number; round:boolean }
export type DrawingTool = 'pen' | 'marker' | ShapeKind;
export interface Settings {
  version:number;
  pen:PenSettings & InkSettings;
  line:InkSettings;
  arrow:InkSettings & {headLength:number;headWidth:number;headRound:number;headType:'open'|'filled';both:boolean};
  ellipse:InkSettings;
  sine:InkSettings & {amplitude:number;period:number};
  parabola:InkSettings;
  hyperbola:InkSettings & {gamma:number};
  marker:InkSettings & {opacity:number};
  eraser:{width:number;original:boolean};
  selection:{keepWidth:boolean};
  palette:string[];
  customColor:string;
  grid:GridSettings;
  snapToGrid:boolean;
  input:{predict:boolean};
  ui:{toolbar:boolean;debug:boolean};
  keys:Record<string,string[]>;
  export:ExportSettings;
}
export const PALETTE=['#315ca8','#79ad65','#c9514e','#000000','#ffffff','#cf914d','#946bb0'];
export const CYCLE=PALETTE.slice(0,3);
const ink=():InkSettings=>({width:2.6,color:PALETTE[0],dashed:false,dotted:false,dotSpacing:3,dashLength:4,dashGap:3,round:true});
export function defaultSettings():Settings {
  return {version:10,pen:{...ink(),pressure:.5,curve:0,smoothing:.25,taper:0,speed:0},
    line:ink(),arrow:{...ink(),headLength:5,headWidth:3,headRound:.4,headType:'open',both:false},ellipse:ink(),
    sine:{...ink(),amplitude:72,period:192},parabola:ink(),hyperbola:{...ink(),gamma:DEFAULT_GAMMA},marker:{...ink(),width:48,color:PALETTE[1],opacity:.5},
    eraser:{width:24,original:false},selection:{keepWidth:true},palette:[...PALETTE],customColor:'#ffffff',
    grid:{enabled:true,step:24,save:true},snapToGrid:true,input:{predict:false},ui:{toolbar:true,debug:false},keys:{},export:defaultExportSettings()};
}
export function mergeSettings(raw:unknown):Settings {
  const base=defaultSettings();merge(base as unknown as Record<string,unknown>,raw);
  base.version=10;
  // Новые исходные размеры один раз применяются и к прежнему профилю, в его клетках.
  if(!raw||typeof raw!=='object'||Number((raw as {version?:number}).version??0)<10){
    const step=base.grid.step>0?base.grid.step:24;
    base.sine.amplitude=3*step;base.sine.period=8*step;
  }
  if(!raw||typeof raw!=='object'||Number((raw as {version?:number}).version??0)<9)base.grid.save=true;
  if(!/^#[\da-f]{6}$/i.test(base.customColor))base.customColor='#ffffff';
  if(!raw||typeof raw!=='object'||Number((raw as {version?:number}).version??0)<8)base.input.predict=false;base.palette=[...PALETTE];
  const old:Record<string,string>={'#3f6fb5':PALETTE[0],'#4d9160':PALETTE[1],'#2f3136':'#000000'};
  for(const id of ['pen','line','arrow','ellipse','sine','parabola','hyperbola','marker'] as const){
    const b=base[id];b.width=Math.min(id==='marker'?240:60,Math.max(.3,b.width));
    b.color=old[b.color]??b.color;if(!/^#[\da-f]{6}$/i.test(b.color))b.color=PALETTE[0];
    b.dashLength=Math.min(40,Math.max(.5,b.dashLength));b.dashGap=Math.min(40,Math.max(.5,b.dashGap));
    b.dotSpacing=Math.min(20,Math.max(1.25,b.dotSpacing));
  }
  base.marker.opacity=Math.min(1,Math.max(.05,base.marker.opacity));
  base.sine.period=Math.min(2000,Math.max(12,base.sine.period));base.sine.amplitude=Math.min(1000,Math.max(0,base.sine.amplitude));
  base.hyperbola.gamma=Math.min(MAX_GAMMA,Math.max(MIN_GAMMA,base.hyperbola.gamma));
  base.arrow.headLength=Math.min(30,Math.max(1,base.arrow.headLength));base.arrow.headWidth=Math.min(30,Math.max(1,base.arrow.headWidth));
  base.arrow.headRound=Math.min(1,Math.max(0,base.arrow.headRound));
  if(base.arrow.headType!=='filled')base.arrow.headType='open';
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
function merge(target: Record<string, unknown>, src: unknown): void {
  if (!src || typeof src !== 'object') return;
  const from = src as Record<string, unknown>;
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
