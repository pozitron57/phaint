// Общий цвет и вид линии, индивидуальные пресеты, флажок, переназначение и сохранение.
const {app, test} = window.__phaint;
const assert = (value, message) => { if (!value) throw new Error(message); };
const tool = id => app.selectTool(id, false);
const last = () => [...app.doc.values()].at(-1);
const toast = () => document.querySelector('.toast').textContent;
const brush = app.panels.brush;
const perTool = [...brush.el.querySelectorAll('label')].find(label => label.textContent === 'Штрих и цвет привязаны к инструменту').querySelector('input');
const checkInk = (color, pattern) => assert(app.currentColor === color && app.linePattern === pattern, 'Цвет и штрих у ' + app.tool.id);
const blue = '#315ca8', green = '#79ad65', orange = '#cf914d';

assert(!app.settings.stylePerTool && !perTool.checked, 'по умолчанию цвета и штрихи общие');
const grid = app.settings.grid.enabled;
test.key('KeyG', {shiftKey: true});
assert(app.panels.background.open && app.settings.grid.enabled === grid, 'Shift+G открывает настройки сетки');
test.key('KeyG', {shiftKey: true});
test.key('KeyG');
assert(!app.panels.background.open && app.settings.grid.enabled !== grid, 'G переключает видимость сетки');
app.settings.snapToGrid = false;
app.view.restore({x: app.view.width / app.view.dpr / 2, y: app.view.height / app.view.dpr / 2, scale: 1, rotSteps: 0});
test.key('Tab'); test.key('Digit5');
test.key('KeyB');
const spacing = [...brush.el.querySelectorAll('label')].find(label => label.textContent.includes('Шаг точек')).querySelector('input');
spacing.value = '5';
spacing.dispatchEvent(new Event('input', {bubbles: true}));
app.closePanels();

const tools = ['pen','line','arrow','coordinates','ellipse','sine','parabola','hyperbola','adiabat','marker'];
app.settings.marker.width = 10;
for (const [index, id] of tools.entries()) {
  tool(id);
  checkInk(green, 'dots');
  const x = 180 + 210 * (index % 4), y = 235 + 150 * Math.floor(index / 4);
  const width = app.ink.width, count = app.doc.size;
  await test.pen([[x,y,.5], [x+115,y+25,.5]], 1);
  if (id === 'parabola') await test.pen([[x+55,y-30,.5]], 1);
  const o = last();
  assert(app.doc.size === count + 1 && o.color === green && o.dash?.dots && o.dash.gap === width * 5, 'общий штрих на холсте у ' + id);
}
assert(last().marker && last().pts[2] === 10 && last().opacity === .5, 'собственная толщина и прозрачность маркера');
await test.pen([[190,665,.5], [440,665,.5]], 1);
await test.idle();
const scene = document.querySelector('#scene').getContext('2d');
const pixel = x => scene.getImageData(Math.round(x * app.view.dpr), Math.round(665 * app.view.dpr), 1, 1).data;
assert(pixel(190)[1] > pixel(190)[0] + 10 && pixel(215)[0] > 245 && pixel(240)[1] > pixel(240)[0] + 10, 'на холсте видны полупрозрачные точки маркера с белым промежутком');
const reopened = await app.files.worker.run('native', await app.files.worker.run('svg', app.files.snapshot()));
const marker = reopened.objects.at(-1);
assert(marker.marker && marker.color === green && marker.dash.dots && marker.dash.gap === 50, 'штрих маркера восстановился из SVG');
app.setLineStyle({dotted: false, round: false});
await test.pen([[540,665,.5]], 1);
await test.idle();
assert(pixel(540)[1] > pixel(540)[0] + 10, 'касание маркером оставляет точку и при плоских концах штрихов');

const state = app.history.state, drawn = [...app.doc.values()];
test.key('F5'); test.key('F5', {repeat: true});
assert(app.settings.stylePerTool && perTool.checked && toast().includes('ВКЛ') && toast().includes('свой штрих и цвет'), 'F5 включает привязку один раз и объясняет режим');
checkInk(green, 'solid');
tool('arrow'); checkInk(blue, 'solid');
app.chooseColor('#c9514e'); app.setLinePattern('dash');
tool('hyperbola'); app.chooseColor('#946bb0'); app.setLinePattern('dash');
tool('adiabat'); checkInk(blue, 'solid'); app.chooseColor('#000000');
tool('coordinates'); checkInk(blue, 'solid'); app.setLinePattern('dots');
tool('arrow'); checkInk('#c9514e', 'dash'); app.chooseColor(orange);
tool('ellipse'); checkInk(blue, 'solid');
test.key('F5');
assert(!app.settings.stylePerTool && !perTool.checked && toast().includes('ВЫКЛ') && toast().includes('общие'), 'F5 возвращает общий режим с сообщением');
checkInk(orange, 'dots');
tool('marker'); checkInk(orange, 'dots'); app.chooseColor('#ffffff'); app.setLinePattern('dash');
tool('line'); checkInk('#ffffff', 'dash');
test.key('KeyB'); perTool.click();
assert(app.settings.stylePerTool && brush.open, 'флажок включает тот же режим');
for (const [id, color, pattern] of [['line', blue, 'solid'], ['marker', green, 'solid'], ['arrow', orange, 'dash'],
  ['coordinates', blue, 'dots'], ['hyperbola', '#946bb0', 'dash'], ['adiabat', '#000000', 'solid']]) {
  tool(id); checkInk(color, pattern);
}
assert(app.history.state === state && drawn.every(o => app.doc.get(o.id) === o), 'выбор оформления сохраняет уже нарисованные объекты и историю');
tool('marker'); test.key('F5');
await test.shot('общий-штрих-и-цвет');
await app.flushSettings();
const saved = await app.platform.loadSettings();
assert(saved.stylePerTool === false && saved.sharedStyle.color === '#ffffff' && saved.sharedStyle.dashed &&
  saved.arrow.color === orange && saved.coordinates.dotted && saved.marker.width === 10, 'сохранились режим и оба набора настроек');
app.closePanels();
await app.applyShortcuts({'style.perTool': ['KeyU'], 'ui.background': ['F6']});
test.key('F5'); test.key('KeyG', {shiftKey: true});
assert(!app.settings.stylePerTool && !app.panels.background.open, 'переназначение освобождает стандартные клавиши');
test.key('KeyU'); test.key('F6');
assert(app.settings.stylePerTool && app.panels.background.open, 'оба новых сочетания действуют');
await app.applyShortcuts({'ui.background': ['F5']});
assert(!app.actions.keysOf('style.perTool').includes('F5'), 'явное старое назначение F5 для сетки сохраняет приоритет');
return {ok: true, tools: tools.length, objects: drawn.length};
