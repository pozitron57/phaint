// Приложение: создаёт и связывает документ, вид, отрисовщик, ввод, действия и интерфейс.
import { registerActions } from './actions-list.ts';
import { Actions, type KeyLike } from './core/actions.ts';
import { stepWidth } from './core/brush.ts';
import { Doc } from './core/doc.ts';
import { History } from './core/history.ts';
import type { Settings, DrawingTool, InkSettings, InkStyle } from './core/settings.ts';
import { PointerInput } from './input/pointer.ts';
import type { Platform } from './platform.ts';
import { PenTool } from './tools/pen.ts';
import { ShapeTool } from './tools/shape.ts';
import { inkDash, rebuildShape, MIN_GAMMA, MAX_GAMMA } from './core/shapes.ts';
import type { StrokeObj } from './core/types.ts';
import { SelectTool } from './tools/select.ts';
import { SpaceTool } from './tools/space.ts';
import { makeImage } from './core/types.ts';
import { prepareObjects } from './view/draw.ts';
import { EraserTool } from './tools/eraser.ts';
import type { Tool } from './tools/tool.ts';
import { brushCursor, fallbackCursor } from './ui/cursor.ts';
import { Hud } from './ui/hud.ts';
import { type Panel, backgroundPanel, brushPanel } from './ui/panels.ts';
import { Toolbar } from './ui/toolbar.ts';
import { Palette } from './ui/palette.ts';
import { ShortcutSettings } from './ui/shortcuts.ts';
import { Renderer } from './view/renderer.ts';
import { Viewport } from './view/viewport.ts';
import { DocumentSession } from './files/session.ts';
import { ObjectClipboard } from './files/object-clipboard.ts';
import { ImageText } from './files/image-text.ts';

const SAVE_DELAY = 400;
/** Шаг прокрутки стрелками, экранные px. */
const SCROLL_STEP = 80;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Нет элемента #${id}`);
  return el as T;
}

export class App {
  readonly clipboard=new ObjectClipboard(this);
  readonly imageText=new ImageText(this);
  readonly platform: Platform;
  readonly settings: Settings;
  readonly doc: Doc;
  readonly history: History;
  readonly view: Viewport;
  readonly actions: Actions;
  readonly renderer: Renderer;
  readonly input: PointerInput;
  readonly hud: Hud;
  readonly panels: { brush: Panel; background: Panel };
  readonly toolbar: Toolbar;
  readonly palette: Palette;
  readonly files: DocumentSession;
  readonly shortcuts:ShortcutSettings;
  tool: Tool;
  fullscreen = false;
  /** Панель запоминает последний выбор между прямой и стрелкой. */
  lineMode:'line'|'arrow'='line';
  /** Общая кнопка гиперболы/адиабаты; степень хранится в общих настройках. */
  hyperbolaMode:'hyperbola'|'adiabat'='hyperbola';

  private live: HTMLCanvasElement;
  private uiRoot: HTMLElement;
  /** Панель инструментов показана в полноэкранном режиме (там она по умолчанию скрыта). */
  private toolbarInFullscreen = false;
  private saveTimer = 0;
  private pasting=false;
  private previousTool:DrawingTool|'eraser'|'select'|'space'='pen';
  private lastDrawing:DrawingTool='pen';
  editGroup:object|undefined;
  recentArrow?:StrokeObj;

