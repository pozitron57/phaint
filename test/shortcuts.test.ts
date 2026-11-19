// Нормализация, конфликты и сопоставление клавиш не зависят от DOM и раскладки.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Actions,comboLabel,heldCombo,normalizeCombo,validCombo,menuAccelerator} from '../src/core/actions.ts';
import {GESTURES} from '../src/core/shortcut-info.ts';
import {mergeSettings} from '../src/core/settings.ts';
const key=(code:string,mods={})=>({code,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,...mods});
test('клавиши: модификаторы, физические знаки, Num и безопасная загрузка назначений',()=>{
  assert.equal(normalizeCombo('Cmd+Alt+Shift'),'Alt+Shift+Cmd');assert.equal(comboLabel('Ctrl+Shift'),'⌃⇧');
  assert.equal(comboLabel('BracketLeft'),'[');assert.notEqual(comboLabel('Numpad0'),comboLabel('Digit0'));
  assert.equal(menuAccelerator('Shift+Cmd+KeyK'),'Shift+Cmd+K');assert.equal(menuAccelerator('Ctrl+ArrowRight'),'Ctrl+Right');
  assert.equal(validCombo('Ctrl'),false);assert.equal(validCombo('Ctrl','modifier'),true);assert.equal(validCombo('KeyQ','modifier'),false);
  assert.equal(validCombo('Space','hold'),true);assert.equal(validCombo('KeyQ+KeyW'),false);assert.equal(validCombo('Cmd+garbage'),false);
  const settings=mergeSettings({keys:{'gesture.angle':['Shift+Ctrl'],'tool.line':[],'width.thinner':['KeyJ'],'bad':['unexpected']}});
  assert.deepEqual(settings.keys,{'gesture.angle':['Ctrl+Shift'],'tool.line':[],'width.thinner':['KeyJ']});
});
test('клавиши: конфликт команд и панорамирования; одинаковые модификаторы в разных инструментах разрешены',()=>{
  const a=new Actions();for(const d of GESTURES)a.register(d);
  a.register({id:'test',title:'Тест',keys:['KeyL'],run:()=>{}});
  a.register({id:'other',title:'Другой',keys:['KeyQ'],run:()=>{}});
  assert.deepEqual(a.conflicts('other','KeyL').map(d=>d.id),['test']);
  assert.deepEqual(a.conflicts('other','Space').map(d=>d.id),['gesture.pan']);
  assert.deepEqual(a.conflicts('gesture.angle','Shift'),[]);
  assert.ok(a.conflicts('gesture.grid','Shift').some(d=>d.id==='gesture.angle'));
  assert.deepEqual(a.conflicts('other','KeyL',{test:[]}),[]);
  assert.equal(a.handle(key('Space')),false,'удержание не запускается как команда');
});
test('клавиши: новые назначения толщины и цвета работают с модификаторами геометрии',()=>{
  const a=new Actions(),log:string[]=[];
  for(const [id,keys] of [['width',['KeyJ']],['next',['KeyT']],['previous',['Shift+KeyT']]] as const)a.register({id,title:id,keys:[...keys],run:()=>log.push(id)});
  assert.ok(a.handle(key('KeyJ',{ctrlKey:true}),()=>true,true));
  assert.ok(a.handle(key('KeyT',{ctrlKey:true,shiftKey:true}),()=>true,true));
  assert.deepEqual(log,['width','previous']);
  a.setOverrides({width:[]});assert.equal(a.handle(key('KeyJ',{ctrlKey:true}),()=>true,true),false);
  assert.equal(heldCombo('Ctrl+Shift',key('',{ctrlKey:true,shiftKey:true,altKey:true})),true);
  assert.equal(heldCombo('Ctrl+Shift',key('',{ctrlKey:true})),false);
  assert.equal(heldCombo('Backquote',key(''),new Set(['Space'])),false);
  assert.equal(heldCombo('Backquote',key(''),new Set(['Backquote'])),true);
});
test('новая схема не перекрывает пользовательские клавиши стандартными',()=>{
  const a=new Actions();for(const d of GESTURES)a.register(d);
  const saved={'gesture.ellipse':['Cmd']},result=a.preserveCustomBindings(saved);
  assert.deepEqual(result['gesture.ellipse'],['Cmd']);assert.deepEqual(result['gesture.select'],[]);
  assert.deepEqual(saved,{'gesture.ellipse':['Cmd']});
  for(const def of GESTURES)for(const key of def.keys)assert.deepEqual(a.conflicts(def.id,key),[],def.id);
});
