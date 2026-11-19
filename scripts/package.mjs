// Упаковка в обычное приложение macOS: release/Phaint-darwin-arm64/Phaint.app.
// Запуск: npm run package (сначала выполняется сборка dist/).
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// В приложение идут только package.json и собранный dist/ — исходники и node_modules там не нужны.
const keep = ['/package.json', '/dist'];
const skip = ['/dist/e2e'];
// Отдельная папка позволяет собрать обновление, пока прежняя версия открыта.
const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || 'release';

const [appDir] = await packager({
  dir: '.',
  name: 'Phaint',
  platform: 'darwin',
  arch: 'arm64',
  out,
  overwrite: true,
  appBundleId: 'local.phaint',
  appCategoryType: 'public.app-category.graphics-design',
  icon: existsSync('assets/icon.icns') ? 'assets/icon.icns' : undefined,
  prune: true,
  asar: { unpack: '**/*.node' },
  ignore: (path) =>
    path !== '' &&
    (!keep.some((k) => path === k || path.startsWith(k + '/')) || skip.some((k) => path === k || path.startsWith(k + '/'))),
});

// Локальная подпись «для себя»: без неё macOS на Apple Silicon не запускает изменённое приложение.
const app = `${appDir}/Phaint.app`;
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
console.log(`Готово: ${app}`);
