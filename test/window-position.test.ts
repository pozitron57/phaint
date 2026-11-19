// Каскад окон остаётся в рабочей области, включая мониторы слева от основного.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cascadeBounds} from '../electron/window-position.ts';

test('окна: новое окно сдвигается на 24 пункта от выбранного окна',()=>{
  assert.deepEqual(cascadeBounds({x:100,y:80,width:800,height:600},{x:0,y:25,width:1440,height:850},800,600),
    {x:124,y:104,width:800,height:600});
});
test('окна: каскад у края начинается заново и помещается на другом мониторе',()=>{
  const area={x:-1440,y:25,width:1440,height:850};
  assert.deepEqual(cascadeBounds({x:-800,y:275,width:800,height:600},area,800,600),
    {x:-1440,y:25,width:800,height:600});
  assert.deepEqual(cascadeBounds({x:100,y:80,width:1800,height:1200},area,1800,1200),
    {...area});
});
