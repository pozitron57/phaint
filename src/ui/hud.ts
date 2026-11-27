// Всплывающая подсказка внизу экрана («Толщина 2.6», «125 %») и отладочная панель с числами о пере и отрисовке.
import { currentLanguage, t } from '../core/language.ts';
import type { App } from '../app.ts';
import type { InkSettings } from '../core/settings.ts';
import { h } from './dom.ts';
import { formatFileBytes } from '../files/file-stats.ts';

/** build.mjs подставляет версию из package.json, без запроса к Electron. */
declare const __PHAINT_VERSION__:string;

const TOAST_MS = 900;
const DEBUG_MS = 250;
type LinePattern = 'solid'|'dash'|'dots';
const PATTERN_LABELS={solid:'action.style.solid',dash:'action.style.dashed',dots:'panel.dottedLine'} as const;

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
        h('button', { class: 'btn', onclick: () => app.actions.run('debug.generate') }, t('debug.generate')),
        h('button', { class: 'btn', onclick: () => app.actions.run('debug.clear') }, t('debug.clear')),
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
    this.toastEl.setAttribute('aria-label',t(PATTERN_LABELS[mode]));
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
    this.toastEl.setAttribute('aria-label',t('hud.toolInk',{tool:this.toolText,color:ink.color,pattern:t(PATTERN_LABELS[mode])}));
  }

  refreshLanguage():void {
    const [generate,clear]=this.debugEl.querySelectorAll('button');
    generate.textContent=t('debug.generate');
    clear.textContent=t('debug.clear');
  }

  setDebug(on: boolean): void {
    this.refreshLanguage();
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
    const tiles = renderer.tiles.stats();
    const saved=this.app.files?.lastWrite,processing=saved?.processing;
    this.debugText.textContent = [
      t('debug.version',{version:__PHAINT_VERSION__}),
      t('debug.device', {device:input.lastType, pressure:input.lastPressure.toFixed(2)}),
      t('debug.points', {rate:input.rate || '—', perEvent:input.perEvent || '—', predicted:input.predictedCount}),
      t('debug.frame', {milliseconds:renderer.frameMs.toFixed(1), fps:this.fps || '—'}),
      t('debug.objects', {objects:doc.size, ready:tiles.ready, tiles:tiles.tiles, canvases:tiles.canvases}),
      t('debug.history',{used:formatFileBytes(this.app.history.bytes),limit:formatFileBytes(this.app.history.maxBytes)}),
      t('debug.view', {zoom:Math.round(view.scale * 100), angle:view.angle, dpr:view.dpr}),
      platform.native ? t('debug.platformElectron') : t('debug.platformBrowser'),
      ...(this.tabletText ? [this.tabletText] : []),
      ...(saved?['',`${saved.action==='export'?t('export.export'):t('debug.save')}: ${saved.name}`,t('debug.written',{size:formatFileBytes(saved.bytes)})]:[]),
      ...(processing?[
        t('debug.beforeSvgo',{size:formatFileBytes(processing.before)}),
        processing.after===null?`SVGO: ${t('debug.processingFailed')} — ${processing.error??t('debug.error')}`:t('debug.afterSvgo',{size:formatFileBytes(processing.after)}),
        processing.used?t('debug.savedSvgoOutput',{percent:((1-saved!.bytes/processing.before)*100).toLocaleString(currentLanguage(),{minimumFractionDigits:1,maximumFractionDigits:1})}):t('debug.savedTheOriginalVersion'),
      ]:[]),
    ].join('\n');
    if (platform.native && !this.tabletPending) {
      this.tabletPending = true;
      void platform.tabletStats().then(s => {
        if (!s || this.debugEl.hidden) return;
        const rate = s.seconds > 0 ? Math.round(s.tablet / s.seconds) : 0;
        this.tabletText = t('debug.tablet',{rate:rate||'—',min:s.pressureMin.toFixed(2),max:s.pressureMax.toFixed(2)});
      }).catch(() => undefined).finally(() => { this.tabletPending = false; });
    }
  }
}
