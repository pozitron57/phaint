// Ввод с пера, мыши и трекпада.
//   pointer events → активный инструмент (со всеми промежуточными отсчётами между кадрами);
//   wheel → прокрутка холста, с Ctrl или щипком — масштаб.
import type { App } from '../app.ts';
import type { PenSample } from '../tools/tool.ts';
import { heldCombo, modifierName } from '../core/actions.ts';

/** Чувствительность масштаба: щипок на трекпаде и прокрутка с зажатым Ctrl. */
const ZOOM_PINCH = 0.01;
const ZOOM_WHEEL = 0.003;

export class PointerInput {
  /** Для отладочной панели. */
  lastType = '—';
  lastPressure = 0;
  /** Отсчётов пера в секунду во время штриха. */
  rate = 0;
  /** Среднее число отсчётов в одном событии и число предсказанных точек. */
  perEvent = 0;
  predictedCount = 0;
  /** Идёт ли штрих. */
  drawing = false;
  /** На время открытия файла и диалогов, которые заменяют документ. */
  blocked = false;
  panning = false;
  panReady = false;

  private app: App;
  private el: HTMLElement;
  private active = -1;
  private contactMask=1;
  /** Ctrl зажат физически. Щипок на трекпаде приходит как wheel с ctrlKey, но без клавиши. */
  private ctrlDown = false;
  private pressed=new Set<string>();
  shift=false; alt=false; meta=false;
  get ctrl():boolean{return this.ctrlDown;}
  private rateSamples = 0;
  private rateEvents = 0;
  private rateStart = 0;
  position: {x:number;y:number} | null = null;
  private panX = 0;
  private panY = 0;

