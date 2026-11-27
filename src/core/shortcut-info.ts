// Категории и пояснения для редактора клавиш. Сам список команд — actions-list.ts.
import type { LabelKey } from './language.ts';
import type { ActionDef } from './actions.ts';
export const SHORTCUT_GROUPS={tools:'help.tools',drawing:'help.colorAndLine',selection:'help.selection',view:'help.canvas',files:'help.filesAndClipboard',ui:'help.interface',gestures:'help.gestureModifiers',app:'help.windowAndApp',debug:'help.debug'} as const;
export function shortcutInfo(id:string):{group:string;description?:LabelKey} {
  const prefix=id.split('.')[0];
  let group=({tool:'tools',style:'drawing',color:'drawing',width:'drawing',eraser:'drawing',selection:'selection',view:'view',file:'files',edit:'files',ui:'ui',app:'app',debug:'debug'} as Record<string,string>)[prefix]??'ui';
  if(prefix==='arrowHead')return {group:'drawing',description:'help.arrowHeadStep'};
  if(id==='edit.delete'||id==='edit.selectAll')group='selection';
  if(/^view\.(left|right|up|down)$/.test(id))return {group:'selection',description:'help.nudgeOrPan'};
  if(id.startsWith('selection.move'))return {group:'selection',description:'help.moveSelection'};
  const descriptions:Partial<Record<string,LabelKey>>={
    'tool.pen':'help.tool.pen', 'tool.select':'help.tool.select',
    'tool.space':'help.tool.space',
    'tool.ellipse':'help.tool.ellipse',
    'tool.hyperbola':'help.tool.hyperbola',
    'tool.adiabat':'help.tool.adiabat',
    'tool.coordinates':'help.tool.coordinates',
    'tool.line':'help.tool.line',
    'tool.arrow':'help.tool.arrow',
    'tool.arrowBoth':'help.tool.arrowBoth',
    'selection.flipArrowHead':'help.selection.flipArrowHead',
    'tool.parabola':'help.tool.parabola',
    'eraser.original':'help.eraser.original',
    'style.dash':'help.style.dash',
    'style.previous':'help.style.previous',
    'style.dots':'help.style.dots',
    'style.perTool':'help.style.perTool',
    'color.palette':'help.color.palette',
    'color.menu':'help.color.menu',
    'width.thinner':'help.width.thinner',
    'width.thicker':'help.width.thicker',
    'file.save':'help.file.save',
    'file.recent':'help.file.recent',
    'file.export':'help.file.export',
    'edit.copy':'help.edit.copy',
    'edit.copyImageText':'help.edit.copyImageText',
    'edit.paste':'help.edit.paste',
    'edit.pasteImage':'help.edit.pasteImage',
    'edit.pasteImageFree':'help.edit.pasteImageFree',
    'edit.cut':'help.edit.cut',
    'edit.selectAll':'help.edit.selectAll',
    'selection.order.front':'help.selection.order.front',
    'selection.order.back':'help.selection.order.back',
    'selection.order.forward':'help.selection.order.forward',
    'selection.order.backward':'help.selection.order.backward',
    'view.reset':'help.view.reset',
    'view.rotateCw':'help.view.rotateCw',
    'view.rotateCcw':'help.view.rotateCcw',
    'ui.escape':'help.ui.escape',
    'ui.shortcuts':'help.ui.shortcuts',
    'app.newWindow':'help.app.newWindow',
    'app.quit':'help.app.quit',
    'app.close':'help.app.close',
  };
  if(['style.solid','style.dashed','style.dotted'].includes(id))return {group,description:'help.changeLineStyle'};
  if(['color.blue','color.red','color.green'].includes(id))return {group,description:'help.changeColor'};
  return {group,description:descriptions[id]??(prefix==='tool'?'help.previousTool':prefix==='selection'?'help.rotateSelection':undefined)};
}
type Gesture=ActionDef & {title:LabelKey; description:LabelKey};
const gesture=(id:string,title:LabelKey,key:string,description:LabelKey,contexts:string[],kind:'modifier'|'hold'='modifier'):Gesture=>({id,title,keys:[key],description,contexts,kind,group:'gestures',run:()=>{}});
export const GESTURES:Gesture[]=[
  {...gesture('gesture.nudgeFine','action.gesture.nudgeFine','Alt','help.gesture.nudgeFine',['selection.keys']),group:'selection'},
  {...gesture('gesture.nudgeMedium','action.gesture.nudgeMedium','Ctrl','help.gesture.nudgeMedium',['selection.keys']),group:'selection'},
  {...gesture('gesture.nudgeFast','action.gesture.nudgeFast','Cmd','help.gesture.nudgeFast',['selection.keys']),keys:['Cmd','Shift'],group:'selection'},
  gesture('gesture.pan','action.gesture.pan','Space','help.gesture.pan',['*'],'hold'),
  gesture('gesture.zoom','action.gesture.zoom','Ctrl','help.gesture.zoom',['wheel']),
  gesture('gesture.select','action.gesture.select','Cmd','help.gesture.select',['pen','eraser','line','arrow','coordinates','marker','ellipse','sine','parabola','hyperbola','adiabat']),
  gesture('gesture.angle','action.gesture.angle','Shift','help.gesture.angle',['line','arrow','endpoint']),
  gesture('gesture.grid','action.gesture.grid','Alt','help.gesture.grid',['line','arrow','coordinates','ellipse','sine','parabola','hyperbola','adiabat','select.move','resize','endpoint']),
  gesture('gesture.bezier','action.gesture.bezier','Ctrl','help.gesture.bezier',['line','arrow','select.begin']),
  gesture('gesture.marker','action.gesture.marker','Shift','help.gesture.marker',['marker']),
  gesture('gesture.ellipse','action.gesture.ellipse','Shift','help.gesture.ellipse',['ellipse']),
  gesture('gesture.parabola','action.gesture.parabola','Shift','help.gesture.parabola',['parabola']),
  gesture('gesture.addSelection','action.gesture.addSelection','Cmd','help.gesture.addSelection',['select.begin']),
  gesture('gesture.resizeFree','action.gesture.resizeFree','Shift','help.gesture.resizeCenter',['resize']),
  gesture('gesture.resizeCenter','action.gesture.resizeCenter','Ctrl','help.gesture.resizeCenter',['resize']),
  gesture('gesture.rotate','action.gesture.rotate','Shift','help.gesture.rotate',['rotate']),
  gesture('gesture.pivotFree','action.gesture.pivotFree','Alt','help.gesture.pivotFree',['pivot']),
];
