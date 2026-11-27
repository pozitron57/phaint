// В Node читаем исходные JSON. Сборка подставляет сюда те же проверенные каталоги.
import { readCatalogs } from './read.ts';
export const catalogs=readCatalogs(new URL('./',import.meta.url));
