// npm run package собирает приложение для текущего Mac, npm run dmg — универсальный образ.
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { copyLicenses } from './release-licenses.mjs';

// В приложение идут только package.json и собранный dist/ — исходники и node_modules там не нужны.
const keep = ['/package.json', '/dist'];
const skip = ['/dist/e2e'];
// Отдельная папка позволяет собрать обновление, пока прежняя версия открыта.
const dmg = process.argv.includes('--dmg');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || (dmg ? join('release', version) : 'release');
if (dmg) execFileSync('lipo', ['dist/phaint_native.node', '-verify_arch', 'arm64', 'x86_64']);

const [appDir] = await packager({
  dir: '.',
  name: 'Phaint',
  platform: 'darwin',
  arch: dmg ? 'universal' : process.arch,
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
copyLicenses(appDir, app, version);
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
console.log(`Готово: ${app}`);

if (dmg) {
  const staging = mkdtempSync(join(resolve(out), '.dmg-'));
  const image = join(staging, 'Phaint.dmg');
  const volume = join(staging, 'volume');
  const destination = join(out, `Phaint-${version}-macOS-universal.dmg`);
  try {
    mkdirSync(volume);
    execFileSync('ditto', [app, join(volume, 'Phaint.app')]);
    symlinkSync('/Applications', join(volume, 'Applications'));
    execFileSync('hdiutil', ['create', '-fs', 'HFS+', '-volname', 'Phaint', '-format', 'UDZO', '-srcfolder', volume, image], { stdio: 'inherit' });
    execFileSync('hdiutil', ['verify', image], { stdio: 'inherit' });
    renameSync(image, destination);
    console.log(`Готово: ${destination}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