  constructor(platform: Platform, settings: Settings) {
    this.platform = platform;
    this.settings = settings;
    const scene = byId<HTMLCanvasElement>('scene');
    this.live = byId<HTMLCanvasElement>('live');
    this.uiRoot = byId('ui');

    this.doc = new Doc();
    this.history = new History(this.doc);
    this.view = new Viewport();
    this.actions = new Actions();
    this.renderer = new Renderer(scene, this.live, this.doc, this.view, settings.grid);
    this.tool = new PenTool(this);
    this.input = new PointerInput(this, this.live);
    this.view.onChange=()=>{this.recentArrow=undefined;this.tool.viewChanged?.();this.renderer.request();};

    registerActions(this);
    settings.keys=this.actions.preserveCustomBindings(settings.keys);
    this.actions.setOverrides(settings.keys);

    this.hud = new Hud(this, this.uiRoot);
    this.panels = { brush: brushPanel(this), background: backgroundPanel(this) };
    this.palette = new Palette(this);
    this.toolbar = new Toolbar(this);
    this.history.onTrim = oversized => {
      this.toolbar.update();
      if(oversized)this.hud.toast('Действие слишком большое для истории отмены');
    };
    this.uiRoot.append(this.toolbar.el, this.panels.brush.el, this.panels.background.el, this.palette.el);
    this.files = new DocumentSession(this);
    this.shortcuts=new ShortcutSettings(this);

    this.doc.onChange(change => {
      this.recentArrow=undefined;
      this.imageText.documentChanged();
      this.toolbar.update();
      if(this.tool instanceof SelectTool)this.tool.changed(change);
      if(this.tool instanceof ShapeTool)this.tool.changed(change);
    });
    window.addEventListener('pointerdown',()=>{this.recentArrow=undefined;},true);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup',e=>this.selection?.finishNudge(e.code));
    window.addEventListener('blur',()=>this.selection?.finishNudge());
    platform.onSelectAll(()=>this.selectAll());
    platform.onEdit(command=>{
      const t=document.activeElement;
      if(t?.closest('input,textarea,[contenteditable],dialog')){platform.editText(command);return;}
      if(command==='copy'||command==='cut')void this.clipboard.copy(command==='cut');else void this.clipboard.paste();
    });
    platform.onAction(id=>{
      const text=document.activeElement?.closest('input,textarea,[contenteditable]');
      if(text&&(id==='edit.undo'||id==='edit.redo')){document.execCommand(id==='edit.undo'?'undo':'redo');return;}
      if(this.shortcuts.open){if(id==='ui.shortcuts')this.shortcuts.show();return;}
      this.actions.run(id);
    });
    this.syncShortcuts();
    this.observeSize(scene);
    platform.onFullscreen((on) => {
      this.fullscreen = on;
      this.toolbarInFullscreen = false;
      if (on) this.closeAllPanels();
      this.applyChrome();
    });
    this.applyChrome();
    this.updateCursor();
    this.hud.setDebug(settings.ui.debug);
  }

