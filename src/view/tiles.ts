// Кэш плиток: готовые объекты растеризуются в плитки 512×512 px устройства.
//
// Пространство плиток — мир, умноженный на D (масштаб, поворот, dpr), без сдвига вида.
// Сдвиг вида целый, поэтому при прокрутке плитки просто копируются на экран.
// При смене масштаба или поворота заводится новый уровень (Level); прежний остаётся
// запасным и показывается растянутым, пока новый рисуется порциями по бюджету времени.
//
// Плитка рисуется в back и по готовности становится front. Пока плитка перерисовывается,
// на экране остаётся прежний front — без мигания.
// У редактируемой фигуры отдельно кэшируются нижние и верхние слои.
// Движение не перерисовывает соседей и не обнуляет очередь подготовки кэша.
import type { GridSettings } from '../core/settings.ts';
import { drawBackground } from './grid.ts';
import type { Doc, DocChange } from '../core/doc.ts';
import { bboxUnion, type BBox, type Mat, matBBox, matInvert, matMul } from '../core/geom.ts';
import type { Obj } from '../core/types.ts';
import { drawObj } from './draw.ts';
import { TileOverlay } from './tile-overlay.ts';
import type { Viewport } from './viewport.ts';

export const TILE = 512;
/** Сколько плиток вокруг экрана готовить заранее и сколько держать в памяти. */
const MARGIN = 1;
const KEEP = 2;
const POOL_MAX = 24;
/** Во сколько раз можно растянуть или сжать уровень во время жеста, прежде чем заводить новый. */
const STRETCH = 1.5;
const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

interface Tile {
  i: number;
  j: number;
  /** Что показываем; может быть устаревшим, пока плитка перерисовывается. */
  front: HTMLCanvasElement | null;
  /** Куда рисуем заново. */
  back: HTMLCanvasElement | null;
  /** front соответствует документу. */
  ready: boolean;
  /** В плитке нет объектов — холст не нужен. */
  empty: boolean;
  /** Очередь на отрисовку по возрастанию z; null — ещё не запрашивали документ. */
  queue: Obj[] | null;
  next: number;
  background: boolean;
  /** Локальный прямоугольник пикселей: исправить только его поверх готовой плитки. */
  region:BBox|null;
  /** Нижние слои; baseReady означает, что готовы также верхние слои. */
  base:HTMLCanvasElement|null;
  baseReady:boolean;
  overlay:TileOverlay|null;
  editing:boolean;
  /** Быстрая композиция требует точного кадра после окончания жеста. */
  approximate:boolean;
  canonical:boolean;
}

interface Level {
  scale: number;
  rotSteps: number;
  dpr: number;
  D: Mat;
  Dinv: Mat;
  tiles: Map<string, Tile>;
  /** Все видимые плитки готовы. */
  complete: boolean;
}

function key(i: number, j: number): string {
  return i + ',' + j;
}

/**
 * Плитки рисуются на процессоре (willReadFrequently выключает ускорение видеокартой).
 * Браузер откладывает настоящую отрисовку: fill() только записывает команду. На видеокарте
 * очередь копится незаметно и потом разом подвешивает экран на сотни миллисекунд. На процессоре
 * очередь можно выполнить сразу (см. flush), и бюджет времени кадра соблюдается честно.
 */
function context(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
}

/** Выполнить отложенные команды рисования прямо сейчас: чтение пикселя заставляет холст дорисоваться. */
function flush(ctx: CanvasRenderingContext2D): void {
  ctx.getImageData(0, 0, 1, 1);
}

/** Через сколько объектов дорисовывать плитку и сверяться с бюджетом времени. */
const BATCH = 16;

export class TileCache {
  /** Остались недорисованные плитки — нужны ещё кадры. */
  pending = false;
  /** Качество сглаживания при показе растянутых плиток (во время жеста масштабирования). */
  quality: ImageSmoothingQuality = 'medium';

  private doc: Doc;
  private grid: GridSettings;
  private gridKey = '';
  private cur: Level | null = null;
  private old: Level | null = null;
  private pool: HTMLCanvasElement[] = [];
  private patch:HTMLCanvasElement|null=null;
  private edited:Obj|null=null;
  private focused=false;

