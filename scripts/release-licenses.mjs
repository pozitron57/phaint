// Лицензии распространяемых библиотек остаются в .app после копирования с DMG.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function copyLicenses(appDir, app, version) {
  const dest = join(app, 'Contents', 'Resources', 'Licenses');
  mkdirSync(dest, { recursive: true });
  copyFileSync('LICENSE', join(dest, 'Phaint.txt'));
  copyFileSync(join(appDir, 'LICENSE'), join(dest, 'Electron.txt'));
  copyFileSync(join(appDir, 'LICENSES.chromium.html'), join(dest, 'Chromium.html'));
  const { packages } = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const notices = [];
  for (const [dir, pkg] of Object.entries(packages)) {
    if (!dir || pkg.dev || pkg.optional) continue;
    const { name } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const files = readdirSync(dir).filter(file => /^(licen[cs]e|copy(right|ing)|notice)/i.test(file)).sort();
    const texts = files.length
      ? files.map(file => readFileSync(join(dir, file), 'utf8'))
      : [readFileSync(`assets/licenses/${name}.txt`, 'utf8')];
    notices.push([`${name} ${pkg.version}`, ...texts].join('\n\n'));
  }
  writeFileSync(join(dest, 'Libraries.txt'), notices.join('\n\n------------\n\n'));
  const source = `https://github.com/pozitron57/phaint/tree/v${version}`;
  const mupdf = packages['node_modules/mupdf'].version;
  writeFileSync(join(dest, 'Source.txt'), `Phaint ${version}\nSource and build instructions / Исходный код и сборка\n${source}\n\nMuPDF ${mupdf} (including its submodules / включая подмодули)\ngit clone --recurse-submodules --branch ${mupdf} https://github.com/ArtifexSoftware/mupdf.git\n`);
}
