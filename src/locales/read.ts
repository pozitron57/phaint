// Загрузчик для инструментов Node. В сборке esbuild встраивает результат без файлового ввода-вывода.
import { readdirSync, readFileSync } from 'node:fs';
import { validateCatalogs, type Catalogs } from './schema.ts';

export function readCatalogs(directory:URL):Catalogs {
  const catalogs:Catalogs=Object.fromEntries(readdirSync(directory)
    .filter(file=>file.endsWith('.json')).sort()
    .map(file=>[file.slice(0,-5),JSON.parse(readFileSync(new URL(file,directory),'utf8'))]));
  validateCatalogs(catalogs);
  return catalogs;
}
