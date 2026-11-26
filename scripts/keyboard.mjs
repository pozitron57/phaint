// Шпаргалки README. Раскладка берётся из реестра команд, рисунки — с кнопок самой Phaint.
import { writeFileSync } from 'node:fs';
import { registerActions } from '../src/actions-list.ts';
import { Actions, normalizeCombo } from '../src/core/actions.ts';
import { QUICK_COLORS } from '../src/core/settings.ts';
import { ICONS } from '../src/ui/dom.ts';

const actions = new Actions();
registerActions({ actions });
const captions = {
  'tool.pen': ['Pen', 'Ручка', 'pen'], 'tool.line': ['Line', 'Прямая', 'line'],
  'tool.arrow': ['Arrow', 'Стрелка', 'arrow'], 'tool.coordinates': ['Axes', 'Оси', 'coordinates'],
  'tool.ellipse': ['Circle', 'Круг', 'ellipse'], 'tool.sine': ['Sine', 'Синусоида', 'sine'],
  'tool.parabola': ['Parabola', 'Парабола', 'parabola'], 'tool.hyperbola': ['Hyperbola', 'Гипербола', 'hyperbola'],
  'tool.marker': ['Marker', 'Маркер', 'marker'], 'tool.select': ['Select', 'Выбор', 'select'],
  'style.solid': ['Solid', 'Сплошная', 'line'], 'style.dashed': ['Dashes', 'Штрихи', 'dash'],
  'style.dotted': ['Dots', 'Точки', 'dots'], 'style.dots': ['Dots on/off', 'Вкл. точки', 'dots'],
  'style.perTool': ['Tool styles', 'Стили'],
  'color.blue': ['Blue', 'Синий', 'color'], 'color.red': ['Red', 'Красный', 'color'], 'color.green': ['Green', 'Зелёный', 'color'],
  'color.palette': ['Next colour', 'След. цвет'], 'edit.undo': ['Undo', 'Отмена', 'undo'], 'edit.redo': ['Redo', 'Повтор', 'redo'],
  'edit.pasteImage': ['Image', 'Картинка', 'image'], 'edit.delete': ['Delete selection', 'Удалить выделение'],
  'ui.brush': ['Settings', 'Параметры', 'sliders'], 'ui.toolbar': ['Toolbar', 'Панель'], 'ui.escape': ['Cancel', 'Отмена'],
  'ui.debug': ['Debug', 'Отладка'], 'view.fullscreen': ['Full screen', 'Весь экран'],
  'view.grid': ['Grid', 'Сетка', 'grid'], 'view.reset': ['Reset view', 'Сброс'],
  'view.zoomIn': ['Zoom in', 'Крупнее'], 'view.zoomOut': ['Zoom out', 'Мельче'],
  'view.left': ['Nudge / pan', 'Сдвиг'], 'view.right': ['Nudge / pan', 'Сдвиг'],
  'view.up': ['Nudge / pan', 'Сдвиг'], 'view.down': ['Nudge / pan', 'Сдвиг'],
  'width.thinner': ['Thinner', 'Тоньше'], 'width.thicker': ['Thicker', 'Толще'],
  'selection.rotate.BracketLeft': ['−90°', '−90°'], 'selection.rotate.BracketRight': ['+90°', '+90°'],
  'selection.rotate.Comma': ['−15°', '−15°'], 'selection.rotate.Period': ['+15°', '+15°'],
  'gesture.pan': ['Hold and move to pan', 'Удерживать и двигать холст'],
};
const singles = new Map();
for (const { id } of actions.list()) {
  if (captions[id]) for (const key of actions.keysOf(id)) if (!key.includes('+')) singles.set(key, id);
}
const letters = word => [...word].map(letter => 'Key' + letter);
const rows = [
  [['Escape', 1.5], ...Array.from({length:12}, (_, i) => 'F' + (i + 1)), ['Power', 1.5]],
  ['Backquote', ...[...'1234567890'].map(digit => 'Digit' + digit), 'Minus', 'Equal', ['Backspace', 2]],
  [['Tab', 1.5], ...letters('QWERTYUIOP'), 'BracketLeft', 'BracketRight', ['Backslash', 1.5]],
  [['CapsLock', 1.75], ...letters('ASDFGHJKL'), 'Semicolon', 'Quote', ['Enter', 2.25]],
  [['Shift', 2.25], ...letters('ZXCVBNM'), 'Comma', 'Period', 'Slash', ['Shift', 2.75]],
  ['Fn', 'Ctrl', ['Alt', 1.25], ['Cmd', 1.25], ['Space', 5.25], ['Cmd', 1.25], 'Alt', 'ArrowLeft', 'Arrows', 'ArrowRight'],
];
const symbols = {
  Escape:'esc', Backquote:'`', Minus:'−', Equal:'=', Backspace:'delete', Tab:'tab', BracketLeft:'[', BracketRight:']',
  Backslash:'\\', CapsLock:'caps lock', Semicolon:';', Quote:"'", Enter:'return', Shift:'⇧ shift', Comma:',', Period:'.',
  Slash:'/', Fn:'fn', Ctrl:'⌃ control', Alt:'⌥ option', Cmd:'⌘ command', Space:'space', Power:'◉',
  ArrowLeft:'←', ArrowRight:'→', ArrowUp:'↑', ArrowDown:'↓',
};
const groups = [
  [['Shapes', 'Фигуры'], [
    ['tool.arrowBoth', 'Double arrow', 'Двусторонняя стрелка'],
    ['tool.adiabat', 'Adiabatic curve', 'Адиабата'],
    ['gesture.ellipse', 'Hold Shift while drawing an ellipse', 'Держать Shift для эллипса', 'ellipse'],
    ['arrowHead.shorter', 'Shorter / longer arrowhead', 'Короче / длиннее наконечник', 'heads'],
  ]],
  [['Canvas', 'Холст'], [
    ['tool.eraser', 'Eraser', 'Ластик'], ['ui.background', 'Grid and snapping', 'Сетка и привязка'],
    ['ui.toolbar', 'Show / hide toolbar', 'Показать / скрыть панель', 'last'],
    ['tool.space', 'Make vertical space', 'Раздвинуть по вертикали'],
  ]],
  [['Files & settings', 'Файлы и настройки'], [
    ['file.open', 'Open SVG, image or PDF', 'Открыть SVG, картинку, PDF'],
    ['file.save', 'Save SVG', 'Сохранить SVG'], ['file.export', 'Export', 'Экспорт'],
    ['ui.shortcuts', 'Customise shortcuts', 'Настроить клавиши'],
  ]],
];
const keyLabel = key => symbols[key] ?? key.replace(/^(Key|Digit)/, '');
function combo(id, last = false) {
  const keys = actions.keysOf(id);
  return normalizeCombo(last ? keys.at(-1) : keys[0]).split('+').map(part =>
    ({ Cmd:'⌘', Shift:'⇧', Ctrl:'⌃', Alt:'⌥' })[part] ?? keyLabel(part)).join('');
}
const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const xmlText = (x, y, value, size, fill, weight = 500) =>
  '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill + '" font-weight="' + weight + '">' + esc(value) + '</text>';