  /** Настройки изменились: сохранить (с задержкой) и обновить зависящее от них. */
  settingsChanged(): void {
    this.recentArrow=undefined;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { void this.flushSettings().catch(error => console.error(error)); }, SAVE_DELAY);
    this.updateCursor();
    this.tool.settingsChanged?.();
    this.hud.refreshInk();
  }

  async flushSettings(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    await this.platform.saveSettings(this.settings);
  }

  private syncShortcuts():void {
    this.platform.updateShortcuts(Object.fromEntries(this.actions.list().filter(d=>!d.kind||d.kind==='action').map(d=>[d.id,this.actions.keysOf(d.id)])));
  }
  async applyShortcuts(keys:Record<string,string[]>):Promise<void> {
    const copy=this.actions.preserveCustomBindings(keys);window.clearTimeout(this.saveTimer);this.saveTimer=0;
    await this.platform.saveSettings({...this.settings,keys:copy});
    this.settings.keys=copy;this.actions.setOverrides(copy);this.input.clearModifiers();
    this.toolbar.update();this.syncShortcuts();
  }

  /** Сделать линию тоньше (-1) или толще (+1). */
  changeWidth(dir: 1 | -1): void {
    if(this.tool instanceof SelectTool && this.tool.objects.length){this.tool.width(dir>0?1.1:1/1.1);return;}
    const brush = this.tool.id === 'eraser' ? this.settings.eraser : this.widthSettings;
    brush.width = this.tool.id === 'eraser'
      ? Math.max(2,Math.min(120,Math.round(brush.width*(dir>0 ? 1.1 : 1/1.1)*10)/10)) : this.tool.id==='marker'?Math.max(2,Math.min(240,Math.round(brush.width*(dir>0?1.1:1/1.1)*10)/10)):stepWidth(brush.width,dir);
    this.hud.toast(`${this.tool.id === 'eraser' ? 'Ластик' : 'Толщина'} ${brush.width}`);
    this.panels.brush.sync();
    this.settingsChanged();
  }

  private get inkTool():DrawingTool {
    const selected=this.selectedStroke;
    return selected?(selected.marker?'marker':selected.shape?.kind??'pen'):this.lastDrawing;
  }
  get widthSettings():Pick<InkSettings,'width'> {
    const id=this.inkTool;
    return this.settings[id==='coordinates'?'arrow':id==='adiabat'?'hyperbola':id];
  }
  private get inkStyle():InkStyle {return this.settings.stylePerTool?this.settings[this.inkTool]:this.settings.sharedStyle;}
  /** Снимок для нового штриха или кадра предпросмотра. Толщина всегда берётся у инструмента. */
  get ink():InkSettings {return {...this.inkStyle,width:this.widthSettings.width};}
  setStylePerTool(on:boolean):void {
    if(on===this.settings.stylePerTool)return;
    this.settings.stylePerTool=on;this.settingsChanged();
    this.panels.brush.sync();this.toolbar.update();if(this.palette.open)this.palette.sync();
    this.hud.toast(on?'ВКЛ · У каждого инструмента свой штрих и цвет':'ВЫКЛ · Штрих и цвет общие для всех инструментов',1800);
  }
  get selection():SelectTool|null {return this.tool instanceof SelectTool?this.tool:null;}
  get selectedStroke():StrokeObj|undefined {return this.selection?.objects.find((o):o is StrokeObj=>o.kind==='stroke');}
  get currentColor():string {
    if(this.selectedStroke)return this.selectedStroke.color;
    const vector=this.selection?.objects.find(o=>o.kind==='vector');
    if(vector?.kind==='vector'){
      const color=vector.fill==='none'?vector.stroke:vector.fill;
      const rgb=/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
      return rgb?'#'+rgb.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):color;
    }return this.inkStyle.color;
  }
  selectTool(id: DrawingTool | 'eraser' | 'select' | 'space', toggle=true): void {
    if(this.input.blocked)return;
    if(this.tool.id===id){if(!toggle||id==='pen')return;id=this.previousTool;}
    this.input.finishCurrent();this.recentArrow=undefined;this.renderer.setLive(null);
    if(this.tool.id==='select')this.renderer.prepareEdit(null);
    this.selection?.finishNudge();
    this.previousTool=this.tool.id as typeof id;
    if(id!=='eraser'&&id!=='select'&&id!=='space')this.lastDrawing=id;
    if(id==='line'||id==='arrow')this.lineMode=id;
    if(id==='hyperbola'||id==='adiabat')this.hyperbolaMode=id;
    this.tool=id==='pen'||id==='marker'?new PenTool(this,id):id==='eraser'?new EraserTool(this):id==='select'?new SelectTool(this):id==='space'?new SpaceTool(this):new ShapeTool(this,id);
    this.palette.hide();this.panels.brush.sync();this.toolbar.update();this.updateCursor();
    const hint=(action:string,text:string)=>this.actions.hint(action)?` · ${this.actions.hint(action)} — ${text}`:'';
    const snap=hint('gesture.grid',this.settings.snapToGrid?'без привязки':'сетка');
    const names:Record<string,string>={pen:'Ручка',line:`Прямая${snap}`,arrow:`${this.settings.arrow.both?'Двусторонняя стрелка':'Стрелка'}${snap}`,coordinates:`Координаты · тяните между наконечниками${snap}`,ellipse:`Окружность${hint('gesture.ellipse','эллипс')}${snap}`,sine:`Синусоида${snap}`,parabola:`Парабола · задайте концы${snap}`,hyperbola:`Гипербола · направление жеста — четверть${snap}`,adiabat:`Адиабата · направление жеста — четверть${hint('ui.brush','γ')}${snap}`,marker:`Маркер${hint('gesture.marker','прямая')}`,eraser:'Ластик',select:'Выбор · углы — размер · ручка — поворот'};
    names.space='Раздвижение · тяните вверх или вниз · прокрутка доступна';
    if(id==='eraser'||id==='select'||id==='space')this.hud.toast(names[id]);else this.hud.drawingTool(names[id]);
  }
  /** Число наконечников задаётся явно; смена режима сохраняет последнюю стрелку для Безье. */
  selectArrow(both:boolean):void {
    if(this.input.blocked)return;
    const same=this.tool.id==='arrow'&&this.settings.arrow.both===both;
    this.input.finishCurrent();this.settings.arrow.both=both;
    this.selectTool('arrow',same);
    this.settingsChanged();this.panels.brush.sync();this.toolbar.update();
    if(this.tool.id==='arrow'){
      const grid=this.actions.hint('gesture.grid');
      this.hud.drawingTool((both?'Двусторонняя стрелка':'Стрелка')+(grid?` · ${grid} — ${this.settings.snapToGrid?'без привязки':'сетка'}`:''));
    }
  }
  get linePattern():'solid'|'dash'|'dots' {
    const dash=this.selectedStroke?.dash;
    return this.selectedStroke?(dash?(dash.dots?'dots':'dash'):'solid'):this.inkStyle.dashed?(this.inkStyle.dotted?'dots':'dash'):'solid';
  }
  toggleDash(mode:'dash'|'dots'='dash'):void {this.setLinePattern(this.linePattern===mode?'solid':mode);this.hud.linePattern(this.linePattern);}
  cycleLinePattern(direction=1):void {
    if(this.tool.id==='eraser'||this.tool.id==='space')return;
    const modes=['solid','dash','dots'] as const,mode=modes[(modes.indexOf(this.linePattern)+direction+3)%3];
    this.setLinePattern(mode);this.hud.linePattern(mode);
  }
  setLinePattern(mode:'solid'|'dash'|'dots'):void {
    this.setLineStyle({dashed:mode!=='solid',dotted:mode==='dots'});
  }
  setLineStyle(change:Partial<Omit<InkStyle,'color'>>,group?:object):void {
    if(this.tool.id==='eraser'||this.tool.id==='space')return;
    const {dashed,dotted,dotSpacing,dashLength,dashGap,round}=this.inkStyle;
    const pattern={dashed,dotted,dotSpacing,dashLength,dashGap,round,...change};
    Object.assign(this.settings.sharedStyle,pattern);
    if(this.settings.stylePerTool)Object.assign(this.settings[this.inkTool],pattern);
    this.selection?.editShapes(o=>({...o,dash:inkDash(pattern,o.pts[2])}),group);
    this.settingsChanged();this.panels.brush.sync();this.toolbar.update();
  }
  changeArrow(key:'headLength'|'headWidth'|'headRound'|'headType'|'both',value:number|string|boolean):void {
    Object.assign(this.settings.arrow,{[key]:value});
    this.selection?.editShapes(o=>o.shape?.kind==='arrow'||(o.shape?.kind==='coordinates'&&key!=='both')?rebuildShape(o,{...o.shape,[key]:value}):o,this.editGroup);
    this.settingsChanged();this.toolbar.update();
  }
  stepArrowHead(key:'headWidth'|'headLength',direction:1|-1):void {
    if(this.input.drawing||this.input.blocked)return;
    const selection=this.selection;
    const target=selection?(selection.objects.length===1?selection.selected:null):this.recentArrow;
    if(target?.kind!=='stroke')return;
    const shape=target.shape;
    if(shape?.kind!=='arrow'&&shape?.kind!=='coordinates')return;
    // Старые рисунки со значением выше предела ползунка уменьшаются по одному шагу.
    const value=Math.max(1,Math.min(Math.max(20,shape[key]),shape[key]+direction*.25));
    if(value===shape[key])return;
    const updated=rebuildShape(target,{...shape,[key]:value});
    if(selection)selection.editShapes(()=>updated);
    else{
      this.history.commit({removed:[target],added:[updated]});
      this.recentArrow=updated;
    }
    this.panels.brush.sync();
    this.hud.toast(`${key==='headWidth'?'Ширина':'Длина'} головки × ${Number(value.toFixed(2))}`);
  }
  changeSine(key:'period'|'amplitude',value:number):void {
    this.settings.sine[key]=value;
    this.selection?.editShapes(o=>o.shape?.kind==='sine'?rebuildShape(o,{...o.shape,[key]:value}):o,this.editGroup);
    this.settingsChanged();
  }
  changeGamma(value:number):void {
    if(!Number.isFinite(value))return;
    const gamma=Math.min(MAX_GAMMA,Math.max(MIN_GAMMA,value));
    this.settings.hyperbola.gamma=gamma;
    this.selection?.editShapes(o=>o.shape?.kind==='adiabat'?rebuildShape(o,{...o.shape,gamma}):o,this.editGroup);
    this.settingsChanged();this.toolbar.update();this.panels.brush.sync();
  }
  finishSlider():void {if(this.editGroup)this.history.endGroup(this.editGroup);this.editGroup=undefined;}

  async pasteImage(): Promise<void> {
    if(this.pasting||this.input.blocked||this.files.busy)return;
    this.input.finishCurrent();this.pasting=true;
    const generation=this.files.generation, position=this.input.position;
    const p=this.view.toWorld(position?.x??this.view.width/this.view.dpr/2,position?.y??this.view.height/this.view.dpr/2);
    const scale=this.files.baseScale;
    try {
      const image=await this.platform.clipboardImage();
      if(!image) {this.hud.toast('В буфере нет картинки');return;}
      if(!Number.isFinite(image.width)||!Number.isFinite(image.height)||image.width<=0||image.height<=0)throw new Error('Неверный размер картинки');
      const o=makeImage(this.doc.nextId(),this.doc.topZ(),p.x,p.y,image.width/scale,image.height/scale,image.dataURL);
      await prepareObjects([o]);
      if(generation!==this.files.generation||this.input.blocked)return;
      this.input.finishCurrent();this.history.commit({added:[o],removed:[]});
      this.selectTool('select',false);(this.tool as SelectTool).show(o);
    } catch(error) { await this.platform.files.error(String(error)); }
    finally {this.pasting=false;}
  }

  toggleOriginalEraser(): void {
    this.input.finishCurrent();this.settings.eraser.original=!this.settings.eraser.original;
    this.settingsChanged();this.toolbar.update();
    this.hud.toast(this.settings.eraser.original?'Ластик: включая исходный SVG':'Ластик: только добавленные штрихи');
  }

  deleteSelection(): void { if(this.tool instanceof SelectTool)this.tool.remove(); }

  /** Общее действие клавиши и меню macOS; в текстовом поле выбирается его текст. */
  selectAll():void {
    const target=document.activeElement;
    if(target instanceof HTMLTextAreaElement||(target instanceof HTMLInputElement&&!['range','checkbox','button'].includes(target.type))){target.select();return;}
    if(target instanceof Element&&target.closest('[contenteditable="true"]')){document.execCommand('selectAll');return;}
    if(this.input.blocked||(target instanceof Element&&target.closest('dialog')))return;
    this.input.finishCurrent();this.selectTool('select',false);this.selection?.selectAll();
  }

  chooseColor(color:string):void {
    this.settings.sharedStyle.color=color;
    if(this.settings.stylePerTool)this.settings[this.inkTool].color=color;
    if(this.selection?.objects.length)this.selection.recolor(color);
    this.settingsChanged();this.toolbar.update();
  }

  undo(): void {
    if(this.tool.pending&&!this.input.drawing){this.tool.cancel();return;}
    if (!this.input.drawing && !this.input.blocked) {this.selection?.finishNudge();this.history.undo();}
  }

  redo(): void {
    if (!this.input.drawing && !this.input.blocked) {this.selection?.finishNudge();this.history.redo();}
  }

  zoomStep(dir: 1 | -1): void {
    if (this.input.drawing) return;
    this.view.zoomStep(dir);
    this.onViewChanged();
  }

  rotate(steps: number): void {
    if (this.input.drawing) return;
    this.view.rotate(steps);
    this.hud.toast(`Поворот ${this.view.angle}°`);
  }

  resetView(): void {
    if (this.input.drawing) return;
    this.view.reset();
    if(this.files.baseScale!==1) this.view.zoomAt(this.view.width/this.view.dpr/2,this.view.height/this.view.dpr/2,this.files.baseScale);
    this.onViewChanged();
  }

  scroll(dx: number, dy: number,key?:KeyLike): void {
    if ((this.input.drawing&&!this.tool.scrollDuringDrag)||this.input.blocked) return;
    if(this.selection?.objects.length){this.moveSelection(-dx,-dy,key);return;}
    this.view.panBy(dx * SCROLL_STEP, dy * SCROLL_STEP);
  }

  moveSelection(dx:number,dy:number,key?:KeyLike,fast=false):void {
    const sample=key?{ctrl:key.ctrlKey,alt:key.altKey,shift:key.shiftKey,meta:key.metaKey}:undefined;
    const held=(id:string)=>!!key&&this.input.held(id,sample);
    const step=fast?this.settings.grid.step*2*this.view.scale:held('gesture.nudgeFine')?1:
      this.settings.grid.step*this.view.scale*(held('gesture.nudgeFast')?2:held('gesture.nudgeMedium') ? .5 : .2);
    this.selection?.nudge(dx*step,dy*step,key);
  }

  togglePanel(name: 'brush' | 'background'): void {
    const open = !this.panels[name].open;
    this.closePanels();
    this.panels[name].open = open;
    this.toolbar.update();
  }

  closePanels(): void {
    this.palette.hide();
    this.panels.brush.open = false;
    this.panels.background.open = false;
    this.toolbar.update();
  }

  toggleToolbar(): void {
    const open = !this.toolbar.el.hidden || this.panels.brush.open || this.panels.background.open || this.palette.open || this.settings.ui.debug;
    this.closeAllPanels();
    if (this.fullscreen) {
      this.toolbarInFullscreen = !open;
    } else {
      this.settings.ui.toolbar = !open;
      this.settingsChanged();
    }
    this.applyChrome();
  }

  private closeAllPanels(): void {
    this.closePanels();
    if (this.settings.ui.debug) {
      this.settings.ui.debug = false;
      this.hud.setDebug(false);
      this.settingsChanged();
    }
  }

  toggleDebug(): void {
    this.settings.ui.debug = !this.settings.ui.debug;
    this.hud.setDebug(this.settings.ui.debug);
    this.settingsChanged();
  }

  /** Вызывается вводом, когда штрих начался или закончился. */
  onDrawing(on: boolean): void {
    this.updateCursor();
    if (!on) this.toolbar.update();
  }

  /** Масштаб изменился: показать его и подогнать размер курсора. */
  onViewChanged(): void {
    this.hud.toast(`${Math.round(this.view.scale / this.files.baseScale * 100)} %`);
    this.updateCursor();
  }

  updateCursor(): void {
    const style = this.live.style;
    if (this.input?.panning || this.input?.panReady) {
      style.cursor = this.input.panning ? 'grabbing' : 'grab';
      return;
    }
    if(this.tool.id==='space'){style.cursor='ns-resize';return;}
    if(this.input?.held('gesture.select')&&!this.input.drawing&&this.tool.id!=='select'){style.cursor='pointer';return;}
    if(this.tool.id==='select') {style.cursor='default';return;}
    const eraser = this.tool.id === 'eraser';
    const width = eraser ? this.settings.eraser.width : this.widthSettings.width;
    style.cursor = brushCursor(width * this.view.scale, this.view.dpr, eraser ? undefined : this.inkStyle.color, {
      pattern: eraser ? 'solid' : this.linePattern,
      mark: this.tool.id === 'arrow' && this.settings.arrow.both ? 'arrowBoth'
        : this.tool.id === 'line' || this.tool.id === 'arrow' || this.tool.id === 'coordinates' ? this.tool.id : 'none',
    });
    if (!style.cursor) style.cursor = fallbackCursor();
  }

  /** Показать или скрыть панель инструментов в зависимости от режима. */
  private applyChrome(): void {
    const show = this.fullscreen ? this.toolbarInFullscreen : this.settings.ui.toolbar;
    this.toolbar.el.hidden = !show;
    this.uiRoot.classList.toggle('no-toolbar', !show);
    this.toolbar.update();
  }

  private onKey = (e: KeyboardEvent): void => {
    if(this.files?.processingFile && this.actions.handle(e,id=>id==='ui.escape')){
      e.preventDefault();e.stopImmediatePropagation();return;
    }
    if (this.input.blocked||this.shortcuts?.open) return;
    const t = e.target;
    if (t instanceof Element && t.closest('dialog')) return;
    const field=t instanceof Element?t.closest('input,textarea,select,[contenteditable="true"]'):null;
    if (field) {
      // Команды окна и файлов доступны из полей настроек; стандартное редактирование
      // текста сохраняется даже при переназначении команд холста на те же клавиши.
      const textCommand=e.metaKey&&!e.ctrlKey&&!e.altKey&&/^Key[ACVXZ]$/.test(e.code);
      if(!textCommand&&(e.metaKey||e.ctrlKey)&&this.actions.handle(e,id=>id.startsWith('app.')||id.startsWith('file.')||id==='ui.shortcuts'||id==='view.fullscreen')){
        e.preventDefault();e.stopPropagation();return;
      }
      const control = field instanceof HTMLInputElement && ['range', 'checkbox', 'button'].includes(field.type);
      const special = /^F\d+$/.test(e.code) || e.code === 'Escape';
      // В текстовом поле клавиши принадлежат полю; у ползунка и флажка — только стрелки и пробел.
      if (!control && !special) return;
      if (control && !e.metaKey && !e.ctrlKey && /^(Arrow|Home|End|Page|Space|Enter)/.test(e.code)) return;
    }
    const direction=(id:string)=>/^view\.(left|right|up|down)$/.test(id);
    const exact=this.actions.match(e),selectedDirection=this.selection?.objects.length&&this.actions.match(e,direction,true);
    // С выделением Cmd+стрелки ускоряют перенос. Без него прежний поворот вида
    // сохраняется. Явно переназначенное пользователем сочетание всегда приоритетно.
    const defaultRotation=exact?.startsWith('view.rotate')&&!Object.hasOwn(this.settings.keys,exact);
    let handled=selectedDirection&&(!exact||direction(exact)||defaultRotation)
      ?this.actions.handle(e,direction,true):this.actions.handle(e,id=>!this.input.drawing||!id.startsWith('arrowHead.'));
    // Настраиваемые клавиши цвета/толщины работают и с удерживаемыми модификаторами
    // геометрии. Более точное сочетание (например, вся палитра) имеет приоритет.
    if(!handled&&(this.input.drawing||this.tool.id==='select'||this.tool.pending)){
      handled=this.actions.handle(e,id=>id==='ui.escape'||id.startsWith('width.')||id==='color.palette'||id==='color.menu'||id.startsWith('style.')||
        (this.tool.id==='select'&&(id.startsWith('selection.rotate.')||id==='edit.delete')),true);
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  /** Следить за размером холста в пикселях устройства (в том числе при смене экрана). */
  private observeSize(el: HTMLElement): void {
    const apply = (w: number, h: number): void => {
      this.renderer.setSize(Math.round(w), Math.round(h), window.devicePixelRatio || 1);
      this.updateCursor();
    };
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const dp = entry.devicePixelContentBoxSize?.[0];
      if (dp) apply(dp.inlineSize, dp.blockSize);
      else apply(entry.contentRect.width * window.devicePixelRatio, entry.contentRect.height * window.devicePixelRatio);
    });
    try {
      ro.observe(el, { box: 'device-pixel-content-box' });
    } catch {
      ro.observe(el);
    }
    const r = el.getBoundingClientRect();
    apply(r.width * window.devicePixelRatio, r.height * window.devicePixelRatio);
  }
}
