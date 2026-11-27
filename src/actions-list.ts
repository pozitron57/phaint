// Список действий приложения и хоткеи по умолчанию. Новое действие добавляется сюда —
// и сразу доступно клавишей, кнопкой и в редакторе сочетаний.
import { t } from './core/language.ts';
import type { App } from './app.ts';
import { generateStrokes } from './debug.ts';
import { GESTURES, shortcutInfo } from './core/shortcut-info.ts';
import type { KeyLike } from './core/actions.ts';
import { QUICK_COLORS } from './core/settings.ts';

export function registerActions(app: App): void {
  const add = (id: string, title: string, keys: string[], run: (key?:KeyLike) => void, repeat = false): void => {
    const {group,description}=shortcutInfo(id);
    app.actions.register({ id, title, keys, repeat,group,description:description?t(description):'',run:key=>{
      if(!id.startsWith('arrowHead.'))app.recentArrow=undefined;
      run(key);
    } });
  };

  add('tool.pen', t('action.tool.pen'), ['KeyD', 'Cmd+Shift+KeyD'], () => app.selectTool('pen'));
  add('tool.line', t('action.tool.line'), ['KeyL'], () => {
    if(!app.selection?.setLineHeads('line'))app.selectTool('line');
  });
  add('tool.eraser', t('action.tool.eraser'), ['Cmd+Shift+KeyE'], () => app.selectTool('eraser'));
  add('tool.arrow',t('action.tool.arrow'),['KeyA'],()=>{
    if(!app.selection?.setLineHeads('next'))app.selectArrow(false);
  });
  add('tool.arrowBoth',t('action.tool.arrowBoth'),['Shift+KeyA'],()=>{
    if(!app.selection?.setLineHeads('previous'))app.selectArrow(true);
  });
  add('selection.flipArrowHead',t('action.selection.flipArrowHead'),['Ctrl+KeyA'],()=>app.selection?.setLineHeads('reverse'));
  add('tool.coordinates',t('action.tool.coordinates'),['KeyC'],()=>app.selectTool('coordinates'));
  add('tool.marker',t('action.tool.marker'),['Digit4'],()=>app.selectTool('marker'));
  add('tool.ellipse',t('action.tool.ellipse'),['KeyO'],()=>app.selectTool('ellipse'));
  add('tool.sine',t('action.tool.sine'),['KeyS'],()=>app.selectTool('sine'));
  add('tool.parabola',t('action.tool.parabola'),['KeyP'],()=>app.selectTool('parabola'));
  add('tool.hyperbola',t('action.tool.hyperbola'),['KeyH'],()=>app.selectTool('hyperbola'));
  add('tool.adiabat',t('action.tool.adiabat'),['Shift+KeyH'],()=>app.selectTool('adiabat'));
  add('style.solid',t('action.style.solid'),['Digit1'],()=>app.setLinePattern('solid'));
  add('style.dashed',t('action.style.dashed'),['Digit2'],()=>app.setLinePattern('dash'));
  add('style.dotted',t('action.style.dotted'),['Digit3'],()=>app.setLinePattern('dots'));
  add('style.dash',t('action.style.dash'),[],()=>app.cycleLinePattern());
  add('style.previous',t('action.style.previous'),['Shift+Digit2'],()=>app.cycleLinePattern(-1));
  add('style.dots',t('action.style.dots'),['Digit5'],()=>app.toggleDash('dots'));
  add('style.perTool',t('action.style.perTool'),['F5'],()=>app.setStylePerTool(!app.settings.stylePerTool));
  add('tool.select', t('action.tool.select'), ['KeyX'], () => app.selectTool('select'));
  add('tool.space',t('action.tool.space'),['Cmd+Shift+KeyV'],()=>app.selectTool('space'));
  add('edit.pasteImage', t('action.edit.pasteImage'), ['KeyV'], () => {void app.pasteImage();});
  add('edit.pasteImageFree', t('action.edit.pasteImageFree'), ['Alt+KeyV'], () => {void app.pasteImage('free');});
  add('edit.copy',t('action.edit.copy'),['Cmd+KeyC'],()=>{void app.clipboard.copy();});
  add('edit.copyImageText',t('action.edit.copyImageText'),['Ctrl+KeyC'],()=>{void app.imageText.copy();});
  add('edit.cut',t('action.edit.cut'),['Cmd+KeyX'],()=>{void app.clipboard.copy(true);});
  add('edit.paste',t('action.edit.paste'),['Cmd+KeyV'],()=>{void app.clipboard.paste();});
  add('edit.delete', t('action.edit.delete'), ['Backspace','Delete'], () => app.deleteSelection());
  add('edit.selectAll', t('action.edit.selectAll'), ['Cmd+KeyA'], () => app.selectAll());
  add('selection.order.front',t('action.selection.order.front'),['Ctrl+KeyF'],()=>app.selection?.reorder('front'));
  add('selection.order.back',t('action.selection.order.back'),['Ctrl+KeyB'],()=>app.selection?.reorder('back'));
  add('selection.order.forward',t('action.selection.order.forward'),['Ctrl+Shift+KeyF'],()=>app.selection?.reorder('forward'));
  add('selection.order.backward',t('action.selection.order.backward'),['Ctrl+Shift+KeyB'],()=>app.selection?.reorder('backward'));
  add('eraser.original', t('action.eraser.original'), [], () => app.toggleOriginalEraser());
  add('color.menu',t('action.color.menu'),['Shift+Tab'],()=>app.palette.toggle());
  add('color.blue',t('action.color.blue'),['KeyQ'],()=>app.palette.pick(QUICK_COLORS.blue));
  add('color.green',t('action.color.green'),['KeyW'],()=>app.palette.pick(QUICK_COLORS.green));
  add('color.red',t('action.color.red'),['KeyE'],()=>app.palette.pick(QUICK_COLORS.red));
  add('color.palette', t('action.color.palette'), ['Tab'], () => app.palette.advance());

  add('view.grid', t('action.view.grid'), ['KeyG'], () => {
    app.settings.grid.enabled=!app.settings.grid.enabled;
    app.settingsChanged(); app.files.changed();
    app.panels.background.sync(); app.renderer.invalidateScene();
  });

  add('file.new', t('action.file.new'), ['Cmd+KeyN'], () => { void app.files.newDocument(); });
  add('file.open', t('action.file.open'), ['Cmd+KeyO'], () => { void app.files.open(); });
  add('file.recent',t('action.file.recent'),['Cmd+KeyR'],()=>{void app.files.open(true);});
  add('file.save', t('action.file.save'), ['Cmd+KeyS'], () => { void app.files.save(); });
  add('file.saveAs', t('action.file.saveAs'), ['Cmd+Shift+KeyS'], () => { void app.files.save(true); });
  add('file.export',t('action.file.export'),['Cmd+KeyE'],()=>{void app.files.export();});

  add('edit.undo', t('action.edit.undo'), ['KeyZ', 'Cmd+KeyZ'], () => app.undo(), true);
  add('edit.redo', t('action.edit.redo'), ['KeyY', 'Cmd+Shift+KeyZ'], () => app.redo(), true);

  add('width.thinner', t('action.width.thinner'), ['F1'], () => app.changeWidth(-1), true);
  add('width.thicker', t('action.width.thicker'), ['F2'], () => app.changeWidth(1), true);

  add('arrowHead.narrower',t('action.arrowHead.narrower'),['Shift+F1'],()=>app.stepArrowHead('headWidth',-1),true);
  add('arrowHead.wider',t('action.arrowHead.wider'),['Shift+F2'],()=>app.stepArrowHead('headWidth',1),true);
  add('arrowHead.shorter',t('action.arrowHead.shorter'),['Ctrl+F1','Ctrl+Comma'],()=>app.stepArrowHead('headLength',-1),true);
  add('arrowHead.longer',t('action.arrowHead.longer'),['Ctrl+F2','Ctrl+Period'],()=>app.stepArrowHead('headLength',1),true);

  add('view.zoomIn', t('action.view.zoomIn'), ['Equal','Shift+Equal','Ctrl+Equal', 'Ctrl+Shift+Equal', 'Ctrl+NumpadAdd'], () => app.zoomStep(1), true);
  add('view.zoomOut', t('action.view.zoomOut'), ['Minus','Ctrl+Minus', 'Ctrl+Shift+Minus', 'Ctrl+NumpadSubtract'], () => app.zoomStep(-1), true);
  add('view.reset', t('action.view.reset'), ['Digit0','Numpad0','Cmd+Digit0'], () => app.resetView());
  add('view.rotateCw', t('action.view.rotateCw'), ['Cmd+ArrowRight'], () => app.rotate(1), true);
  add('view.rotateCcw', t('action.view.rotateCcw'), ['Cmd+ArrowLeft'], () => app.rotate(-1), true);
  add('view.left', t('action.view.left'), ['ArrowLeft'], key => app.scroll(1, 0,key), true);
  add('view.right', t('action.view.right'), ['ArrowRight'], key => app.scroll(-1, 0,key), true);
  add('view.up', t('action.view.up'), ['ArrowUp'], key => app.scroll(0, 1,key), true);
  add('view.down', t('action.view.down'), ['ArrowDown'], key => app.scroll(0, -1,key), true);
  for(const [direction,title,dx,dy] of [['Left','action.left',-1,0],['Right','action.right',1,0],['Up','action.up',0,-1],['Down','action.down',0,1]] as const)
    add(`selection.move${direction}`,t('action.moveSelection', {direction:t(title)}),[],key=>app.moveSelection(dx,dy,key,true),true);
  add('view.fullscreen', t('action.view.fullscreen'), ['F11'], () => app.platform.toggleFullscreen());

  add('ui.toolbar', t('action.ui.toolbar'), ['KeyN','Shift+KeyB'], () => app.toggleToolbar());
  add('ui.brush', t('action.ui.brush'), ['KeyB'], () => app.togglePanel('brush'));
  add('ui.background', t('action.ui.background'), ['Shift+KeyG'], () => app.togglePanel('background'));
  add('ui.shortcuts',t('action.ui.shortcuts'),['Cmd+Comma'],()=>app.shortcuts.show());
  for(const [key,degrees] of [['BracketLeft',-90],['BracketRight',90],['Comma',-15],['Period',15],['Shift+Comma',-1],['Shift+Period',1]] as const) add(`selection.rotate.${key}`,t(degrees > 0 ? 'action.rotateClockwise' : 'action.rotateCounterclockwise', {degrees:Math.abs(degrees)}),[key],()=>app.selection?.rotate(degrees),true);
  add('ui.escape', t('action.ui.escape'), ['Escape'], () => { if(app.files?.processingFile){app.files.cancelProcessing();return;} if(app.imageText.cancel())return; app.input.cancelCurrent(); app.closePanels(); });
  add('ui.debug', t('action.ui.debug'), ['F12'], () => app.toggleDebug());

  add('debug.generate', t('action.debug.generate'), [], () => generateStrokes(app, 10000));
  add('debug.clear', t('action.debug.clear'), [], () => {
    const all = [...app.doc.values()];
    if (all.length) app.history.commit({ added: [], removed: all });
  });
  for(const [id,title,keys] of [
    ['newWindow','menu.newWindow',['Cmd+KeyT']],
    ['quit','menu.quitPhaint',['Cmd+KeyQ']],['close','menu.closeWindow',['Cmd+KeyW']],
    ['hide','menu.hidePhaint',['Cmd+KeyH']],['hideOthers','action.hideOtherApplications',['Alt+Cmd+KeyH']],
    ['minimize','action.minimizeWindow',['Cmd+KeyM']],['zoom','action.zoomWindow',[]],
    ['showAll','action.showAllApplications',[]],['about','menu.aboutPhaint',[]],
  ] as const)add(`app.${id}`,t(title),[...keys],()=>app.platform.appAction(id));
  for(const def of GESTURES)app.actions.register({...def,title:t(def.title),description:t(def.description)});
}