  constructor(doc: Doc, grid: GridSettings) {
    this.doc = doc; this.grid=grid;
  }

  /**
   * Насколько текущий уровень подходит виду:
   *   0 — точно: плитки копируются на экран 1:1;
   *   1 — годится на время жеста: поворот тот же, масштаб отличается не больше чем в STRETCH раз,
   *       плитки показываются растянутыми и продолжают дорисовываться;
   *   2 — не годится, нужен новый уровень.
   */
  fit(v: Viewport): 0 | 1 | 2 {
    const c = this.cur;
    if (!c || c.rotSteps !== v.rotSteps || c.dpr !== v.dpr) return 2;
    if (c.scale === v.scale) return 0;
    const ratio = v.scale / c.scale;
    return ratio <= STRETCH && ratio >= 1 / STRETCH ? 1 : 2;
  }

  /** Завести уровень под текущий вид. Прежний остаётся запасным, пока новый не готов. */
  switchLevel(v: Viewport): void {
    if (this.fit(v) === 0) return;
    const prev = this.cur;
    if (prev) {
      if (prev.complete || !this.old) {
        this.dropLevel(this.old);
        this.old = prev;
      } else {
        this.dropLevel(prev);
      }
    }
    const D = v.linear();
    this.cur = { scale: v.scale, rotSteps: v.rotSteps, dpr: v.dpr, D, Dinv: matInvert(D), tiles: new Map(), complete: false };
    this.pending = true;
  }

