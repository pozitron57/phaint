// Панель инструментов: кнопки, каждая запускает действие из реестра (core/actions.ts).
import { t, type LabelKey } from '../core/language.ts';
import type { App } from '../app.ts';
import { gammaLabel, h, icon } from './dom.ts';

interface Button {
  el: HTMLButtonElement;
  action: string;
  title:LabelKey;
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
      this.button('tool.pen', 'pen', 'action.tool.pen'),
      this.button('tool.line', 'line', 'action.tool.line'),
      this.button('tool.coordinates','coordinates','action.tool.coordinates'),
      this.button('tool.marker','marker','action.tool.marker'),
      this.button('tool.ellipse','ellipse','action.tool.ellipse'),
      this.button('tool.sine','sine','action.tool.sine'),
      this.button('tool.parabola','parabola','action.tool.parabola'),
      this.button('tool.hyperbola','hyperbola','action.tool.hyperbola'),
      this.button('style.dash','dash','action.style.dashed'),
      this.button('tool.eraser','eraser','action.tool.eraser'),
      this.button('eraser.original','original','action.eraser.original'),
      this.button('tool.select', 'select', 'action.tool.select'),
      this.button('tool.space','space','action.tool.space'),
      this.button('edit.pasteImage', 'image', 'action.edit.pasteImage'),
      this.button('color.menu', 'color', 'panel.color'),
      h('div', { class: 'tb-sep' }),
      this.button('file.open', 'open', 'panel.openSvg'),
      this.button('file.save', 'save', 'action.file.save'),
      h('div', { class: 'tb-sep' }),
      this.button('ui.brush', 'sliders', 'panel.brushSettings'),
      this.button('ui.background', 'grid', 'action.ui.background'),
      this.button('ui.shortcuts','keyboard','panel.settings'),
      h('div', { class: 'tb-sep' }),
      this.button('edit.undo', 'undo', 'action.edit.undo'),
      this.button('edit.redo', 'redo', 'action.edit.redo'),
      h('div', { class: 'tb-sep' }),
      this.button('view.fullscreen', 'fullscreen', 'action.view.fullscreen'),
    );
    this.update();
  }

  /** Обновить подсветку и доступность кнопок. */
  update(): void {
    const { app } = this;
    for (const b of this.buttons) {
      let hintAction=b.action,title=t(b.title);
      let active = false;
      let disabled = false;
      if(b.action==='tool.line'){
        active=app.tool.id==='line'||app.tool.id==='arrow';
        const mode=app.lineMode==='line'?'line':app.settings.arrow.both?'arrowBoth':'arrow';
        hintAction=`tool.${mode}`;title=t(mode==='line'?'action.tool.line':mode==='arrowBoth'?'action.tool.arrowBoth':'action.tool.arrow');
        if(b.el.dataset.mode!==mode){
          b.el.dataset.mode=mode;b.el.replaceChildren(icon(mode));
        }
      }
      else if(b.action==='tool.hyperbola'){
        active=app.tool.id==='hyperbola'||app.tool.id==='adiabat';
        const mode=app.hyperbolaMode,label=gammaLabel(app.settings.hyperbola.gamma);
        hintAction=`tool.${mode}`;title=mode==='adiabat'?`${t('action.tool.adiabat')} · γ = ${label}`:t('action.tool.hyperbola');
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
        title=t(({solid:'action.style.solid',dash:'action.style.dashed',dots:'panel.dottedLine'} as const)[mode])+t('panel.nextStyle');
      }
      else if (b.action === 'ui.brush') active = app.panels.brush.open;
      else if (b.action === 'ui.background') active = app.panels.background.open;
      else if (b.action === 'edit.undo') disabled = !app.history.canUndo;
      else if (b.action === 'edit.redo') disabled = !app.history.canRedo;
      else if (b.action === 'view.fullscreen') active = app.fullscreen;
      b.el.classList.toggle('active', active);
      b.el.disabled = disabled;
      const hint=app.actions.hint(hintAction);b.el.title=title+(hint?` (${hint})`:'');
      if(b.action==='edit.pasteImage'){
        const free=app.actions.hint('edit.pasteImageFree');
        if(free)b.el.title+=t('tool.pasteAtPointer', {shortcut:free});
      }
      if(b.action==='tool.line'&&active)b.el.title+=t(app.lineMode==='line'?'panel.clickAgainForAnArrow':'panel.clickAgainForALine');
      if(['tool.line','tool.select'].includes(b.action)&&app.actions.hint('gesture.bezier'))b.el.title+=` · ${app.actions.hint('gesture.bezier')}+${t('toolbar.dragForBezierControlPoints')}`;
    }
  }

  private button(action: string, iconName: string, title: LabelKey): HTMLButtonElement {
    const hint = this.app.actions.hint(action);
    const el = h(
      'button',
      {
        class: 'tb-btn',
        'data-action':action,
        title: hint ? `${t(title)} (${hint})` : t(title),
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
