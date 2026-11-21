// Убирает номер задачи в начале текста, распознанного с картинки для Ctrl+C.
const taskLabel = /^(?:задача|задание|номер)(?=\s*(?:[№#\d(.:]|N[oº°]|\n|$))\s*[.:]?\s*/iu;
const numberSign = /^(?:[№#]|N[º°]|No(?=[.:]|\s*(?:\d|\n|$)))[.:]?\s*/iu;
const taskNumber = /^(?:\[\d+\]|\(?\d+(?:\.\d+)*[.):]?)/u;

export function stripProblemHeader(recognized: string): string {
  const text = recognized.trim();
  const afterLabel = text.replace(taskLabel, '').replace(numberSign, '');
  const number = afterLabel.match(taskNumber)?.[0] ?? '';
  const rest = afterLabel.slice(number.length);

  if (afterLabel === text) {
    if (!number) return text;
    // «12 Найдите…» — номер; «12 кг песка…» и «1.5 м…» — начало условия.
    if (/^\d+(?:\.\d+)?$/.test(number) && !/^(?:$|\s*(?:\n|\[)|\s+\p{Lu})/u.test(rest)) return text;
  }
  return rest.trimStart()
    .replace(/^\[[^\]]*\][.:]?\s*/u, '')
    .replace(/^(?:[←→](?=[←→\s]|$)\s*)+/u, '');
}