const rect = (x, y, w, h, radius, fill, stroke = 'none') =>
  '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="' + fill + '" stroke="' + stroke + '"/>';
const ink = '#192e48', blue = '#315ca8', muted = '#526576';
const pitch = 82, margin = 36;
function render(lang) {
  const t = (en, ru) => lang === 0 ? en : ru;
  const title = t('Keyboard shortcuts', 'Горячие клавиши');
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1302" height="722" viewBox="0 0 1302 722" role="img" aria-labelledby="title desc">',
    '<title id="title">Phaint · ' + title + '</title><desc id="desc">' + t('Default shortcuts on a Mac keyboard.', 'Стандартные назначения на клавиатуре Mac.') + '</desc>',
    '<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif">', rect(0, 0, 1302, 722, 18, '#f8fafc'),
    xmlText(margin, 49, 'Phaint', 34, blue, 750), xmlText(160, 49, title, 32, ink, 650),
    xmlText(margin, 81, t('Use the same physical keys in any input language.', 'Назначения привязаны к физическим клавишам при любой раскладке.'), 18, muted),
    xmlText(1131, 48, 'macOS · QWERTY', 16, muted, 600)];
  function keycap(code, x, y, w, h) {
    const id = singles.get(code), caption = captions[id], tool = id?.startsWith('tool.');
    const active = !!caption, accent = id?.startsWith('color.') ? QUICK_COLORS[id.slice(6)] : undefined;
    const fill = tool ? '#e6efff' : active ? '#ffffff' : '#eff2f5';
    parts.push(rect(x, y, w, h, 7, fill, tool ? '#a6bddf' : '#ccd5dd'));
    const label = keyLabel(code);
    const keyInk = active ? ink : '#6b7988';
    const short = h < 40;
    parts.push(xmlText(x + 9, y + (short ? 17 : 24), label, label.length > 3 ? 14 : short ? 15 : 20, keyInk, 650));
    if (!caption || h < 30) return;
    if (caption[2]) {
      parts.push('<g transform="translate(' + (x+w-32) + ' ' + (y+5) + ')" fill="none" color="' + (accent ?? blue) +
        '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[caption[2]] + '</g>');
    }
    const textSize = short ? 11.5 : w < pitch && caption[lang].length > 7 ? 12 : 13;
    parts.push(xmlText(x + 9, y + h - 8, caption[lang], textSize, tool ? '#234678' : muted));
  }
  let y = 104;
  for (const [index, row] of rows.entries()) {
    const h = index === 0 ? 39 : index === 5 ? 51 : 56;
    let x = margin;
    for (const key of row) {
      const [code, units] = Array.isArray(key) ? key : [key, 1];
      const w = pitch * units - 5;
      if (code === 'Arrows') {
        keycap('ArrowUp', x, y, w, 23);
        keycap('ArrowDown', x, y+27, w, 24);
      } else keycap(code, x, y, w, h);
      x += pitch * units;
    }
    y += h + 6;
  }
  parts.push(rect(margin, 481, 1225, 1, 0, '#c3cfdb'));
  groups.forEach(([heading, entries], i) => {
    const x = [margin, 481, 882][i];
    parts.push(xmlText(x, 519, heading[lang], 23, ink, 650));
    entries.forEach(([id, en, ru, variant], j) => {
      let keys = combo(id, variant === 'last');
      if (variant === 'ellipse') keys = combo('tool.ellipse') + ' → ' + keys;
      if (variant === 'heads') keys = combo(id, true) + ' / ' + combo('arrowHead.longer', true);
      const rowY = 554 + j * 37;
      parts.push(xmlText(x, rowY, keys, 20, blue, 650), xmlText(x + 94, rowY, t(en, ru), 17, ink));
    });
  });
  parts.push('</g></svg>');
  return parts.join('\n') + '\n';
}
for (const [lang, file] of ['docs/keyboard.svg', 'docs/keyboard.ru.svg'].entries()) writeFileSync(file, render(lang));
