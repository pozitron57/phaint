// Импорт SVG без выполнения кода и сетевых загрузок. Простые пути становятся отдельными контурами.
// Текст, градиенты и встроенные картинки сохраняются отдельными векторными фрагментами.
// Зависимые эффекты и неподдерживаемые стили остаются в едином исходном SVG.
// Изменённый во внешнем редакторе SVG никогда не заменяется устаревшими данными пера.
import { cancellationPoint } from '../core/cancel.ts';
import { svgParts } from './svg-parts.ts';
import { makeSvg } from '../core/types.ts';
import type { DocumentData } from './codec.ts';
import { MAX_FILE_BYTES } from './codec.ts';
import type { GridSettings } from '../core/settings.ts';
import type { DocumentWorker } from './worker-client.ts';

const NS = 'http://www.w3.org/2000/svg';
const length = (s: string | null, fallback: number): number => {
  if (!s) return fallback;
  const m = /^\s*([\d.eE+-]+)\s*(px|pt|pc|mm|cm|in)?\s*$/.exec(s);
  if (!m) return fallback;
  return Number(m[1]) * ({ px: 1, pt: 96/72, pc: 16, mm: 96/25.4, cm: 96/2.54, in: 96 }[m[2] ?? 'px'] ?? 1);
};

export function sanitizeSvg(text: string): { source: string; x: number; y: number; width: number; height: number } {
  if (text.length > MAX_FILE_BYTES) throw new Error('SVG слишком большой (предел 256 МБ).');
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const comments=doc.createTreeWalker(doc,NodeFilter.SHOW_COMMENT);const removed:Node[]=[];
  while(comments.nextNode()) if(/^phaint-(asset|end)-/.test(comments.currentNode.textContent??''))removed.push(comments.currentNode);
  for(const node of removed)node.parentNode?.removeChild(node);
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== NS) throw new Error('Не удалось прочитать SVG: неверный XML.');
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el !== root && (el.namespaceURI !== NS || ['metadata', 'script', 'foreignObject', 'animate', 'animateTransform', 'animateMotion', 'set'].includes(el.localName))) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.localName)) { el.removeAttributeNode(attr); continue; }
      const value = attr.value.trim();
      if (attr.localName === 'href' && value && !value.startsWith('#') && !/^data:image\/(png|jpeg|webp|gif);base64,[\da-z+/=\s]+$/i.test(value)) {
        throw new Error('SVG ссылается на внешний файл. Встройте картинки в SVG перед открытием.');
      }
      checkCss(value);
    }
    if (el.localName === 'style') checkCss(el.textContent ?? '');
  }
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  let x = 0, y = 0;
  let vbWidth = 300, vbHeight = 150;
  if (vb) {
    if (vb.length !== 4 || !vb.every(v => Number.isFinite(v) && Math.abs(v) <= 1e9) || vb[2] <= 0 || vb[3] <= 0) throw new Error('Некорректный viewBox SVG.');
    [x, y, vbWidth, vbHeight] = vb;
  }
  const width = length(root.getAttribute('width'), vbWidth), height = length(root.getAttribute('height'), vbHeight);
  if (![x, y, width, height].every(v => Number.isFinite(v) && Math.abs(v) <= 1e9) || width <= 0 || height <= 0) throw new Error('Некорректный размер SVG.');
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `${x} ${y} ${vb ? vbWidth : width} ${vb ? vbHeight : height}`);
  root.removeAttribute('x'); root.removeAttribute('y');
  return { source: new XMLSerializer().serializeToString(root), x, y, width, height };
}

function checkCss(value: string): void {
  const urls = [...value.matchAll(/url\(([^)]*)\)/gi)];
  if (/@import|@font-face|\\/i.test(value) || urls.some(m => !m[1].trim().replace(/^['"]|['"]$/g, '').startsWith('#'))) {
    throw new Error('SVG содержит внешние ресурсы или неподдерживаемые CSS-ссылки. Встройте ресурсы в файл.');
  }
}

export async function openSvg(text: string, worker: DocumentWorker, grid: GridSettings, screenWidth: number, screenHeight: number, signal?: AbortSignal): Promise<DocumentData> {
  const own = await worker.run<DocumentData | null>('native', text, signal);
  if (own) {
    // Даже данные metadata считаем входным файлом, а не доверенным кодом.
    const objects=[];
    for(const o of own.objects){
      if(o.kind==='svg'){await cancellationPoint(signal);objects.push({...o,source:sanitizeSvg(o.source).source});}
      else objects.push(o);
    }
    own.objects=objects;
    return own;
  }
  await cancellationPoint(signal);
  const svg = sanitizeSvg(text);
  await cancellationPoint(signal);
  const baseScale=Math.max(0.05, Math.min(1, (screenWidth - 60) / svg.width, (screenHeight - 60) / svg.height));
  return {
    baseScale,
    objects: svgParts(svg.source,svg.x,svg.y) ?? [makeSvg(1, 1, svg.x, svg.y, svg.width, svg.height, svg.source)],
    grid: { ...grid },
    view: { scale: baseScale,
      rotSteps: 0, x: svg.x + svg.width / 2, y: svg.y + svg.height / 2 },
  };
}
