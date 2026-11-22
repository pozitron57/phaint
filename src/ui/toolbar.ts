// Панель инструментов: кнопки, каждая запускает действие из реестра (core/actions.ts).
import type { App } from '../app.ts';
import { gammaLabel, h, icon } from './dom.ts';

interface Button {
  el: HTMLButtonElement;
  action: string;
  title:string;
}

export class Toolbar {
  readonly el: HTMLElement;
  private app: App;
  private buttons: Button[] = [];

  constructor(app: App) {
    this.app = app;
    this.el = h(
      'aside',
      { class: 'toolbar' },
      this.button('tool.pen', 'pen', 'Ручка'),
      this.button('tool.line', 'line', 'Прямая'),
      this.button('tool.coordinates','coordinates','Координаты'),
      this.button('tool.marker','marker','Маркер'),
      this.button('tool.ellipse','ellipse','Окружность / эллипс'),
      this.button('tool.sine','sine','Синусоида'),
      this.button('tool.parabola','parabola','Парабола'),
      this.button('tool.hyperbola','hyperbola','Гипербола'),
      this.button('style.dash','dash','Штриховая линия'),
      this.button('tool.eraser','eraser','Ластик'),
      this.button('eraser.original','original','Стирать также исходный SVG'),
      this.button('tool.select', 'select', 'Выбор объекта'),
      this.button('tool.space','space','Раздвижение'),
      this.button('edit.pasteImage', 'image', 'Вставить картинку'),
      this.button('color.menu', 'color', 'Цвет'),
      h('div', { class: 'tb-sep' }),
      this.button('file.open', 'open', 'Открыть SVG'),
      this.button('file.save', 'save', 'Сохранить SVG'),
      h('div', { class: 'tb-sep' }),
      this.button('ui.brush', 'sliders', 'Настройки кисти'),
      this.button('ui.background', 'grid', 'Фон и сетка'),
      this.button('ui.shortcuts','keyboard','Настройки клавиш'),
      h('div', { class: 'tb-sep' }),
      this.button('edit.undo', 'undo', 'Отменить'),
      this.button('edit.redo', 'redo', 'Повторить'),
      h('div', { class: 'tb-sep' }),
      this.button('view.fullscreen', 'fullscreen', 'Полный экран'),
    );
    this.update();
  }

  /** Обновить подсветку и доступность кнопок. */
  update(): void {
    const { app } = this;
    for (const b of this.buttons) {
      let hintAction=b.action,title=b.title;
      let active = false;
      let disabled = false;
      if(b.action==='tool.line'){
        active=app.tool.id==='line'||app.tool.id==='arrow';
        const mode=app.lineMode==='line'?'line':app.settings.arrow.both?'arrowBoth':'arrow';
        hintAction=`tool.${mode}`;title=mode==='line'?'Прямая':mode==='arrowBoth'?'Двусторонняя стрелка':'Стрелка';
        if(b.el.dataset.mode!==mode){
          b.el.dataset.mode=mode;b.el.replaceChildren(icon(mode));
        }
      }
      else if(b.action==='tool.hyperbola'){
        active=app.tool.id==='hyperbola'||app.tool.id==='adiabat';
        const mode=app.hyperbolaMode,label=gammaLabel(app.settings.hyperbola.gamma);
        hintAction=`tool.${mode}`;title=mode==='adiabat'?`Адиабата · γ = ${label}`:'Гипербола';
        if(b.el.dataset.mode!==mode||b.el.dataset.gamma!==label){
          b.el.dataset.mode=mode;b.el.dataset.gamma=label;
          b.el.replaceChildren(icon('hyperbola'));
          if(mode==='adiabat')b.el.append(h('span',{class:'exponent-badge','aria-hidden':'true'},label));
        }
      }
      else if (b.action.startsWith('tool.')) active=app.tool.id===b.action.slice(5);
      else if (b.action === 'eraser.original') { active=app.settings.eraser.original;disabled=app.tool.id!=='eraser';b.el.classList.toggle('reserved',disabled);b.el.setAttribute('aria-pressed',String(active)); }
      else if (b.action === 'color.menu') b.el.style.color = app.currentColor;
      else if (b.action === 'style.dash') {
        active=app.linePattern!=='solid';
        const mode=app.linePattern;
        if(b.el.dataset.mode!==mode){b.el.dataset.mode=mode;b.el.replaceChildren(icon(mode==='solid'?'line':mode));}
        title={solid:'Сплошная линия',dash:'Штриховая линия',dots:'Линия из точек'}[mode]+' · следующий вид';
      }
      else if (b.action === 'ui.brush') active = app.panels.brush.open;
      else if (b.action === 'ui.background') active = app.panels.background.open;
      else if (b.action === 'edit.undo') disabled = !app.history.canUndo;
      else if (b.action === 'edit.redo') disabled = !app.history.canRedo;
      else if (b.action === 'view.fullscreen') active = app.fullscreen;
      b.el.classList.toggle('active', active);
      b.el.disabled = disabled;
      const hint=app.actions.hint(hintAction);b.el.title=title+(hint?` (${hint})`:'');
      if(b.action==='tool.line'&&active)b.el.title+=app.lineMode==='line'?' · ещё один щелчок — стрелка':' · ещё один щелчок — прямая';
      if(['tool.line','tool.select'].includes(b.action)&&app.actions.hint('gesture.bezier'))b.el.title+=` · ${app.actions.hint('gesture.bezier')}+перетаскивание — Безье`;
    }
  }

  private button(action: string, iconName: string, title: string): HTMLButtonElement {
    const hint = this.app.actions.hint(action);
    const el = h(
      'button',
      {
        class: 'tb-btn',
        'data-action':action,
        title: hint ? `${title} (${hint})` : title,
        onclick: () => {
          if(action==='tool.line'){
            const current=this.app.tool.id;
            this.app.selectTool(current==='line'?'arrow':current==='arrow'?'line':this.app.lineMode,false);
          }
          else if(action==='tool.hyperbola')this.app.selectTool(this.app.hyperbolaMode);
          else if(action==='style.dash')this.app.cycleLinePattern();
          else this.app.actions.run(action);
          el.blur();
        },
      },
      icon(iconName),
    );
    this.buttons.push({ el, action, title });
    return el;
  }
}
