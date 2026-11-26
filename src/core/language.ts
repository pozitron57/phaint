// Язык общий для всех окон. В каждом процессе он меняется только после сохранения выбора.
export type Language = 'ru' | 'en';

export function isLanguage(value: unknown): value is Language {
  return value === 'ru' || value === 'en';
}

export let language: Language = 'ru';
export function setLanguage(value: Language): void { language = value; }
export function t(ru: string, en: string): string { return language === 'en' ? en : ru; }
