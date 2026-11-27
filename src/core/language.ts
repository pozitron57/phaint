// Единый список языков для Electron, браузера, настроек и первого запуска.
import { catalogs } from '../locales/catalogs.ts';
import { formatMessage, type Values } from '../locales/schema.ts';
import { parameters } from '../locales/parameters.ts';
import type reference from '../locales/ru.json';

export type MessageKey = keyof typeof reference.messages;
type ParameterKey = keyof typeof parameters;
export type LabelKey = Exclude<MessageKey,ParameterKey>;
export type Language = string;
export const languages = ['ru',...Object.keys(catalogs).filter(code=>code!=='ru').sort()]
  .map(code=>({code,name:catalogs[code].name}));
export function isLanguage(value:unknown):value is Language {
  return typeof value==='string' && Object.hasOwn(catalogs,value);
}

// Отложенные модули PDF/SVG — отдельные бандлы в том же окне или Worker.
const slot=Symbol.for('phaint.language');
const context=globalThis as typeof globalThis & {[slot]?:Language};
export function currentLanguage():Language { return context[slot]??'ru'; }

export function setLanguage(code:Language):void {
  if (!isLanguage(code)) throw new Error('Unknown locale ' + code);
  context[slot]=code;
}

export function isLabelKey(key:string):key is LabelKey {
  return Object.hasOwn(catalogs.ru.messages,key) && !Object.hasOwn(parameters,key);
}

export function t(key:LabelKey):string;
export function t<K extends ParameterKey>(key:K, values:Record<(typeof parameters)[K][number],string|number>):string;
export function t(key:MessageKey, values?:Values):string {
  const language=currentLanguage();
  const message=catalogs[language].messages[key];
  if (message===undefined) throw new Error(language + ': unknown message ' + key);
  return values || message.includes('{') ? formatMessage(message,values??{},key) : message;
}

export function multilingual(key:LabelKey, separator:string):string {
  return languages.map(({code})=>catalogs[code].messages[key]).join(separator);
}

export function preferredLanguage(locale:string):Language {
  let candidate=locale.toLowerCase();
  while(candidate) {
    const match=languages.find(({code})=>code.toLowerCase()===candidate);
    if(match)return match.code;
    const end=candidate.lastIndexOf('-');
    if(end<0)break;
    candidate=candidate.slice(0,end);
  }
  return 'en';
}
