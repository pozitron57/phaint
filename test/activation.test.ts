// Порядок событий macOS не должен превращать возврат в приложение в новый холст.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WindowActivation} from '../electron/activation.ts';

test('окна: первый запуск и возврат до did-become-active не создают лишний холст',()=>{
  const state=new WindowActivation();
  assert.equal(state.opensNewWindow(false,0),false);
  state.becameActive(10);
  assert.equal(state.opensNewWindow(true,20),true,'следующий клик сразу открывает новое окно');
  state.resignedActive();
  assert.equal(state.opensNewWindow(true,1000),false,'фокус мог вернуться раньше уведомления приложения');
  state.becameActive(1010);
  assert.equal(state.opensNewWindow(true,1020),true);
});

test('окна: возврат после did-become-active только показывает рисунок',()=>{
  const state=new WindowActivation();
  state.becameActive(1000);
  assert.equal(state.opensNewWindow(true,1010),false);
  assert.equal(state.opensNewWindow(true,1020),true,'второй клик не ждёт окончания защитного интервала');
});

test('окна: Cmd+Tab сам ничего не открывает и не блокирует следующий обычный клик Dock',()=>{
  const state=new WindowActivation();
  state.becameActive(0);
  state.resignedActive();
  state.becameActive(1000);
  assert.equal(state.opensNewWindow(true,2000),true);
});

test('окна: без активного видимого холста нужно восстановить существующее окно',()=>{
  const state=new WindowActivation();
  state.becameActive(0);
  assert.equal(state.opensNewWindow(false,1000),false,'свёрнутый холст');
  assert.equal(state.opensNewWindow(false,1100),false,'служебное окно не считается холстом');
  state.resignedActive();
  state.becameActive(2000);
  assert.equal(state.opensNewWindow(true,2010),false,'скрытое приложение уже развёрнуто macOS');
});
