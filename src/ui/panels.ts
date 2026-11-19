// Выдвижные панели настроек рядом с панелью инструментов: «Кисть» и «Фон и сетка».
// Панель не закрывается при рисовании: можно крутить ползунок и сразу пробовать штрих.
import type { App } from '../app.ts';
import { makeStroke } from '../core/types.ts';
import { inkDash, rebuildShape, withShapeBounds, DEFAULT_GAMMA, MIN_GAMMA, MAX_GAMMA } from '../core/shapes.ts';
import { h, icon } from './dom.ts';

export class Panel {
  readonly el: HTMLElement;
  private container!:HTMLElement;
  private syncs: Array<() => void> = [];

  constructor(title: string, onClose: () => void) {
    this.el = h(
      'section',
      { class: 'panel', hidden: true },
      h('div', { class: 'panel-head' }, h('span', null, title), h('button', { class: 'tb-btn small', title: 'Закрыть (Esc)', onclick: onClose }, icon('close'))),
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

  slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, text: (v: number) => string,disabled=()=>false): void {
    const value = h('span');
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    const row=h('label', { class: 'row' }, h('div', { class: 'row-label' }, h('span', null, label), value), input);
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

  checkbox(label: string, get: () => boolean, set: (v: boolean) => void, disabled=()=>false): void {
    const input = h('input', { type: 'checkbox' });
    input.addEventListener('change', () => {
      set(input.checked);
      this.sync();
      input.blur();
    });
    this.syncs.push(() => {
      input.checked = get(); input.disabled=disabled();
    });
    this.container.append(h('label', { class: 'check' }, input, h('span', null, label)));
  }

  number(label:string,min:number,max:number,get:()=>number,set:(value:number)=>void):void {
    const input=h('input',{type:'text',inputmode:'decimal','aria-label':label,class:'number-input'});
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
    this.syncs.push(sync);this.container.append(h('label',{class:'row'},h('div',{class:'row-label'},label),input));
  }

  button(label: string, run: () => void): void {
    const el = h('button', { class: 'btn' }, label);
    el.addEventListener('click', () => {
      run();
      el.blur();
    });
    this.container.append(el);
  }

  section(title:string,visible:()=>boolean,build:()=>void,enabled=()=>true):void {
    const parent=this.container,group=h('fieldset',null,h('legend',null,title));parent.append(group);this.container=group;
    build();this.container=parent;this.syncs.push(()=>{group.hidden=!visible();group.disabled=!enabled();});
  }
  row(build:()=>void):void {
    const parent=this.container,group=h('div',{class:'checks-row'});parent.append(group);this.container=group;
    build();this.container=parent;
  }
  choice(label:string,options:Record<string,string>,get:()=>string,set:(v:string)=>void):void {
    const group=h('div',{class:'choice-buttons',role:'group','aria-label':label});
    for(const [value,name] of Object.entries(options)){
      const button=h('button',{class:'btn','data-value':value,type:'button'},name);
      button.addEventListener('click',()=>{set(value);this.sync();button.blur();});
      this.syncs.push(()=>{const active=get()===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
      group.append(button);
    }
    this.container.append(h('div',{class:'row'},h('div',{class:'row-label'},label),group));
  }
  note(text: string): void {
    this.container.append(h('p', { class: 'note' }, text));
  }
}

const percent = (v: number): string => `${Math.round(v * 100)} %`;

export function brushPanel(app:App):Panel {
  const p=new Panel('Инструмент',()=>app.closePanels());
  const selected=(kind:string)=>app.selection?.objects.find(o=>o.kind==='stroke'&&(kind==='marker'?o.marker:o.shape?.kind===kind||(kind==='arrow'&&o.shape?.kind==='coordinates'))) as import('../core/types.ts').StrokeObj|undefined;
  const active=(kind:string)=>app.tool.id===kind||(kind==='arrow'&&app.tool.id==='coordinates')||!!selected(kind);
  const coordinates=()=>app.tool.id==='coordinates'||selected('arrow')?.shape?.kind==='coordinates';
  const changed=()=>{app.settingsChanged();app.toolbar.update();};
  p.el.addEventListener('editstart',()=>{app.finishSlider();app.editGroup={};});
  p.el.addEventListener('change',()=>app.finishSlider());
  const widthControls=(max:number)=>{
    p.slider('Толщина',.3,max,.05,()=>app.selectedStroke?.pts[2]??app.ink.width,v=>{
      if(app.selection?.objects.length){const old=app.selectedStroke?.pts[2]??v;app.selection.editShapes(o=>{const pts=o.pts.slice();for(let i=2;i<pts.length;i+=3)pts[i]*=v/old;const next={...o,...makeStroke(o.id,o.z,o.ox,o.oy,pts,o.color),...(o.dash?{dash:{...o.dash,length:o.dash.length*v/old,gap:o.dash.gap*v/old}}:{})};return o.shape?rebuildShape(next):withShapeBounds(next);},app.editGroup);}else app.ink.width=v;
      changed();
    },v=>String(Math.round(v*100)/100));
  };
  p.section('Режим стрелки',()=>app.tool.id==='arrow'||app.tool.id==='coordinates',()=>{
    p.choice('Рисовать',{arrow:'Стрелка',coordinates:'Координаты'},()=>app.tool.id,v=>app.selectTool(v as 'arrow'|'coordinates',false));
  });
  p.section('Кривая',()=>app.tool.id==='hyperbola'||app.tool.id==='adiabat',()=>{
    p.choice('Рисовать',{hyperbola:'Гипербола',adiabat:'Адиабата'},()=>app.tool.id,v=>app.selectTool(v as 'hyperbola'|'adiabat',false));
  });
  p.section('Адиабата · pVᵞ = const',()=>active('hyperbola')||active('adiabat'),()=>{
    const gamma=()=>selected('adiabat')?.shape?.gamma??app.settings.hyperbola.gamma;
    p.number('Показатель γ',MIN_GAMMA,MAX_GAMMA,gamma,v=>app.changeGamma(v));
    p.choice('Быстрый выбор',{'1.4':'7/5',[String(DEFAULT_GAMMA)]:'5/3'},()=>String(gamma()),v=>app.changeGamma(Number(v)));
  },()=>active('adiabat'));
  p.section('Толщина',()=>app.tool.id!=='eraser'&&!active('marker'),()=>widthControls(60));
  p.section('Толщина маркера',()=>active('marker'),()=>widthControls(240));
  p.section('Ручка',()=>app.tool.id==='pen',()=>{
    const pen=app.settings.pen;
    p.slider('Влияние нажатия',0,1,.01,()=>pen.pressure,v=>{pen.pressure=v;changed();},percent);
    p.slider('Отклик на нажим',-1,1,.02,()=>pen.curve,v=>{pen.curve=v;changed();},v=>v.toFixed(2));
    p.slider('Сглаживание',0,1,.01,()=>pen.smoothing,v=>{pen.smoothing=v;changed();},percent);
    p.slider('Сужение концов',0,1,.01,()=>pen.taper,v=>{pen.taper=v;changed();},percent);
    p.slider('Быстрый штрих тоньше',0,1,.01,()=>pen.speed,v=>{pen.speed=v;changed();},percent);
    p.checkbox('Предсказывать кончик штриха',()=>app.settings.input.predict,v=>{app.settings.input.predict=v;changed();});
  });
  p.section('Линия',()=>!['eraser','marker'].includes(app.tool.id)&&!active('marker'),()=>{
    const dash=()=>app.selectedStroke?.dash,width=()=>app.selectedStroke?.pts[2]??app.ink.width;
    const length=()=>dash()&&!dash()!.dots?dash()!.length/width():app.ink.dashLength;
    const gap=()=>dash()&&!dash()!.dots?dash()!.gap/width():app.ink.dashGap;
    const spacing=()=>dash()?.dots?dash()!.gap/width():app.ink.dotSpacing;
    const round=()=>dash()&&!dash()!.dots?dash()!.round:app.ink.round;
    const update=(key:'dashLength'|'dashGap'|'dotSpacing'|'round',value:number|boolean)=>{
      Object.assign(app.ink,{dashLength:length(),dashGap:gap(),dotSpacing:spacing(),round:round(),dashed:app.linePattern!=='solid',dotted:app.linePattern==='dots',[key]:value});
      app.selection?.editShapes(o=>o.marker?o:{...o,dash:inkDash(app.ink,o.pts[2])},app.editGroup);changed();
    };
    p.choice('Рисунок линии',{solid:'Сплошная',dash:'Штрихи (2)',dots:'Точки (5)'},()=>app.linePattern,v=>app.setLinePattern(v as 'solid'|'dash'|'dots'));
    p.checkbox('Круглые концы',round,v=>update('round',v),()=>app.linePattern!=='dash');
    p.slider('Длина штриха × толщину',.5,20,.25,length,v=>update('dashLength',v),v=>v.toFixed(2),()=>app.linePattern!=='dash');
    p.slider('Промежуток × толщину',.5,20,.25,gap,v=>update('dashGap',v),v=>v.toFixed(2),()=>app.linePattern!=='dash');
    p.slider('Шаг точек × толщину',1.25,20,.25,spacing,v=>update('dotSpacing',v),v=>v.toFixed(2),()=>app.linePattern!=='dots');
  });
  p.section('Головка стрелки',()=>active('arrow'),()=>{
    const head=()=>selected('arrow')?.shape??app.settings.arrow;
    p.slider('Длина головки × толщину',1,20,.25,()=>head().headLength,v=>app.changeArrow('headLength',v),v=>v.toFixed(2));
    p.slider('Ширина головки × толщину',1,20,.25,()=>head().headWidth,v=>app.changeArrow('headWidth',v),v=>v.toFixed(2));
    p.choice('Форма',{open:'Открытая',filled:'Треугольник'},()=>head().headType,v=>app.changeArrow('headType',v));
    p.slider('Скругление углов',0,1,.01,()=>head().headRound??.15,v=>app.changeArrow('headRound',v),percent,()=>head().headType!=='filled');
    p.checkbox('На обоих концах',()=>coordinates()?false:head().both,v=>app.changeArrow('both',v),coordinates);
  });
  p.section('Маркер',()=>active('marker'),()=>{
    p.slider('Непрозрачность',.05,.8,.01,()=>selected('marker')?.opacity??app.settings.marker.opacity,v=>{
      app.settings.marker.opacity=v;app.selection?.editShapes(o=>o.marker?{...o,opacity:v}:o,app.editGroup);changed();
    },percent);
    p.note('Ctrl — прямая. Один проход не темнеет на пересечениях.');
  });
  p.section('Синусоида',()=>active('sine'),()=>{
    p.slider('Амплитуда',1,240,1,()=>selected('sine')?.shape?.amplitude??app.settings.sine.amplitude,v=>app.changeSine('amplitude',v),v=>String(Math.round(v)));
    p.slider('Период',12,600,1,()=>selected('sine')?.shape?.period??app.settings.sine.period,v=>app.changeSine('period',v),v=>String(Math.round(v)));
    p.note('M: оранжевые ручки — амплитуда, период и число волн.');
  });
  p.section('Выделение',()=>app.tool.id==='select',()=>{
    p.checkbox('Сохранять толщину линий',()=>app.settings.selection.keepWidth,v=>{app.settings.selection.keepWidth=v;changed();});
    p.note('Маркер и картинки масштабируются целиком. Shift — свободные пропорции, Alt — от центра.');
  });
  p.section('Ластик',()=>app.tool.id==='eraser',()=>{
    p.slider('Размер ластика',2,120,1,()=>app.settings.eraser.width,v=>{app.settings.eraser.width=v;changed();},v=>String(Math.round(v)));
    p.checkbox('Стирать также исходный SVG',()=>app.settings.eraser.original,v=>{app.input.finishCurrent();app.settings.eraser.original=v;changed();});
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
  const p = new Panel('Фон и сетка', () => app.closePanels());
  p.checkbox('Показывать сетку', () => grid.enabled, (v) => { grid.enabled = v; changed(); });
  p.slider('Шаг клетки', 8, 120, 1, () => grid.step, (v) => { grid.step = v; changed(); }, (v) => String(Math.round(v)));
  p.checkbox('Привязка к сетке по умолчанию',()=>app.settings.snapToGrid,v=>{app.settings.snapToGrid=v;app.settingsChanged();});
  p.note('Alt временно меняет привязку на обратную. Работает и при скрытой сетке.');
  return p;
}
