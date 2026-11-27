// Данные переводчиков и подстановки проверяются без запуска Electron.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalogs } from '../src/locales/catalogs.ts';
import { readCatalogs } from '../src/locales/read.ts';
import { formatMessage, validateCatalogs } from '../src/locales/schema.ts';
import { currentLanguage, isLabelKey, isLanguage, languages, multilingual, preferredLanguage, setLanguage, t } from '../src/core/language.ts';

test('каталоги приложения, системный язык и подписи первого запуска',()=>{
  validateCatalogs(catalogs);
  assert.deepEqual(languages.map(item=>item.code).sort(),Object.keys(catalogs).sort());
  assert.equal(preferredLanguage('ru-RU'),'ru');
  assert.equal(preferredLanguage('en-US'),'en');
  assert.equal(isLanguage('__proto__'),false);
  for(const {code} of languages) {
    assert.ok(multilingual('startup.choose',' / ').includes(catalogs[code].messages['startup.choose']));
  }
  const native=readFileSync(new URL('../native/text_recognition.m',import.meta.url),'utf8');
  for(const [,key] of native.matchAll(/"(error\.\w+)"/g))assert.ok(isLabelKey(key),key);
});

test('ключи, пустые переводы, имена и синтаксис подстановок обязательны во всех языках',()=>{
  const key='file.saved', copy=structuredClone(catalogs);
  delete copy.en.messages[key];
  assert.throws(()=>validateCatalogs(copy),/en: file.saved: missing translation/);
  for(const value of ['','  ','Saved','Saved {file}','Saved {name} {date}','Saved {name','Saved {{name}}']) {
    copy.en.messages[key]=value;
    assert.throws(()=>validateCatalogs(copy),/en: file.saved/);
  }
  copy.en.messages[key]='{name} {name}';
  validateCatalogs(copy);
  copy.en.messages['wrong.key']='Extra';
  assert.throws(()=>validateCatalogs(copy),/en: wrong.key: unknown key/);
  const both=structuredClone(catalogs);
  for(const {messages} of Object.values(both))messages[key]='{renamed}';
  assert.throws(()=>validateCatalogs(both),/expected placeholders \[name\]/);
});

test('подстановки можно переставить и повторить, значения вставляются буквально один раз',()=>{
  assert.equal(formatMessage('{b} {a} {b}',{a:7,b:'$&{a}'},'test'),'$&{a} 7 $&{a}');
  const previous=currentLanguage();
  try {
    setLanguage('en');
    assert.equal(t('file.saved',{name:'{name}'}),'Saved: {name}');
    // @ts-expect-error — компилятор и вызовы из JS проверяют отсутствие параметра.
    assert.throws(()=>t('file.saved'),/missing value for name/);
    // @ts-expect-error — лишний параметр также отклоняется.
    assert.throws(()=>t('file.saved',{name:'a',date:4}),/unexpected value for date/);
  } finally {setLanguage(previous);}
});

test('новый язык обнаруживается по одному JSON-файлу',()=>{
  const dir=mkdtempSync(join(tmpdir(),'phaint-locales-'));
  try {
    for(const [code,catalog] of Object.entries(catalogs))writeFileSync(join(dir,code+'.json'),JSON.stringify(catalog));
    const added=structuredClone(catalogs.en);
    added.name='Français';added.messages['file.saved']='{name} enregistré';
    writeFileSync(join(dir,'fr.json'),JSON.stringify(added));
    assert.deepEqual(readCatalogs(pathToFileURL(dir+'/')).fr,added);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