  /** Нарисовать плитки на холсте сцены (фон уже нарисован). */
  compose(ctx: CanvasRenderingContext2D, v: Viewport): void {
    const cur = this.cur;
    if (!cur) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = this.quality;
    const old = this.old;
    const exact = this.fit(v) === 0;
    const [i0, i1, j0, j1] = this.range(cur, v, exact);
    // Пространство плиток уровня → устройство. При точном совпадении это чистый целый сдвиг.
    const M = exact ? IDENTITY : matMul(v.linear(), cur.Dinv);
    const tx = v.tx;
    const ty = v.ty;

    if (old) {
      // Под ещё не готовыми плитками показываем запасной уровень.
      ctx.save();
      ctx.setTransform(M.a, M.b, M.c, M.d, tx, ty);
      ctx.beginPath();
      let holes = false;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const t = cur.tiles.get(key(i, j));
          if (t && (t.front || (t.ready && t.empty))) continue;
          ctx.rect(i * TILE, j * TILE, TILE, TILE);
          holes = true;
        }
      }
      if (holes) {
        ctx.clip();
        this.drawStretched(ctx, old, v);
      }
      ctx.restore();
    }

    ctx.setTransform(M.a, M.b, M.c, M.d, tx, ty);
    // При растяжении — небольшое перекрытие, чтобы между плитками не было щелей.
    const size = exact ? TILE : TILE + 0.75 / Math.sqrt(Math.abs(M.a * M.d - M.b * M.c));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const t = cur.tiles.get(key(i, j));
        if (!t) continue;
        // Без запасного уровня показываем и недорисованную плитку: видно, как она наполняется.
        const c = t.front ?? (old ? null : t.back);
        if (c) ctx.drawImage(c, i * TILE, j * TILE, size, size);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Рисовать недостающие плитки не дольше budget мс.
   * prefetch — готовить и плитки вокруг экрана. Возвращает true, если изменилось видимое.
   */
  work(v: Viewport, budget: number, prefetch: boolean): boolean {
    const cur = this.cur;
    const fit = this.fit(v);
    if (!cur || fit === 2) {
      this.pending = false;
      return false;
    }
    const [i0, i1, j0, j1] = this.range(cur, v, fit === 0);
    const m = prefetch ? MARGIN : 0;
    const cx = (i0 + i1) / 2;
    const cy = (j0 + j1) / 2;
    const visible = (t: Tile): boolean => t.i >= i0 && t.i <= i1 && t.j >= j0 && t.j <= j1;
    const rank = (t: Tile): number => (visible(t) ? 0 : 1e9) + (t.region?-1e6:0) + (t.i - cx) ** 2 + (t.j - cy) ** 2;

    const todo: Tile[] = [];
    for (let j = j0 - m; j <= j1 + m; j++) {
      for (let i = i0 - m; i <= i1 + m; i++) {
        const k = key(i, j);
        let t = cur.tiles.get(k);
        if (!t) {
          t = { i, j, front: null, back: null, ready: false, empty: false, queue: null, next: 0, background:false,region:null,base:null,baseReady:false,overlay:null,editing:false,approximate:false,canonical:false };
          cur.tiles.set(k, t);
        }
        if(this.edited&&!t.editing&&(this.focused||this.inTile(cur,t,this.edited.bbox)))this.prepareTile(t);
        if(prefetch&&t.approximate){t.canonical=true;t.ready=false;}
        if(!t.ready||(t.editing&&!t.baseReady))todo.push(t);
      }
    }
    todo.sort((a, b) => rank(a) - rank(b));

    const deadline = performance.now() + budget;
    let changed = false;
    for (const t of todo) {
      const progress = this.renderTile(cur, t, deadline);
      if (visible(t) && progress) changed = true;
      if (performance.now() >= deadline) break;
    }

    let complete = true;
    for (let j = j0; j <= j1 && complete; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!cur.tiles.get(key(i, j))?.ready) {
          complete = false;
          break;
        }
      }
    }
    cur.complete = complete;
    this.pending = todo.some(t=>!t.ready||(t.editing&&!t.baseReady)||(prefetch&&t.approximate));
    if (complete && this.old) {
      this.dropLevel(this.old);
      this.old = null;
    }

    // Плитки далеко за экраном не держим.
    const cols = i1 - i0 + 1 + 2 * KEEP;
    const rows = j1 - j0 + 1 + 2 * KEEP;
    if (cur.tiles.size > cols * rows) {
      for (const [k, t] of cur.tiles) {
        if (t.i < i0 - KEEP || t.i > i1 + KEEP || t.j < j0 - KEEP || t.j > j1 + KEEP) {
          this.releaseTile(t);
          cur.tiles.delete(k);
        }
      }
    }
    return changed;
  }

  /** Документ изменился. */
  onChange(c: DocChange): void {
    if (c.reset) {
      this.edited=null;this.focused=false;
      this.dropLevel(this.cur);
      this.dropLevel(this.old);
      this.cur = this.old = null;
      // При открытии другого файла не держим память от предыдущего документа.
      for (const canvas of this.pool) canvas.width = canvas.height = 0;
      this.pool.length = 0;
      if(this.patch){this.patch.width=this.patch.height=0;this.patch=null;}
      this.pending = true;
      return;
    }
    const added=c.added.length===1?c.added[0]:null,removed=c.removed.length===1?c.removed[0]:null;
    const shape=added?.kind==='stroke'&&!added.marker&&!!added.shape;
    const replacement=shape&&removed?.id===added.id&&removed.z===added.z;
    if(replacement&&added.id===this.edited?.id&&added.z===this.edited.z){
      this.edited=added;
      for(const level of [this.cur,this.old])if(level)this.replaceEdited(level,removed,added);
      this.pending=true;return;
    }
    // Любое изменение соседей сбрасывает обе части кэша. Выбранная фигура остаётся
    // целью подготовки, в том числе после обновления миниатюры страницы PDF.
    const selected=this.focused&&this.edited?this.doc.get(this.edited.id):null;
    if(selected){this.setEdited(selected,true);}
    else{this.focused=false;this.setEdited(shape&&(c.top||replacement)?added:null,true);}
    if(replacement&&this.edited?.id===added.id){
      for(const level of [this.cur,this.old])if(level)this.replaceEdited(level,removed,added);
      this.pending=true;return;
    }
    for (const level of [this.cur, this.old]) {
      if (!level) continue;
      if (c.top) {
        for (const o of c.added) this.drawOnTop(level, o);
      } else {
        const isCur = level === this.cur;
        if(c.damage)this.invalidateRegion(level,c.damage,isCur);
        else{
          for (const o of c.removed) this.invalidate(level, o.bbox, isCur);
          for (const o of c.added) this.invalidate(level, o.bbox, isCur);
        }
      }
    }
    this.pending = true;
  }

  /** Фон нужен внутри плиток с multiply-маркером; обновляем их при смене сетки. */
  checkGrid():void {
    const key=`${this.grid.enabled}:${this.grid.step}`;if(key===this.gridKey)return;this.gridKey=key;
    for(const level of [this.cur,this.old])if(level)for(const t of level.tiles.values())if(t.background){this.dropBase(t);t.ready=false;t.queue=null;t.next=0;t.region=null;}
  }

  /** Числа для отладочной панели. */
  stats(): { tiles: number; ready: number; canvases: number } {
    let ready = 0;
    let canvases = this.pool.length;
    const count = (level: Level | null): void => {
      if (!level) return;
      for (const t of level.tiles.values()) {
        if (t.ready && level === this.cur) ready++;
        if (t.front) canvases++;
        if (t.back) canvases++;
        if (t.base) canvases++;
        canvases+=t.overlay?.canvases??0;
      }
    };
    count(this.cur);
    count(this.old);
    return { tiles: this.cur?.tiles.size ?? 0, ready, canvases };
  }

  /** Плитки уровня, покрывающие видимую область: [i0, i1, j0, j1]. */
  private range(level: Level, v: Viewport, exact: boolean): [number, number, number, number] {
    if (exact) {
      const tx = v.tx;
      const ty = v.ty;
      return [Math.floor(-tx / TILE), Math.floor((v.width - 1 - tx) / TILE), Math.floor(-ty / TILE), Math.floor((v.height - 1 - ty) / TILE)];
    }
    const b = matBBox(level.D, v.worldBounds());
    return [Math.floor(b.minX / TILE), Math.floor(b.maxX / TILE), Math.floor(b.minY / TILE), Math.floor(b.maxY / TILE)];
  }

  /** Возвращает true, если в плитке что-то нарисовали или она стала готовой. */
  private renderTile(level: Level, t: Tile, deadline: number): boolean {
    if(t.editing&&(!t.baseReady||!t.canonical))return this.renderEdited(level,t,deadline);
    if(t.region&&t.front)return this.renderRegion(level,t,deadline);
    if (!t.queue) {
      const pad = 2;
      const objs = this.doc.query(
        matBBox(level.Dinv, { minX: t.i * TILE - pad, minY: t.j * TILE - pad, maxX: (t.i + 1) * TILE + pad, maxY: (t.j + 1) * TILE + pad }),
      );
      if (objs.length === 0) {
        this.releaseTile(t);
        t.ready = true;
        t.empty = true;
        return true;
      }
      objs.sort((a, b) => a.z - b.z);
      t.queue = objs;
      t.next = 0;
      t.empty = false;
      if (t.back) this.clear(t.back);
      else t.back = this.acquire();
      t.background=objs.some(o=>o.kind==='stroke'&&o.marker);
      if(t.background){
        const m={...level.D,e:-t.i*TILE,f:-t.j*TILE};
        drawBackground(context(t.back),{width:TILE,height:TILE,scale:level.scale,dpr:level.dpr,rotSteps:level.rotSteps,
          matrix:()=>m,worldBounds:()=>matBBox(matInvert(m),{minX:0,minY:0,maxX:TILE,maxY:TILE})},this.grid);
      }
    }
    const back = t.back as HTMLCanvasElement;
    const ctx = context(back);
    const ex = -t.i * TILE;
    const ey = -t.j * TILE;
    const q = t.queue;
    while (t.next < q.length) {
      drawObj(ctx, q[t.next++], level.D, ex, ey);
      if (t.next % BATCH === 0) {
        flush(ctx);
        if (performance.now() >= deadline) break;
      }
    }
    if (t.next >= q.length) {
      flush(ctx);
      this.release(t.front);
      t.front = back;
      t.back = null;
      t.queue = null;
      t.ready = true;t.canonical=false;t.approximate=false;
    }
    return true;
  }

  /** Новый объект поверх всех: дорисовать на готовых плитках, не перерисовывая их. */
  private drawOnTop(level: Level, o: Obj): void {
    this.forTiles(level, o.bbox, (t) => {
      if(o.kind==='stroke'&&o.marker&&!t.background){t.ready=false;t.queue=null;t.next=0;t.region=null;return;}
      if(o.id===this.edited?.id&&t.ready)this.saveBase(t,t.front);
      if (t.ready && t.empty) {
        t.front = this.acquire();
        t.empty = false;
      }
      if (t.front) drawObj(context(t.front), o, level.D, -t.i * TILE, -t.j * TILE);
      if (t.queue) t.queue.push(o);
    });
  }

  /** Выбор в M заранее готовит видимые плитки, включая возможное новое положение кривой. */
  prepareEdit(o:Obj|null):boolean {
    if(this.edited?.id===o?.id&&this.edited?.z===o?.z&&this.focused===!!o)return false;
    this.focused=!!o;this.setEdited(o);this.pending=true;return true;
  }

  private inTile(level:Level,t:Tile,box:BBox):boolean {
    const b=matBBox(level.D,box);
    return b.minX<=(t.i+1)*TILE+1&&b.maxX>=t.i*TILE-1&&b.minY<=(t.j+1)*TILE+1&&b.maxY>=t.j*TILE-1;
  }

  /** Соседи неизменны: незавершённая очередь продолжает готовиться при движении фигуры. */
  private replaceEdited(level:Level,old:Obj,next:Obj):void {
    const before=new Set<Tile>(),after=new Set<Tile>();
    this.forTiles(level,old.bbox,t=>before.add(t));this.forTiles(level,next.bbox,t=>after.add(t));
    for(const t of new Set([...before,...after])){
      if(!t.editing){
        if(next.z===this.doc.topZ()-1&&t.ready&&!before.has(t))this.saveBase(t,t.front);
        else this.prepareTile(t);
      }
      t.canonical=false;
      if(t.baseReady){
        this.release(t.back);t.back=null;t.queue=null;t.next=0;t.region=null;
        this.paintEdited(level,t);
      }else t.ready=false;
    }
  }

  private setEdited(o:Obj|null,force=false):void {
    if(!force&&this.edited?.id===o?.id&&this.edited?.z===o?.z){this.edited=o;return;}
    this.edited=o;
    for(const level of [this.cur,this.old])if(level)for(const t of level.tiles.values())this.dropBase(t);
  }

  private prepareTile(t:Tile):void {
    if(t.editing)return;
    t.editing=true;t.baseReady=false;t.queue=null;t.next=0;t.region=null;
    this.release(t.back);t.back=null;
  }

  private saveBase(t:Tile,source:HTMLCanvasElement|null):void {
    this.dropBase(t);t.editing=true;t.baseReady=true;
    if(source){t.base=this.acquire();context(t.base).drawImage(source,0,0);}
  }

  /** Кэш ниже фигуры и ограниченный двумя холстами кэш всего переднего плана. */
  private renderEdited(level:Level,t:Tile,deadline:number):boolean {
    const edited=this.edited!;
    if(!t.baseReady){
      if(!t.queue){
        const pad=2,objects=this.doc.query(matBBox(level.Dinv,{minX:t.i*TILE-pad,minY:t.j*TILE-pad,maxX:(t.i+1)*TILE+pad,maxY:(t.j+1)*TILE+pad}));
        t.queue=objects.filter(o=>o.id!==edited.id).sort((a,b)=>a.z-b.z);t.next=0;
        t.background=objects.some(o=>o.kind==='stroke'&&o.marker);
        const above=t.queue.filter(o=>o.z>=edited.z);
        if(above.length)t.overlay=new TileOverlay(()=>this.acquire(),c=>this.release(c),above.some(o=>o.kind==='stroke'&&o.marker));
        if(t.background||t.queue.some(o=>o.z<edited.z)){
          t.back=this.acquire();
          if(t.background){
            const m={...level.D,e:-t.i*TILE,f:-t.j*TILE};
            drawBackground(context(t.back),{width:TILE,height:TILE,scale:level.scale,dpr:level.dpr,rotSteps:level.rotSteps,
              matrix:()=>m,worldBounds:()=>matBBox(matInvert(m),{minX:0,minY:0,maxX:TILE,maxY:TILE})},this.grid);
          }
        }
      }
      while(t.next<t.queue.length){
        const o=t.queue[t.next++];
        if(o.z<edited.z)drawObj(context(t.back!),o,level.D,-t.i*TILE,-t.j*TILE);
        else t.overlay!.draw(o,level.D,-t.i*TILE,-t.j*TILE);
        if(t.next%BATCH===0){
          if(t.back)flush(context(t.back));t.overlay?.flush();
          if(performance.now()>=deadline)return false;
        }
      }
      if(t.back)flush(context(t.back));t.overlay?.flush();t.overlay?.finish();
      t.base=t.back;t.back=null;t.baseReady=true;t.queue=null;t.next=0;
    }
    // Подготовка при выборе не меняет уже точную картинку. После движения показываем
    // последнее положение, а не то, на котором началась подготовка соседних слоёв.
    if(t.ready)return false;
    this.paintEdited(level,t);return true;
  }

  private paintEdited(level:Level,t:Tile):void {
    const o=this.edited!,inside=this.inTile(level,t,o.bbox);
    t.empty=!t.base&&!t.overlay&&!inside;t.ready=true;t.approximate=!!t.overlay;
    if(t.empty){this.release(t.front);t.front=null;return;}
    if(t.front)this.clear(t.front);else t.front=this.acquire();
    const ctx=context(t.front);
    if(t.base)ctx.drawImage(t.base,0,0);
    if(inside)drawObj(ctx,o,level.D,-t.i*TILE,-t.j*TILE);
    t.overlay?.paint(ctx);
  }

  private dropBase(t:Tile):void {
    this.release(t.base);t.base=null;t.baseReady=false;t.overlay?.dispose();t.overlay=null;
    if(t.editing){t.queue=null;t.next=0;this.release(t.back);t.back=null;}
    if(t.approximate){t.canonical=true;t.ready=false;}
    t.editing=false;
  }

  private invalidate(level: Level, bbox: BBox, isCur: boolean): void {
    this.forTiles(level, bbox, (t, k) => {
      this.dropBase(t);
      if (isCur) {
        t.ready = false;
        t.empty = false;
        t.queue = null;
        t.next = 0;
        t.region=null;
      } else {
        this.releaseTile(t);
        level.tiles.delete(k);
      }
    });
  }

  private invalidateRegion(level:Level,box:BBox,isCur:boolean):void {
    const b=matBBox(level.D,box);
    this.forTiles(level,box,(t,k)=>{
      if(!isCur){this.releaseTile(t);level.tiles.delete(k);return;}
      if(!t.front||(!t.ready&&!t.region)){t.ready=false;t.queue=null;t.next=0;return;}
      const region={minX:Math.max(0,Math.floor(b.minX-t.i*TILE)-2),minY:Math.max(0,Math.floor(b.minY-t.j*TILE)-2),
        maxX:Math.min(TILE,Math.ceil(b.maxX-t.i*TILE)+2),maxY:Math.min(TILE,Math.ceil(b.maxY-t.j*TILE)+2)};
      if(region.maxX<=region.minX||region.maxY<=region.minY)return;
      t.region=t.region?bboxUnion(t.region,region):region;t.ready=false;
    });
  }

  /** Восстанавливаем под ластиком все слои: сетку, защищённые картинки и остальные линии. */
  private renderRegion(level:Level,t:Tile,deadline:number):boolean {
    const r=t.region!,x=r.minX,y=r.minY,w=r.maxX-x,h=r.maxY-y;
    const c=this.patch??=document.createElement('canvas');
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}else this.clear(c);
    const ctx=context(c),m={...level.D,e:-t.i*TILE-x,f:-t.j*TILE-y};
    const worldBounds=()=>matBBox(matInvert(m),{minX:0,minY:0,maxX:w,maxY:h});
    if(t.background)drawBackground(ctx,{width:w,height:h,scale:level.scale,dpr:level.dpr,rotSteps:level.rotSteps,matrix:()=>m,worldBounds},this.grid);
    const objects=this.doc.query(matBBox(matInvert(m),{minX:-2,minY:-2,maxX:w+2,maxY:h+2})).sort((a,b)=>a.z-b.z);
    for(let i=0;i<objects.length;i++){
      drawObj(ctx,objects[i],level.D,m.e,m.f);
      if((i+1)%BATCH===0){
        flush(ctx);
        // Очень плотный участок возвращаем в обычную очередь с бюджетом кадра.
        // Незавершённую смесь слоёв поверх готовой плитки никогда не показываем.
        if(i+1<objects.length&&performance.now()>=deadline){t.region=null;t.queue=null;t.next=0;return false;}
      }
    }
    flush(ctx);
    const front=context(t.front!);front.save();front.setTransform(1,0,0,1,0,0);front.clearRect(x,y,w,h);front.drawImage(c,x,y);front.restore();flush(front);
    t.region=null;t.ready=true;return true;
  }

  /** Вызвать fn для существующих плиток уровня, задетых мировой рамкой. */
  private forTiles(level: Level, bbox: BBox, fn: (t: Tile, k: string) => void): void {
    const b = matBBox(level.D, bbox);
    const i0 = Math.floor((b.minX - 1) / TILE);
    const i1 = Math.floor((b.maxX + 1) / TILE);
    const j0 = Math.floor((b.minY - 1) / TILE);
    const j1 = Math.floor((b.maxY + 1) / TILE);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > level.tiles.size) {
      // Огромный объект: дешевле пройти по имеющимся плиткам.
      for (const [k, t] of level.tiles) {
        if (t.i >= i0 && t.i <= i1 && t.j >= j0 && t.j <= j1) fn(t, k);
      }
      return;
    }
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = key(i, j);
        const t = level.tiles.get(k);
        if (t) fn(t, k);
      }
    }
  }

  /** Показать уровень другого масштаба, растянув его плитки под текущий вид. */
  private drawStretched(ctx: CanvasRenderingContext2D, level: Level, v: Viewport): void {
    const M = matMul(v.linear(), level.Dinv);
    const tx = v.tx;
    const ty = v.ty;
    // Небольшое перекрытие, чтобы между растянутыми плитками не было щелей.
    const grow = 0.75 / Math.sqrt(Math.abs(M.a * M.d - M.b * M.c));
    ctx.setTransform(M.a, M.b, M.c, M.d, tx, ty);
    for (const t of level.tiles.values()) {
      if (!t.front) continue;
      const x = t.i * TILE;
      const y = t.j * TILE;
      const b = matBBox(M, { minX: x, minY: y, maxX: x + TILE, maxY: y + TILE });
      if (b.maxX + tx < 0 || b.maxY + ty < 0 || b.minX + tx > v.width || b.minY + ty > v.height) continue;
      ctx.drawImage(t.front, x, y, TILE + grow, TILE + grow);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private acquire(): HTMLCanvasElement {
    const c = this.pool.pop();
    if (c) {
      this.clear(c);
      return c;
    }
    const fresh = document.createElement('canvas');
    fresh.width = TILE;
    fresh.height = TILE;
    return fresh;
  }

  private clear(c: HTMLCanvasElement): void {
    const ctx = context(c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TILE, TILE);
  }

  private release(c: HTMLCanvasElement | null): void {
    if (!c) return;
    if (this.pool.length < POOL_MAX) {
      this.pool.push(c);
    } else {
      // Сразу отдать память видеокарты, не дожидаясь сборщика мусора.
      c.width = 0;
      c.height = 0;
    }
  }

  private releaseTile(t: Tile): void {
    this.dropBase(t);
    this.release(t.front);
    this.release(t.back);
    t.front = null;
    t.back = null;
    t.queue = null;
    t.region=null;t.approximate=false;t.canonical=false;
  }

  private dropLevel(level: Level | null): void {
    if (!level) return;
    for (const t of level.tiles.values()) this.releaseTile(t);
    level.tiles.clear();
  }
}
