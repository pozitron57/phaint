// Текст в буфере после распознавания картинок из задачников и с сайтов.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripProblemHeader } from '../electron/problem-text.ts';

test('Ctrl+C убирает только начальный номер задачи', () => {
  const body = 'Найдите путь.\n2) Сравните с № 7.';
  for (const header of [
    '№ 17. ', '№ ', '#17 ', '#\n', 'No. 17 ', 'Задача №17: ', 'Задание 17) ', 'Номер 17\n',
    '17. ', '17)', '(17) ', '17 ', '17\n', '10.3.5 ', '10.3.5. [Механика, § 2] ',
    '10.3.5[любое уточнение]\n', '10.3.5\n[первый\nуровень]\n',
    'Задача #1869\n←\n→\n', 'Задача #1869 ← → ', 'ЗАДАЧА №\u00a0\n',
  ]) {
    assert.equal(stripProblemHeader(' \n' + header + body), body, header);
  }
  assert.equal(stripProblemHeader('№12. 20 кг песка'), '20 кг песка');
  assert.equal(stripProblemHeader('Задача #1869\n←\n→'), '');
});

test('Ctrl+C сохраняет числа, скобки, стрелки и переводы строк самого условия', () => {
  for (const body of [
    'Тело № 17 движется.\n10.3.5 [см. таблицу]\n←\n→',
    '20 кг песка насыпали в ящик.', '2.5 м провода', '1,5 часа', 'Задача состоит из двух частей.',
    '[Рис. 1] Найдите силу.', '←\n→\nНаправления сил', 'No friction acts.',
  ]) {
    assert.equal(stripProblemHeader(body), body);
  }
});
