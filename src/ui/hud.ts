// Всплывающая подсказка внизу экрана («Толщина 2.6», «125 %») и отладочная панель с числами о пере и отрисовке.
import type { App } from '../app.ts';
import type { InkSettings } from '../core/settings.ts';
import { h } from './dom.ts';
import { formatFileBytes } from '../files/file-stats.ts';

/** build.mjs подставляет версию из package.json, без запроса к Electron. */
declare const __PHAINT_VERSION__:string;

const TOAST_MS = 900;
const DEBUG_MS = 250;
type LinePattern = 'solid'|'dash'|'dots';
const PATTERN_LABELS={solid:'Сплошная линия',dash:'Штриховая линия',dots:'Линия из точек'};

/** Нормированная толщина: образец показывает шаг/концы штрихов даже у очень тонкого пера. */
function lineSample(mode:LinePattern,ink?:InkSettings):SVGSVGElement {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 128 20');svg.setAttribute('width','128');svg.setAttribute('height','20');svg.setAttribute('aria-hidden','true');
  const line=document.createElementNS(svg.namespaceURI,'path');
  line.setAttribute('d','M6 10H122');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','3');
  line.setAttribute('stroke-linecap',mode==='dash'&&ink&&!ink.round?'butt':'round');
  if(mode!=='solid')line.setAttribute('stroke-dasharray',mode==='dots'?`0 ${ink?ink.dotSpacing*3:9}`:ink?`${ink.dashLength*3} ${ink.dashGap*3}`:'13 9');
  svg.append(line);return svg;
}

export class Hud {
  private app: App;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private toolText:string|null=null;
  private debugEl: HTMLElement;
  private debugText: HTMLElement;
  private debugTimer = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsStart = 0;
  private fpsRaf = 0;
  private tabletPending = false;
  private tabletText = '';

  constructor(app: App, root: HTMLElement) {
    this.app = app;
    this.toastEl = h('div', { class: 'toast' });
    this.debugText = h('pre', { class: 'debug-text' });
    this.debugEl = h(
      'div',
      { class: 'debug', hidden: true },
      this.debugText,
      h(
        'div',
        { class: 'debug-buttons' },
        h('button', { class: 'btn', onclick: () => app.actions.run('debug.generate') }, '+10 000 штрихов'),
        h('button', { class: 'btn', onclick: () => app.actions.run('debug.clear') }, 'Очистить'),
      ),
    );
    root.append(this.toastEl, this.debugEl);
  }

  toast(text: string, duration=TOAST_MS): void {
    this.toolText=null;
    this.toastEl.textContent = text;
    this.toastEl.removeAttribute('aria-label');
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), duration);
  }

  clearToast(): void {
    window.clearTimeout(this.toastTimer); this.toolText=null; this.toastEl.classList.remove('show');
  }

  linePattern(mode:LinePattern):void {
    this.toast('');
    this.toastEl.setAttribute('aria-label',PATTERN_LABELS[mode]);
    this.toastEl.append(lineSample(mode));
  }

  drawingTool(text:string):void {
    this.toast('');this.toolText=text;this.refreshInk();
  }

  /** Цвет можно сменить, пока подсказка ещё видна; таймер от этого не продлевается. */
  refreshInk():void {
    if(this.toolText===null||!this.toastEl.classList.contains('show'))return;
    const ink=this.app.ink,mode=this.app.linePattern;
    const swatch=h('span',{class:'toast-color','aria-hidden':'true'});swatch.style.backgroundColor=ink.color;
    this.toastEl.replaceChildren(h('div',{class:'toast-tool'},swatch,
      h('div',{class:'toast-tool-detail'},h('span',null,this.toolText),lineSample(mode,ink))));
    this.toastEl.setAttribute('aria-label',`${this.toolText}. Цвет ${ink.color}. ${PATTERN_LABELS[mode]}`);
  }

  setDebug(on: boolean): void {
    this.debugEl.hidden = !on;
    window.clearInterval(this.debugTimer);
    cancelAnimationFrame(this.fpsRaf);
    if (!on) return;
    this.fpsFrames = 0;
    this.fpsStart = performance.now();
    this.fpsRaf = requestAnimationFrame(this.countFrame);
    this.debugTimer = window.setInterval(() => this.refresh(), DEBUG_MS);
    this.refresh();
  }

  /** Счётчик кадров экрана: работает только при открытой отладочной панели. */
  private countFrame = (t: number): void => {
    this.fpsFrames++;
    if (t - this.fpsStart >= 500) {
      this.fps = Math.round((this.fpsFrames * 1000) / (t - this.fpsStart));
      this.fpsFrames = 0;
      this.fpsStart = t;
    }
    this.fpsRaf = requestAnimationFrame(this.countFrame);
  };

  private refresh(): void {
    const { input, renderer, view, doc, platform } = this.app;
    const t = renderer.tiles.stats();
    const saved=this.app.files?.lastWrite,processing=saved?.processing;
    this.debugText.textContent = [
      `Phaint · версия ${__PHAINT_VERSION__}`,
      `устройство: ${input.lastType}   нажатие: ${input.lastPressure.toFixed(2)}`,
      `точек/с: ${input.rate || '—'}   в событии: ${input.perEvent || '—'}   предсказано: ${input.predictedCount}`,
      `кадр: ${renderer.frameMs.toFixed(1)} мс   кадров/с: ${this.fps || '—'}`,
      `объектов: ${doc.size}   плиток: ${t.ready}/${t.tiles}   холстов: ${t.canvases}`,
      `история: ${formatFileBytes(this.app.history.bytes)} / ${formatFileBytes(this.app.history.maxBytes)}`,
      `масштаб: ${Math.round(view.scale * 100)} %   поворот: ${view.angle}°   dpr: ${view.dpr}`,
      platform.native ? 'оболочка: Electron' : 'оболочка: браузер',
      ...(this.tabletText ? [this.tabletText] : []),
      ...(saved?['',`${saved.action==='export'?'Экспорт':'Сохранение'}: ${saved.name}`,`Записано: ${formatFileBytes(saved.bytes)}`]:[]),
      ...(processing?[
        `До SVGO: ${formatFileBytes(processing.before)}`,
        processing.after===null?`SVGO: не удалось обработать — ${processing.error??'ошибка'}`:`После SVGO: ${formatFileBytes(processing.after)}`,
        processing.used?`Сохранён результат SVGO (−${((1-saved!.bytes/processing.before)*100).toFixed(1).replace('.',',')} %).`:'Сохранён вариант до SVGO.',
      ]:[]),
    ].join('\n');
    if (platform.native && !this.tabletPending) {
      this.tabletPending = true;
      void platform.tabletStats().then(s => {
        if (!s || this.debugEl.hidden) return;
        const rate = s.seconds > 0 ? Math.round(s.tablet / s.seconds) : 0;
        this.tabletText = `macOS: ${rate || '—'} точек/с; нажим ${s.pressureMin.toFixed(2)}–${s.pressureMax.toFixed(2)}`;
      }).catch(() => undefined).finally(() => { this.tabletPending = false; });
    }
  }
}
