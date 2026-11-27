// Шпаргалки README. Раскладка берётся из реестра команд, рисунки — с кнопок самой Phaint.
import { writeFileSync } from 'node:fs';
import { languages, setLanguage, t } from '../src/core/language.ts';
import { registerActions } from '../src/actions-list.ts';
import { Actions, normalizeCombo } from '../src/core/actions.ts';
import { QUICK_COLORS } from '../src/core/settings.ts';
import { ICONS } from '../src/ui/dom.ts';

const actions = new Actions();
registerActions({ actions });
const captions = {
  'tool.pen': ['action.tool.pen', 'pen'], 'tool.line': ['action.tool.line', 'line'],
  'tool.arrow': ['action.tool.arrow', 'arrow'], 'tool.coordinates': ['keyboard.tool.coordinates', 'coordinates'],
  'tool.ellipse': ['keyboard.tool.ellipse', 'ellipse'], 'tool.sine': ['keyboard.tool.sine', 'sine'],
  'tool.parabola': ['action.tool.parabola', 'parabola'], 'tool.hyperbola': ['action.tool.hyperbola', 'hyperbola'],
  'tool.marker': ['keyboard.tool.marker', 'marker'], 'tool.select': ['keyboard.tool.select', 'select'],
  'style.solid': ['panel.solid', 'line'], 'style.dashed': ['keyboard.style.dashed', 'dash'],
  'style.dotted': ['keyboard.style.dotted', 'dots'], 'style.dots': ['keyboard.style.dots', 'dots'],
  'style.perTool': ['keyboard.style.perTool'],
  'color.blue': ['action.color.blue', 'color'], 'color.red': ['action.color.red', 'color'], 'color.green': ['action.color.green', 'color'],
  'color.palette': ['keyboard.color.palette'], 'edit.undo': ['keyboard.edit.undo', 'undo'], 'edit.redo': ['keyboard.edit.redo', 'redo'],
  'edit.pasteImage': ['keyboard.edit.pasteImage', 'image'], 'edit.delete': ['keyboard.edit.delete'],
  'ui.brush': ['keyboard.ui.brush', 'sliders'], 'ui.toolbar': ['keyboard.ui.toolbar'], 'ui.escape': ['settings.cancel'],
  'ui.debug': ['help.debug'], 'view.fullscreen': ['keyboard.view.fullscreen'],
  'view.grid': ['keyboard.view.grid', 'grid'], 'view.reset': ['keyboard.view.reset'],
  'view.zoomIn': ['keyboard.view.zoomIn'], 'view.zoomOut': ['keyboard.view.zoomOut'],
  'view.left': ['keyboard.view.left'], 'view.right': ['keyboard.view.left'],
  'view.up': ['keyboard.view.left'], 'view.down': ['keyboard.view.left'],
  'width.thinner': ['keyboard.width.thinner'], 'width.thicker': ['keyboard.width.thicker'],
  'selection.rotate.BracketLeft': ['keyboard.selection.rotate.BracketLeft'], 'selection.rotate.BracketRight': ['keyboard.selection.rotate.BracketRight'],
  'selection.rotate.Comma': ['keyboard.selection.rotate.Comma'], 'selection.rotate.Period': ['keyboard.selection.rotate.Period'],
  'gesture.pan': ['keyboard.gesture.pan'],
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
  ['keyboard.group.shapes', [
    ['tool.arrowBoth', 'keyboard.legend.tool.arrowBoth'],
    ['tool.adiabat', 'keyboard.legend.tool.adiabat'],
    ['gesture.ellipse', 'keyboard.legend.gesture.ellipse', 'ellipse'],
    ['arrowHead.shorter', 'keyboard.legend.arrowHead.shorter', 'heads'],
  ]],
  ['help.canvas', [
    ['tool.eraser', 'action.tool.eraser'], ['ui.background', 'keyboard.legend.ui.background'],
    ['ui.toolbar', 'keyboard.legend.ui.toolbar', 'last'],
    ['tool.space', 'keyboard.legend.tool.space'],
  ]],
  ['keyboard.group.files', [
    ['file.open', 'keyboard.legend.file.open'],
    ['file.save', 'action.file.save'], ['file.export', 'export.export'],
    ['ui.shortcuts', 'keyboard.legend.ui.shortcuts'],
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
function render() {
  const title = t('keyboard.title');
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1302" height="722" viewBox="0 0 1302 722" role="img" aria-labelledby="title desc">',
    '<title id="title">Phaint · ' + title + '</title><desc id="desc">' + t('keyboard.description') + '</desc>',
    '<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif">', rect(0, 0, 1302, 722, 18, '#f8fafc'),
    xmlText(margin, 49, 'Phaint', 34, blue, 750), xmlText(160, 49, title, 32, ink, 650),
    xmlText(margin, 81, t('keyboard.physicalKeys'), 18, muted),
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
    if (caption[1]) {
      parts.push('<g transform="translate(' + (x+w-32) + ' ' + (y+5) + ')" fill="none" color="' + (accent ?? blue) +
        '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[caption[1]] + '</g>');
    }
    const labelText=t(caption[0]);
    const textSize = short ? 11.5 : w < pitch && labelText.length > 7 ? 12 : 13;
    parts.push(xmlText(x + 9, y + h - 8, labelText, textSize, tool ? '#234678' : muted));
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
    parts.push(xmlText(x, 519, t(heading), 23, ink, 650));
    entries.forEach(([id, message, variant], j) => {
      let keys = combo(id, variant === 'last');
      if (variant === 'ellipse') keys = combo('tool.ellipse') + ' → ' + keys;
      if (variant === 'heads') keys = combo(id, true) + ' / ' + combo('arrowHead.longer', true);
      const rowY = 554 + j * 37;
      parts.push(xmlText(x, rowY, keys, 20, blue, 650), xmlText(x + 94, rowY, t(message), 17, ink));
    });
  });
  parts.push('</g></svg>');
  return parts.join('\n') + '\n';
}
for (const {code} of languages) {
  setLanguage(code);
  writeFileSync(code==='en'?'docs/keyboard.svg':`docs/keyboard.${code}.svg`, render());
}
