// Один и тот же контракт проверяется при сборке, в тестах и при чтении каталогов из Node.
import { parameters } from './parameters.ts';

export interface Catalog { name:string; messages:Record<string,string> }
export type Catalogs = Record<string,Catalog>;
const token = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
export type Values = Record<string,string|number>;

function placeholders(message:string, location:string):string[] {
  if (/[{}]/.test(message.replace(token,''))) throw new Error(location + ': malformed placeholder');
  return [...new Set(Array.from(message.matchAll(token), match => match[1]))].sort();
}

export function validateCatalogs(catalogs:Catalogs):void {
  const base=catalogs.ru?.messages;
  if (!base || !Object.keys(base).length) throw new Error('Missing reference catalog ru');
  if (!catalogs.en) throw new Error('Missing English catalog en');
  const contract:Record<string,readonly string[]>=parameters;
  for (const key of Object.keys(contract)) {
    if (!Object.hasOwn(base,key)) throw new Error('ru: missing parameterized message ' + key);
  }
  for (const [code,catalog] of Object.entries(catalogs)) {
    if (Intl.getCanonicalLocales(code)[0] !== code || typeof catalog?.name !== 'string' || !catalog.name.trim())
      throw new Error(code + ': invalid locale code or name');
    if (!catalog.messages || typeof catalog.messages !== 'object' || Array.isArray(catalog.messages))
      throw new Error(code + ': expected a messages object');
    for (const key of new Set([...Object.keys(base), ...Object.keys(catalog.messages)])) {
      const location=code + ': ' + key;
      if (!Object.hasOwn(base,key)) throw new Error(location + ': unknown key');
      const value=catalog.messages[key];
      if (!Object.hasOwn(catalog.messages,key) || typeof value !== 'string' || !value.trim())
        throw new Error(location + ': missing translation');
      const expected=[...(contract[key]??[])].sort(), actual=placeholders(value,location);
      if (actual.join() !== expected.join())
        throw new Error(location + ': expected placeholders [' + expected + '], got [' + actual + ']');
    }
  }
}

export function formatMessage(message:string, values:Values, key:string):string {
  const used=new Set<string>();
  const result=message.replace(token, (_,name:string) => {
    if (!Object.hasOwn(values,name)) throw new Error(key + ': missing value for ' + name);
    used.add(name);
    return String(values[name]);
  });
  for (const name of Object.keys(values)) if (!used.has(name)) throw new Error(key + ': unexpected value for ' + name);
  return result;
}
