// Точка входа рендерера: читает настройки и запускает приложение.
import { App } from './app.ts';
import { mergeSettings } from './core/settings.ts';
import { installDebug } from './debug.ts';
import { getPlatform } from './platform.ts';

async function start(): Promise<void> {
  const platform = getPlatform();
  const saved = await platform.loadSettings().catch(() => null);
  const app = new App(platform, mergeSettings(saved));
  await app.files.ready;
  installDebug(app);
}

void start();
