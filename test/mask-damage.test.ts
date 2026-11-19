// Региональная перерисовка масок: точная область, отмена, старый формат и безопасный отказ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskDamage } from '../src/core/mask-damage.ts';
import { makeSvg } from '../src/core/types.ts';
const source=makeSvg(1,1,100,200,1000,1000,'<svg/>');
test('маска: новая область и её отмена одинаковы, остальная рамка не затронута',()=>{
 const next={...source,erasures:[[300,400,320,430,12,1,0,0,1,-100,-200]]};
 const box={minX:288,minY:388,maxX:332,maxY:442};
 assert.deepEqual(maskDamage([next],[source]),box);
 assert.deepEqual(maskDamage([source],[next]),box);
 const more={...next,erasures:[...next.erasures,[500,600,500,600,5,1,0,0,1,-100,-200]]};
 assert.deepEqual(maskDamage([more],[next]),{minX:495,minY:595,maxX:505,maxY:605});
});
test('маска: преобразование старых следов в мировые координаты',()=>{
 const old={...source,matrix:{a:0,b:2,c:-3,d:0,e:0,f:0}},next={...old,erasures:[[10,20,30,40,5]]};
 assert.deepEqual(maskDamage([next],[old]),{minX:-35,minY:210,maxX:55,maxY:270});
});
test('маска: правка геометрии или оформление требуют полной перерисовки',()=>{
 const next={...source,erasures:[[0,0,10,0,4]]};
 assert.equal(maskDamage([{...next,ox:200}],[source]),undefined);
 assert.equal(maskDamage([{...next,source:'<svg><path/></svg>'}],[source]),undefined);
 assert.equal(maskDamage([next],[]),undefined);
 assert.equal(maskDamage([], [source]),undefined);
});