  constructor(app: App, el: HTMLElement) {
    this.app = app;
    this.el = el;
    el.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    // Завершающее событие может прийти уже за пределами холста после потери захвата.
    window.addEventListener('pointerup', this.up, true);
    window.addEventListener('pointercancel', this.up, true);
    el.addEventListener('lostpointercapture', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', this.contextMenu);
    window.addEventListener('keydown', (e) => {
      this.pressed.add(e.code);
      if(e.code.startsWith('Control'))this.ctrlDown=true;if(e.code.startsWith('Shift'))this.shift=true;
      if(e.code.startsWith('Alt'))this.alt=true;if(e.code.startsWith('Meta'))this.meta=true;
      const t=e.target;
      const editing=this.app.shortcuts?.open||(t instanceof Element&&!!t.closest('input, textarea, select, [contenteditable], dialog'));
      if(!this.blocked&&!editing&&this.held('gesture.pan')){
        e.preventDefault();
        if(!this.panReady){this.finishCurrent();this.panX=this.position?.x??0;this.panY=this.position?.y??0;}
        this.panReady=this.panning=true;
      }
      if(modifierName(e.code)){this.app.tool.modifiersChanged?.();this.app.updateCursor();}
      if(this.panReady)this.app.updateCursor();
    });
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.code);
      if(e.code.startsWith('Control'))this.ctrlDown=false;if(e.code.startsWith('Shift'))this.shift=false;
      if(e.code.startsWith('Alt'))this.alt=false;if(e.code.startsWith('Meta'))this.meta=false;
      // macOS иногда не присылает keyup буквы, отпущенной при зажатом Cmd.
      if(e.code.startsWith('Meta'))this.pressed.clear();
      if(this.panReady&&!this.held('gesture.pan')){this.finishCurrent();this.panReady=this.panning=false;this.app.updateCursor();}
      if(modifierName(e.code)){this.app.tool.modifiersChanged?.();this.app.updateCursor();}
    });
    window.addEventListener('blur', () => {this.finish(true);this.clearModifiers();});
  }

  held(id:string,s?:Pick<PenSample,'ctrl'|'shift'|'alt'|'meta'>):boolean {
    const state={ctrlKey:!!s?.ctrl||this.ctrl,shiftKey:!!s?.shift||this.shift,altKey:!!s?.alt||this.alt,metaKey:!!s?.meta||this.meta};
    return this.app.actions.keysOf(id).some(combo=>heldCombo(combo,state,this.pressed));
  }
  clearModifiers():void {
    this.pressed.clear();this.ctrlDown=this.shift=this.alt=this.meta=false;
    this.panReady=this.panning=false;this.app.tool.modifiersChanged?.();this.app.updateCursor();
  }

  private sample(e: PointerEvent, left: number, top: number): PenSample {
    return {
      x: e.clientX - left,
      y: e.clientY - top,
      pressure: e.pointerType === 'pen' ? e.pressure : 0.5,
      t: e.timeStamp, ctrl:e.ctrlKey||this.ctrl, shift:e.shiftKey||this.shift, alt:e.altKey||this.alt, meta:e.metaKey||this.meta,
    };
  }

  private down = (e: PointerEvent): void => {
    // macOS может превратить Control-click в правую кнопку: точки Безье и модификаторы
    // должны работать и в этом случае. Обычная правая кнопка по-прежнему не рисует.
    const controlSelect=this.held('gesture.select',{ctrl:e.ctrlKey,alt:e.altKey,shift:e.shiftKey,meta:e.metaKey});
    if (this.blocked || (e.button!==0&&!(e.button===2&&(controlSelect||e.ctrlKey||this.ctrlDown))) || e.pointerType === 'touch') return;
    if (this.active !== -1) {
      if (e.pointerId !== this.active) return;
      // Новый контакт того же пера: предыдущий отрыв мог не дойти от драйвера.
      this.finish(true);
    }
    e.preventDefault();
    // Переход в M запоминает инструмент для возврата повторным M.
    // Отпускание модификатора не меняет инструмент и не прерывает перетаскивание.
    const startingSelection=!this.panReady&&controlSelect&&this.app.tool.id!=='select'&&this.app.tool.id!=='space';
    if(startingSelection)this.app.selectTool('select',false);
    this.contactMask=e.button===2?2:1;
    this.position={x:e.clientX,y:e.clientY};
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Синтетические события в тестах не имеют настоящего указателя.
    }
    this.active = e.pointerId;
    if (this.panReady) {
      this.panning = true;
      this.panX = e.clientX; this.panY = e.clientY;
      this.app.updateCursor();
      return;
    }
    this.drawing = true;
    this.lastType = e.pointerType;
    this.lastPressure = e.pressure;
    this.rateSamples = 0;
    this.rateEvents = 0;
    this.rateStart = e.timeStamp;
    const r = this.el.getBoundingClientRect();
    const sample=this.sample(e,r.left,r.top);
    if(startingSelection)this.app.selection!.begin(sample,false);else this.app.tool.begin(sample);
    this.app.onDrawing(true);
  };

  private contextMenu = (e: PointerEvent): void => {
    e.preventDefault();
    // Вторичный тап может прислать только contextmenu. Обрабатываем его ровно один раз;
    // Control-click macOS остаётся жестом постановки/движения точки Безье.
    if(this.blocked||this.active!==-1||this.panReady||e.ctrlKey||this.ctrlDown)return;
    const r=this.el.getBoundingClientRect(),s=this.sample(e,r.left,r.top);
    if(this.held('gesture.bezier',s)||this.held('gesture.select',s))return;
    this.app.tool.secondary?.(s);
  };

  private move = (e: PointerEvent): void => {
    if(!this.panReady && this.active===-1 && e.target!==this.el)return;
    const known=this.position!==null;
    this.position={x:e.clientX,y:e.clientY};
    if(this.panReady && !this.blocked) {
      if(known) this.pan(e); else {this.panX=e.clientX;this.panY=e.clientY;}
      return;
    }
    if (e.pointerId !== this.active) {
      this.lastType = e.pointerType;
      return;
    }
    if (!(e.buttons & this.contactMask)) {
      // Перо уже над планшетом: завершаем по последней контактной точке, без линии к курсору.
      this.finish(true);
      return;
    }
    if (this.panning) {
      this.pan(e);
      return;
    }
    const r = this.el.getBoundingClientRect();
    let list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (list.length === 0) list = [e];
    const samples: PenSample[] = [];
    for (const c of list) samples.push(this.sample(c, r.left, r.top));
    const predicted: PenSample[] = [];
    if (this.app.settings.input.predict && this.app.tool.id==='pen' && e.getPredictedEvents) for (const p of e.getPredictedEvents()) predicted.push(this.sample(p, r.left, r.top));
    this.app.tool.move(samples, predicted);

    if (e.pressure > 0) this.lastPressure = e.pressure;
    this.predictedCount = predicted.length;
    this.rateSamples += samples.length;
    this.rateEvents++;
    const dt = e.timeStamp - this.rateStart;
    if (dt >= 400) {
      this.rate = Math.round((this.rateSamples * 1000) / dt);
      this.perEvent = Math.round((this.rateSamples / this.rateEvents) * 10) / 10;
      this.rateSamples = 0;
      this.rateEvents = 0;
      this.rateStart = e.timeStamp;
    }
  };

  private up = (e: PointerEvent): void => {
    if (e.pointerId !== this.active) return;
    if (e.type === 'lostpointercapture' && this.el.hasPointerCapture(e.pointerId)) return;
    if (e.type === 'pointerup') {
      this.position={x:e.clientX,y:e.clientY};
      if (this.panning) this.pan(e);
      else {
        const r = this.el.getBoundingClientRect();
        const sample = this.sample(e, r.left, r.top);
        // У pointerup pressure уже равен нулю. Положение учитываем, толщину сохраняем.
        sample.pressure = e.pointerType === 'pen' ? this.lastPressure : 0.5;
        this.app.tool.move([sample], []);
      }
    }
    // Потеря захвата/контакта — завершение, а не команда удалить уже написанное.
    // Координаты служебных событий (часто 0,0) выше намеренно не принимаются.
    this.finish(true);
  };

  private pan(e: PointerEvent): void {
    this.app.view.panBy(e.clientX - this.panX, e.clientY - this.panY);
    this.panX = e.clientX; this.panY = e.clientY;
  }

  /** Зафиксировать текущий штрих перед сохранением или заменой документа. */
  finishCurrent(): void { this.finish(true); this.app.tool.finishPending?.(); }

  /** Только явная отмена пользователем отбрасывает незавершённое действие. */
  cancelCurrent(): void { this.finish(false); this.app.tool.cancel(); }

  /** Закончить текущий штрих: commit — сохранить его, иначе отбросить. */
  private finish(commit: boolean): void {
    if (this.active === -1) return;
    const id = this.active;
    this.active = -1;
    this.drawing = false;
    if (!this.panning) {
      if (commit) this.app.tool.end();
      else this.app.tool.cancel();
    }
    this.panning = this.panReady;
    try {
      this.el.releasePointerCapture(id);
    } catch {
      // Захват уже снят.
    }
    this.app.onDrawing(false);
  }

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.blocked || (this.active !== -1&&!this.app.tool.scrollDuringDrag)) return;
    const { view, renderer } = this.app;
    const unit = e.deltaMode === 1 ? 16 : 1;
    const pinch=e.ctrlKey&&!this.ctrlDown;
    const zoom=this.held('gesture.zoom',{ctrl:e.ctrlKey&&this.ctrlDown,alt:e.altKey,shift:e.shiftKey,meta:e.metaKey});
    if (pinch||zoom) {
      // Во время раздвижения разрешена только прокрутка, без изменения масштаба/оси жеста.
      if(this.active!==-1)return;
      const r = this.el.getBoundingClientRect();
      const k = pinch ? ZOOM_PINCH : ZOOM_WHEEL;
      const d = Math.max(-60, Math.min(60, e.deltaY * unit));
      renderer.gesture();
      view.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-d * k));
      this.app.onViewChanged();
    } else {
      view.panBy(-e.deltaX * unit, -e.deltaY * unit);
    }
  };
}
