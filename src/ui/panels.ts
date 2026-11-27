// Выдвижные панели настроек рядом с панелью инструментов: «Кисть» и «Фон и сетка».
// Панель не закрывается при рисовании: можно крутить ползунок и сразу пробовать штрих.
import { t, type LabelKey } from '../core/language.ts';
import type { App } from '../app.ts';
import { makeStroke } from '../core/types.ts';
import { rebuildShape, withShapeBounds, DEFAULT_GAMMA, MIN_GAMMA, MAX_GAMMA } from '../core/shapes.ts';
import { h, icon } from './dom.ts';

export class Panel {
  readonly el: HTMLElement;
  private container!:HTMLElement;
  private syncs: Array<() => void> = [];

  private labels:Array<()=>void>=[];
  private label(message:LabelKey):Text {
    const node=document.createTextNode(t(message));
    this.labels.push(()=>{node.data=t(message);});
    return node;
  }
  private attribute(node:HTMLElement,name:string,message:LabelKey):void {
    const update=()=>node.setAttribute(name,t(message));update();this.labels.push(update);
  }
  refreshLanguage():void {
    for(const update of this.labels)update();
    this.sync();
  }

  constructor(title:LabelKey, onClose: () => void) {
    const close=h('button', { class:'tb-btn small', onclick:onClose }, icon('close'));
    this.attribute(close,'title','panel.closeEsc');
    this.el = h(
      'section',
      { class: 'panel', hidden: true },
      h('div', { class: 'panel-head' }, h('span',null,this.label(title)), close),
    );
    this.container=this.el;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  set open(v: boolean) {
    this.el.hidden = !v;
    if (v) this.sync();
  }

  /** Перечитать значения из настроек (после хоткея или сброса). */
  sync(): void {
    for (const fn of this.syncs) fn();
  }

  slider(label:LabelKey, min: number, max: number, step: number, get: () => number, set: (v: number) => void, text: (v: number) => string,disabled=()=>false): void {
    const value = h('span');
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    const row=h('label', { class: 'row' }, h('div', { class: 'row-label' }, h('span', null, this.label(label)), value), input);
    const sync = (): void => {
      input.value = String(get());
      value.textContent = text(get());
      input.disabled=disabled();row.classList.toggle('disabled',input.disabled);
    };
    input.addEventListener('input', () => {
      if(input.disabled)return;
      set(Number(input.value));
      value.textContent = text(get());
    });
    let pointer=-1;
    const apply=(e:PointerEvent):void=>{
      if(input.disabled)return;
      const r=input.getBoundingClientRect(),t=Math.max(0,Math.min(1,(e.clientX-r.left-8)/(r.width-16)));
      const v=Math.max(min,Math.min(max,min+Math.round(t*(max-min)/step)*step));
      input.value=String(v);input.dispatchEvent(new Event('input',{bubbles:true}));
    };
    const stop=():void=>{if(pointer<0)return;const id=pointer;pointer=-1;try{input.releasePointerCapture(id);}catch{}input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();};
    input.addEventListener('pointerdown',e=>{if(e.button!==0||input.disabled)return;e.preventDefault();pointer=e.pointerId;input.dispatchEvent(new Event('editstart',{bubbles:true}));try{input.setPointerCapture(pointer);}catch{}apply(e);});
    window.addEventListener('pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();apply(e);}});
    window.addEventListener('pointerup',e=>{if(e.pointerId===pointer)stop();});
    window.addEventListener('pointercancel',e=>{if(e.pointerId===pointer)stop();});
    window.addEventListener('blur',stop);
    this.syncs.push(sync);
    this.container.append(row);
  }

  checkbox(label:LabelKey, get: () => boolean, set: (v: boolean) => void, disabled=()=>false): void {
    const input = h('input', { type: 'checkbox' });
    input.addEventListener('change', () => {
      set(input.checked);
      this.sync();
      input.blur();
    });
    this.syncs.push(() => {
      input.checked = get(); input.disabled=disabled();
    });
    this.container.append(h('label', { class: 'check' }, input, h('span', null, this.label(label))));
  }

  number(label:LabelKey,min:number,max:number,get:()=>number,set:(value:number)=>void):void {
    const input=h('input',{type:'text',inputmode:'decimal',class:'number-input'});
    this.attribute(input,'aria-label',label);
    let editing=false;
    const start=()=>{if(editing)return;editing=true;input.dispatchEvent(new Event('editstart',{bubbles:true}));};
    const sync=()=>{if(document.activeElement!==input)input.value=String(Number(get().toPrecision(9)));};
    input.addEventListener('focus',start);
    input.addEventListener('input',()=>{
      start();
      const text=input.value.trim().replace(',','.'),value=Number(text),valid=!!text&&Number.isFinite(value)&&value>=min&&value<=max;
      input.setAttribute('aria-invalid',String(!valid));if(valid)set(value);
    });
    input.addEventListener('blur',()=>{editing=false;input.value=String(Number(get().toPrecision(9)));input.removeAttribute('aria-invalid');input.dispatchEvent(new Event('change',{bubbles:true}));});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();input.blur();}});
    this.syncs.push(sync);this.container.append(h('label',{class:'row'},h('div',{class:'row-label'},this.label(label)),input));
  }

  button(label:LabelKey, run: () => void): void {
    const el = h('button', { class: 'btn' }, this.label(label));
    el.addEventListener('click', () => {
      run();
      el.blur();
    });
    this.container.append(el);
  }

  section(title:LabelKey,visible:()=>boolean,build:()=>void,enabled=()=>true):void {
    const parent=this.container,group=h('fieldset',null,h('legend',null,this.label(title)));parent.append(group);this.container=group;
    build();this.container=parent;this.syncs.push(()=>{group.hidden=!visible();group.disabled=!enabled();});
  }
  row(build:()=>void):void {
    const parent=this.container,group=h('div',{class:'checks-row'});parent.append(group);this.container=group;
    build();this.container=parent;
  }
  choice(label:LabelKey,options:Record<string,LabelKey>,get:()=>string,set:(v:string)=>void):void {
    const group=h('div',{class:'choice-buttons',role:'group','data-choice':label});
    this.attribute(group,'aria-label',label);
    for(const [value,name] of Object.entries(options)){
      const button=h('button',{class:'btn','data-value':value,type:'button'},this.label(name));
      button.addEventListener('click',()=>{set(value);this.sync();button.blur();});
      this.syncs.push(()=>{const active=get()===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
      group.append(button);
    }
    this.container.append(h('div',{class:'row'},h('div',{class:'row-label'},this.label(label)),group));
  }
  note(text: LabelKey | (() => string)): void {
    const el=h('p',{class:'note'},typeof text==='string'?this.label(text):text());
    if(typeof text==='function')this.syncs.push(()=>{el.textContent=text();});
    this.container.append(el);
  }
}

const percent = (v: number): string => `${Math.round(v * 100)} %`;

export function brushPanel(app:App):Panel {
  const p=new Panel('panel.tool',()=>app.closePanels());
  const selected=(kind:string)=>app.selection?.objects.find(o=>o.kind==='stroke'&&(kind==='marker'?o.marker:o.shape?.kind===kind||(kind==='arrow'&&o.shape?.kind==='coordinates'))) as import('../core/types.ts').StrokeObj|undefined;
  const active=(kind:string)=>app.tool.id===kind||(kind==='arrow'&&app.tool.id==='coordinates')||!!selected(kind);
  const coordinates=()=>app.tool.id==='coordinates'||selected('arrow')?.shape?.kind==='coordinates';
  const changed=()=>{app.settingsChanged();app.toolbar.update();};
  p.el.addEventListener('editstart',()=>{app.finishSlider();app.editGroup={};});
  p.el.addEventListener('change',()=>app.finishSlider());
  const widthControls=(max:number)=>{
    p.slider('panel.width',.3,max,.05,()=>app.selectedStroke?.pts[2]??app.ink.width,v=>{
      if(app.selection?.objects.length){const old=app.selectedStroke?.pts[2]??v;app.selection.editShapes(o=>{const pts=o.pts.slice();for(let i=2;i<pts.length;i+=3)pts[i]*=v/old;const next={...o,...makeStroke(o.id,o.z,o.ox,o.oy,pts,o.color),...(o.dash?{dash:{...o.dash,length:o.dash.length*v/old,gap:o.dash.gap*v/old}}:{})};return o.shape?rebuildShape(next):withShapeBounds(next);},app.editGroup);}else app.widthSettings.width=v;
      changed();
    },v=>String(Math.round(v*100)/100));
  };
  p.section('panel.linesAndArrows',()=>app.tool.id==='line'||app.tool.id==='arrow',()=>{
    p.choice('panel.draw',{line:'action.tool.line',arrow:'action.tool.arrow'},()=>app.tool.id,v=>app.selectTool(v as 'line'|'arrow',false));
  });
  p.section('panel.curve',()=>app.tool.id==='hyperbola'||app.tool.id==='adiabat',()=>{
    p.choice('panel.draw',{hyperbola:'action.tool.hyperbola',adiabat:'action.tool.adiabat'},()=>app.tool.id,v=>app.selectTool(v as 'hyperbola'|'adiabat',false));
  });
  p.section('panel.adiabatPvConst',()=>active('hyperbola')||active('adiabat'),()=>{
    const gamma=()=>selected('adiabat')?.shape?.gamma??app.settings.hyperbola.gamma;
    p.number('panel.exponent',MIN_GAMMA,MAX_GAMMA,gamma,v=>app.changeGamma(v));
    p.choice('panel.presets',{'1.4':'panel.gammaSevenFifths',[String(DEFAULT_GAMMA)]:'panel.gammaFiveThirds'},()=>String(gamma()),v=>app.changeGamma(Number(v)));
  },()=>active('adiabat'));
  p.section('action.tool.space',()=>app.tool.id==='space',()=>p.note('panel.spaceHint'));
  p.section('panel.width',()=>app.tool.id!=='eraser'&&app.tool.id!=='space'&&!active('marker'),()=>widthControls(60));
  p.section('panel.highlighterWidth',()=>active('marker'),()=>widthControls(240));
  p.section('action.tool.pen',()=>app.tool.id==='pen',()=>{
    const pen=app.settings.pen;
    p.slider('panel.pressureSensitivity',0,1,.01,()=>pen.pressure,v=>{pen.pressure=v;changed();},percent);
    p.slider('panel.pressureResponse',-1,1,.02,()=>pen.curve,v=>{pen.curve=v;changed();},v=>v.toFixed(2));
    p.slider('panel.smoothing',0,1,.01,()=>pen.smoothing,v=>{pen.smoothing=v;changed();},percent);
    p.slider('panel.endTaper',0,1,.01,()=>pen.taper,v=>{pen.taper=v;changed();},percent);
    p.slider('panel.thinFastStrokes',0,1,.01,()=>pen.speed,v=>{pen.speed=v;changed();},percent);
    p.checkbox('panel.predictStrokeTip',()=>app.settings.input.predict,v=>{app.settings.input.predict=v;changed();});
  });
  p.section('panel.stroke',()=>app.tool.id!=='eraser'&&app.tool.id!=='space',()=>{
    p.checkbox('action.style.perTool',()=>app.settings.stylePerTool,v=>app.setStylePerTool(v));
    const dash=()=>app.selectedStroke?.dash,width=()=>app.selectedStroke?.pts[2]??app.ink.width;
    const length=()=>dash()&&!dash()!.dots?dash()!.length/width():app.ink.dashLength;
    const gap=()=>dash()&&!dash()!.dots?dash()!.gap/width():app.ink.dashGap;
    const spacing=()=>dash()?.dots?dash()!.gap/width():app.ink.dotSpacing;
    const round=()=>dash()&&!dash()!.dots?dash()!.round:app.ink.round;
    const update=(key:'dashLength'|'dashGap'|'dotSpacing'|'round',value:number|boolean)=>{
      app.setLineStyle({dashLength:length(),dashGap:gap(),dotSpacing:spacing(),round:round(),dashed:app.linePattern!=='solid',dotted:app.linePattern==='dots',[key]:value},app.editGroup);
    };
    p.choice('panel.lineStyle',{solid:'panel.solid',dash:'panel.dashed',dots:'panel.dotted'},()=>app.linePattern,v=>app.setLinePattern(v as 'solid'|'dash'|'dots'));
    p.checkbox('panel.roundCaps',round,v=>update('round',v),()=>app.linePattern!=='dash');
    p.slider('panel.dashLengthLineWidth',.5,20,.25,length,v=>update('dashLength',v),v=>v.toFixed(2),()=>app.linePattern!=='dash');
    p.slider('panel.gapLineWidth',.5,20,.25,gap,v=>update('dashGap',v),v=>v.toFixed(2),()=>app.linePattern!=='dash');
    p.slider('panel.dotSpacingLineWidth',1.25,20,.25,spacing,v=>update('dotSpacing',v),v=>v.toFixed(2),()=>app.linePattern!=='dots');
  });
  p.section('panel.arrowhead',()=>active('arrow'),()=>{
    const both=()=>!coordinates()&&(selected('arrow')?.shape?.both??app.settings.arrow.both);
    const head=()=>selected('arrow')?.shape??app.arrowHeadSettings(app.tool.id==='coordinates'?'coordinates':'arrow');
    p.slider('panel.headLengthLineWidth',1,20,.25,()=>head().headLength,v=>app.changeArrow('headLength',v),v=>v.toFixed(2));
    p.slider('panel.headWidthLineWidth',1,20,.25,()=>head().headWidth,v=>app.changeArrow('headWidth',v),v=>v.toFixed(2));
    p.choice('panel.shape',{open:'panel.open',filled:'panel.triangle'},()=>head().headType,v=>app.changeArrow('headType',v));
    p.slider('panel.cornerRounding',0,1,.01,()=>head().headRound??.15,v=>app.changeArrow('headRound',v),percent,()=>head().headType!=='filled');
    p.checkbox('panel.bothEnds',both,v=>app.changeArrow('both',v),coordinates);
  });
  p.section('action.tool.marker',()=>active('marker'),()=>{
    p.slider('panel.opacity',.05,.8,.01,()=>selected('marker')?.opacity??app.settings.marker.opacity,v=>{
      app.settings.marker.opacity=v;app.selection?.editShapes(o=>o.marker?{...o,opacity:v}:o,app.editGroup);changed();
    },percent);
    p.note(()=>{
      const key=app.actions.hint('gesture.marker');
      const straight=key?t('panel.straightStroke', {key}):'';
      return straight+t('tool.markerOpacityHint');
    });
  });
  p.section('action.tool.sine',()=>active('sine'),()=>{
    p.slider('panel.amplitude',0,240,1,()=>selected('sine')?.shape?.amplitude??app.settings.sine.amplitude,v=>app.changeSine('amplitude',v),v=>String(Math.round(v)));
    p.slider('panel.period',12,600,1,()=>selected('sine')?.shape?.period??app.settings.sine.period,v=>app.changeSine('period',v),v=>String(Math.round(v)));
    p.note('panel.sineHint');
  });
  p.section('help.selection',()=>app.tool.id==='select',()=>{
    p.checkbox('panel.preserveLineWidth',()=>app.settings.selection.keepWidth,v=>{app.settings.selection.keepWidth=v;changed();});
    p.note(()=>{
      const free=app.actions.hint('gesture.resizeFree'),center=app.actions.hint('gesture.resizeCenter');
      return [t('panel.resizeHint'),free&&t('panel.freeResize', {key:free}),center&&t('panel.centerResize', {key:center})].filter(Boolean).join(' ');
    });
  });
  p.section('action.tool.eraser',()=>app.tool.id==='eraser',()=>{
    p.slider('panel.eraserSize',2,120,1,()=>app.settings.eraser.width,v=>{app.settings.eraser.width=v;changed();},v=>String(Math.round(v)));
    p.checkbox('action.eraser.original',()=>app.settings.eraser.original,v=>{app.input.finishCurrent();app.settings.eraser.original=v;changed();});
  });
  return p;
}

export function backgroundPanel(app: App): Panel {
  const grid = app.settings.grid;
  const changed = (): void => {
    app.settingsChanged();
    app.files.changed();
    app.renderer.invalidateScene(); p.sync();
  };
  const p = new Panel('action.ui.background', () => app.closePanels());
  p.checkbox('panel.showGrid', () => grid.enabled, (v) => { grid.enabled = v; changed(); });
  p.slider('panel.gridSpacing', 8, 120, 1, () => grid.step, (v) => { grid.step = v; changed(); }, (v) => String(Math.round(v)));
  p.checkbox('panel.snapToGridByDefault',()=>app.settings.snapToGrid,v=>{app.settings.snapToGrid=v;app.settingsChanged();});
  p.checkbox('panel.snapImagesToOneAnother',()=>app.settings.snapToImages,v=>{app.settings.snapToImages=v;app.settingsChanged();});
  p.note(()=>{
    const key=app.actions.hint('gesture.grid');
    return t('panel.hiddenGridHint')+(key?t('panel.gridModifier', {key}):'');
  });
  return p;
}
