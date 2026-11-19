// Чужой/минифицированный SVG: распознаём только жёсткое стирание, сохраняя сложные маски.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorizeEraserMasks} from '../src/files/svg-eraser.ts';
const source='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><mask id="a" x="0" y="0" width="100" height="100" maskUnits="userSpaceOnUse" style="mask-type:luminance"><path fill="#fff" d="M0 0H100v100H0z"/><path fill="none" stroke="#000" stroke-linecap="round" stroke-width="12" d="M10 10h0m0 0 40 50m0 0 10-20"/></mask></defs><g transform="translate(5 4) scale(.9)" mask="url(#a)"><path fill="blue" d="M0 0H100V100H0Z"/></g></svg>';
test('маска после SVGO: относительные moveto, нулевой отрезок, h/v и матрицы',()=>{
  for(const text of [source,source.replace('d="M10 10h0','transform="matrix(-1 .2 .1 1 80 0)" d="M10 10h0')]){
    const result=vectorizeEraserMasks(text);assert.doesNotMatch(result,/<mask\b| mask=/);assert.match(result,/<clipPath\b/);assert.match(result,/clip-path="url\(#a\)"/);
    assert.ok(result.includes('d="M0 0H100V100H0Z"'),'видимый путь вообще не упрощается');
  }
});
test('полутона, CSS, альфа-маски и неизвестная геометрия остаются без изменений',()=>{
  for(const text of [source.replace('stroke="#000"','stroke="#888"'),source.replace('stroke="#000"','stroke="#000" opacity=".5"'),source.replace('luminance','alpha'),source.replace('h0m0 0 40 50','Q30 30 50 60'),source.replace('<defs>','<style>path{opacity:.5}</style><defs>'),source.replace('mask="url(#a)"','clip-path="url(#other)" mask="url(#a)"'),source.replace('mask="url(#a)"','style="mask:url(#a)"'),source.replace('maskUnits="userSpaceOnUse"','maskUnits="objectBoundingBox"'),source.replace('stroke-width="12"','stroke-width="12" stroke-dasharray="1 2"')])assert.equal(vectorizeEraserMasks(text),text);
});
test('много связных отрезков допускается только с круглыми соединениями',()=>{
  const text=source.replace('M10 10h0m0 0 40 50m0 0 10-20','M10 10L50 60 60 40');assert.equal(vectorizeEraserMasks(text),text);
  assert.match(vectorizeEraserMasks(text.replace('stroke-linecap="round"','stroke-linecap="round" stroke-linejoin="round"')),/<clipPath\b/);
});
test('унаследованная обводка белого фона не теряется при попытке преобразования',()=>{
  for(const attr of ['stroke="black"','opacity=".5"','style="stroke:red"']){
    const text=source.replace('<defs>',`<g ${attr}><defs>`).replace('</defs>','</defs></g>');assert.equal(vectorizeEraserMasks(text),text);
  }
});
