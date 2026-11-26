// Мелкие помощники для сборки интерфейса без фреймворка.

import { language } from '../core/language.ts';

type Child = Node | string | null | undefined | false;

/** Точные распространённые дроби; произвольный показатель — коротким десятичным числом. */
export function gammaLabel(gamma:number):string {
  for(const [value,label] of [[5/3,'5/3'],[7/5,'7/5']] as const)if(Math.abs(gamma-value)<1e-9)return label;
  return String(Math.round(gamma*1000)/1000).replace('.',language==='ru'?',':'.');
}

/** Создать элемент: h('button', { class: 'x', onclick: fn }, 'текст'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, unknown> | null,
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

export const ICONS: Record<string, string> = {
  keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>',
  arrow:'<path d="M4 20L20 4M10 4h10v10"/>',
  arrowBoth:'<path d="M4 20L20 4M10 4h10v10M4 10v10h10"/>',
  coordinates:'<path d="M5 20V3m-3 3 3-3 3 3M5 20h16m-3-3 3 3-3 3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  marker:'<path d="M6 14l9-10 5 5-9 10zM6 14l5 5-7 2z"/>',
  ellipse:'<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  sine:'<path d="M2 12C5-1 8-1 12 12S19 25 22 12"/>',
  parabola:'<path d="M3 20Q12-12 21 20"/>',
  hyperbola:'<path d="M4 3C4.8 16 8 19.2 21 20"/>',
  dash:'<path d="M3 16l4-2m3-1l4-2m3-1l4-2"/>',
  dots:'<path d="M3 17h.01M7.5 14.5h.01M12 12h.01M16.5 9.5h.01M21 7h.01" stroke-width="2.8"/>',
  line: '<path d="M4 20L20 4"/>',
  original: '<path d="M5 3h10l4 4v14H5zM9 11h6M9 15h6"/><path d="M15 3v5h4"/>',
  select: '<path d="M5 3l14 10-7 1-3 7z"/>',
  space:'<path d="M4 12h16M12 8V3m-3 3 3-3 3 3M12 16v5m-3-3 3 3 3-3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="M3 18l6-6 4 4 4-5 4 5"/>',
  eraser: '<path d="M4 14l9-10a2 2 0 013 0l5 5a2 2 0 010 3l-8 9H9l-5-5a1.4 1.4 0 010-2zM9 9l8 8M13 21h8"/>',
  color: '<circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>',
  open: '<path d="M3 7V5h6l2 2h10v13H3V7z"/><path d="M3 10h18"/>',
  save: '<path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8"/>',
  pen: '<path d="M4 20l1.2-4.4L16.6 4.2a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.4 18.8 4 20z"/><path d="M14.5 6.3l3.2 3.2"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  undo: '<path d="M8 13L4 9l4-4"/><path d="M4 9h10a5.5 5.5 0 010 11h-3"/>',
  redo: '<path d="M16 13l4-4-4-4"/><path d="M20 9H10a5.5 5.5 0 000 11h3"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export function icon(name: string): HTMLElement {
  const el = h('span', { class: 'icon' });
  el.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    `stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
  return el;
}
