// Список действий приложения и хоткеи по умолчанию. Новое действие добавляется сюда —
// и сразу доступно клавишей, кнопкой и в редакторе сочетаний.
import type { App } from './app.ts';
import { generateStrokes } from './debug.ts';
import { GESTURES, shortcutInfo } from './core/shortcut-info.ts';
import type { KeyLike } from './core/actions.ts';
import { QUICK_COLORS } from './core/settings.ts';

export function registerActions(app: App): void {
  const add = (id: string, title: string, keys: string[], run: (key?:KeyLike) => void, repeat = false): void => {
    app.actions.register({ id, title, keys, repeat,...shortcutInfo(id),run:key=>{
      if(!id.startsWith('arrowHead.'))app.recentArrow=undefined;
      run(key);
    } });
  };

  add('tool.pen', 'Ручка', ['KeyD', 'Cmd+Shift+KeyD'], () => app.selectTool('pen'));
  add('tool.line', 'Прямая', ['KeyL'], () => {
    if(!app.selection?.setLineHeads('line'))app.selectTool('line');
  });
  add('tool.eraser', 'Ластик', ['Cmd+Shift+KeyE'], () => app.selectTool('eraser'));
  add('tool.arrow','Стрелка',['KeyA'],()=>{
    if(!app.selection?.setLineHeads('next'))app.selectArrow(false);
  });
  add('tool.arrowBoth','Двусторонняя стрелка',['Shift+KeyA'],()=>{
    if(!app.selection?.setLineHeads('previous'))app.selectArrow(true);
  });
  add('selection.flipArrowHead','Перенести наконечник на другой конец',['Ctrl+KeyA'],()=>app.selection?.setLineHeads('reverse'));
  add('tool.coordinates','Координаты',['KeyC'],()=>app.selectTool('coordinates'));
  add('tool.marker','Маркер',['Digit4'],()=>app.selectTool('marker'));
  add('tool.ellipse','Окружность / эллипс',['KeyO'],()=>app.selectTool('ellipse'));
  add('tool.sine','Синусоида',['KeyS'],()=>app.selectTool('sine'));
  add('tool.parabola','Парабола',['KeyP'],()=>app.selectTool('parabola'));
  add('tool.hyperbola','Гипербола',['KeyH'],()=>app.selectTool('hyperbola'));
  add('tool.adiabat','Адиабата',['Shift+KeyH'],()=>app.selectTool('adiabat'));
  add('style.solid','Сплошная линия',['Digit1'],()=>app.setLinePattern('solid'));
  add('style.dashed','Штриховая линия',['Digit2'],()=>app.setLinePattern('dash'));
  add('style.dotted','Пунктирная линия (точки)',['Digit3'],()=>app.setLinePattern('dots'));
  add('style.dash','Следующий вид линии',[],()=>app.cycleLinePattern());
  add('style.previous','Предыдущий вид линии',['Shift+Digit2'],()=>app.cycleLinePattern(-1));
  add('style.dots','Включить или выключить точки',['Digit5'],()=>app.toggleDash('dots'));
  add('style.perTool','Штрих и цвет привязаны к инструменту',['F5'],()=>app.setStylePerTool(!app.settings.stylePerTool));
  add('tool.select', 'Выбор объекта', ['KeyM'], () => app.selectTool('select'));
  add('tool.space','Раздвижение',['Cmd+Shift+KeyV'],()=>app.selectTool('space'));
  add('edit.pasteImage', 'Вставить картинку', ['KeyV'], () => {void app.pasteImage();});
  add('edit.copy','Скопировать выделение',['Cmd+KeyC'],()=>{void app.clipboard.copy();});
  add('edit.copyImageText','Распознать и скопировать текст',['Ctrl+KeyC'],()=>{void app.imageText.copy();});
  add('edit.cut','Вырезать выделение',['Cmd+KeyX'],()=>{void app.clipboard.copy(true);});
  add('edit.paste','Вставить объекты',['Cmd+KeyV'],()=>{void app.clipboard.paste();});
  add('edit.delete', 'Удалить выбранное', ['Backspace','Delete'], () => app.deleteSelection());
  add('edit.selectAll', 'Выделить всё', ['Cmd+KeyA'], () => app.selectAll());
  add('selection.order.front','На передний план',['Ctrl+KeyF'],()=>app.selection?.reorder('front'));
  add('selection.order.back','На задний план',['Ctrl+KeyB'],()=>app.selection?.reorder('back'));
  add('selection.order.forward','На один шаг вперёд',['Ctrl+Shift+KeyF'],()=>app.selection?.reorder('forward'));
  add('selection.order.backward','На один шаг назад',['Ctrl+Shift+KeyB'],()=>app.selection?.reorder('backward'));
  add('eraser.original', 'Стирать также исходный SVG', [], () => app.toggleOriginalEraser());
  add('color.menu','Все цвета',['Shift+Tab'],()=>app.palette.toggle());
  add('color.blue','Синий',['KeyQ'],()=>app.palette.pick(QUICK_COLORS.blue));
  add('color.red','Красный',['KeyW'],()=>app.palette.pick(QUICK_COLORS.red));
  add('color.green','Зелёный',['KeyE'],()=>app.palette.pick(QUICK_COLORS.green));
  add('color.palette', 'Следующий цвет', ['Tab'], () => app.palette.advance());

  add('view.grid', 'Показать или скрыть сетку', ['KeyG'], () => {
    app.settings.grid.enabled=!app.settings.grid.enabled;
    app.settingsChanged(); app.files.changed();
    app.panels.background.sync(); app.renderer.invalidateScene();
  });

  add('file.new', 'Новый рисунок', ['Cmd+KeyN'], () => { void app.files.newDocument(); });
  add('file.open', 'Открыть SVG, картинку или PDF…', ['Cmd+KeyO'], () => { void app.files.open(); });
  add('file.recent','Открыть последний файл',['Cmd+KeyR'],()=>{void app.files.open(true);});
  add('file.save', 'Сохранить SVG', ['Cmd+KeyS'], () => { void app.files.save(); });
  add('file.saveAs', 'Сохранить SVG как…', ['Cmd+Shift+KeyS'], () => { void app.files.save(true); });
  add('file.export','Экспорт SVG / PDF / PNG / JPG…',['Cmd+KeyE'],()=>{void app.files.export();});

  add('edit.undo', 'Отменить', ['KeyZ', 'Cmd+KeyZ'], () => app.undo(), true);
  add('edit.redo', 'Повторить', ['KeyY', 'Cmd+Shift+KeyZ'], () => app.redo(), true);

  add('width.thinner', 'Линия тоньше', ['F1'], () => app.changeWidth(-1), true);
  add('width.thicker', 'Линия толще', ['F2'], () => app.changeWidth(1), true);

  add('arrowHead.narrower','Уменьшить ширину головки',['Shift+F1'],()=>app.stepArrowHead('headWidth',-1),true);
  add('arrowHead.wider','Увеличить ширину головки',['Shift+F2'],()=>app.stepArrowHead('headWidth',1),true);
  add('arrowHead.shorter','Уменьшить длину головки',['Ctrl+F1'],()=>app.stepArrowHead('headLength',-1),true);
  add('arrowHead.longer','Увеличить длину головки',['Ctrl+F2'],()=>app.stepArrowHead('headLength',1),true);

  add('view.zoomIn', 'Увеличить', ['Equal','Shift+Equal','Ctrl+Equal', 'Ctrl+Shift+Equal', 'Ctrl+NumpadAdd'], () => app.zoomStep(1), true);
  add('view.zoomOut', 'Уменьшить', ['Minus','Ctrl+Minus', 'Ctrl+Shift+Minus', 'Ctrl+NumpadSubtract'], () => app.zoomStep(-1), true);
  add('view.reset', 'Сбросить масштаб и поворот', ['Digit0','Numpad0','Cmd+Digit0'], () => app.resetView());
  add('view.rotateCw', 'Повернуть холст по часовой', ['Cmd+ArrowRight'], () => app.rotate(1), true);
  add('view.rotateCcw', 'Повернуть холст против часовой', ['Cmd+ArrowLeft'], () => app.rotate(-1), true);
  add('view.left', 'Влево: выделение или вид холста', ['ArrowLeft'], key => app.scroll(1, 0,key), true);
  add('view.right', 'Вправо: выделение или вид холста', ['ArrowRight'], key => app.scroll(-1, 0,key), true);
  add('view.up', 'Вверх: выделение или вид холста', ['ArrowUp'], key => app.scroll(0, 1,key), true);
  add('view.down', 'Вниз: выделение или вид холста', ['ArrowDown'], key => app.scroll(0, -1,key), true);
  for(const [direction,title,dx,dy] of [['Left','влево',-1,0],['Right','вправо',1,0],['Up','вверх',0,-1],['Down','вниз',0,1]] as const)
    add(`selection.move${direction}`,`Сдвинуть выделение ${title} на 2 клетки`,[],key=>app.moveSelection(dx,dy,key,true),true);
  add('view.fullscreen', 'Полный экран', ['F11'], () => app.platform.toggleFullscreen());

  add('ui.toolbar', 'Показать или скрыть панель', ['F9'], () => app.toggleToolbar());
  add('ui.brush', 'Настройки инструмента или выделения', ['KeyB'], () => app.togglePanel('brush'));
  add('ui.background', 'Фон и сетка', ['Shift+KeyG'], () => app.togglePanel('background'));
  add('ui.shortcuts','Настройки клавиш…',['Cmd+Comma'],()=>app.shortcuts.show());
  for(const [key,degrees] of [['BracketLeft',-90],['BracketRight',90],['Comma',-15],['Period',15],['Shift+Comma',-1],['Shift+Period',1]] as const) add(`selection.rotate.${key}`,`Повернуть на ${Math.abs(degrees)}° ${degrees>0?'по часовой':'против часовой'}`,[key],()=>app.selection?.rotate(degrees),true);
  add('ui.escape', 'Закрыть панели и отменить текущее действие', ['Escape'], () => { if(app.files?.processingFile){app.files.cancelProcessing();return;} if(app.imageText.cancel())return; app.input.cancelCurrent(); app.closePanels(); });
  add('ui.debug', 'Отладочная панель', ['F12'], () => app.toggleDebug());

  add('debug.generate', 'Отладка: добавить 10 000 штрихов', [], () => generateStrokes(app, 10000));
  add('debug.clear', 'Отладка: очистить холст', [], () => {
    const all = [...app.doc.values()];
    if (all.length) app.history.commit({ added: [], removed: all });
  });
  for(const [id,title,keys] of [
    ['newWindow','Новое окно',['Cmd+KeyT']],
    ['quit','Завершить Phaint',['Cmd+KeyQ']],['close','Закрыть окно',['Cmd+KeyW']],
    ['hide','Скрыть Phaint',['Cmd+KeyH']],['hideOthers','Скрыть остальные приложения',['Alt+Cmd+KeyH']],
    ['minimize','Свернуть окно',['Cmd+KeyM']],['zoom','Развернуть окно',[]],
    ['showAll','Показать все приложения',[]],['about','О программе Phaint',[]],
  ] as const)add(`app.${id}`,title,[...keys],()=>app.platform.appAction(id));
  for(const def of GESTURES)app.actions.register(def);
}
