// Точка входа рендерера: читает настройки и запускает приложение.
import { setLanguage, type Language } from './core/language.ts';
import { chooseBrowserLanguage } from './files/browser.ts';
import { App } from './app.ts';
import { mergeSettings } from './core/settings.ts';
import { installDebug } from './debug.ts';
import { getPlatform } from './platform.ts';

async function start(): Promise<void> {
  const platform = getPlatform();
  let app:App|undefined, latest:Language|undefined;
  platform.onLanguage(value => { latest=value;app?.changeLanguage(value); });
  const settings=mergeSettings(await platform.loadSettings().catch(() => null));
  if (!settings.language && !platform.native) {
    latest=settings.language=await chooseBrowserLanguage();
    await platform.saveSettings(settings,settings.language);
  }
  settings.language=latest ?? settings.language ?? 'ru';
  setLanguage(settings.language);document.documentElement.lang=settings.language;
  app = new App(platform, settings);
  await app.files.ready;
  installDebug(app);
}

void start();
