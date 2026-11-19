// Значок приложения: assets/icon.svg → assets/icon.icns. Запуск: npm run icon.
// Рисует SVG через Electron, размеры делает sips, собирает iconutil (обе утилиты входят в macOS).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const electron = createRequire(import.meta.url)('electron');
const big = 'assets/icon-1024.png';
const set = 'assets/icon.iconset';

execFileSync(electron, ['scripts/icon-main.cjs', big], { stdio: 'inherit' });
rmSync(set, { recursive: true, force: true });
mkdirSync(set, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const px = String(size * scale);
    const name = `${set}/icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`;
    execFileSync('sips', ['-z', px, px, big, '--out', name], { stdio: 'ignore' });
  }
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', 'assets/icon.icns'], { stdio: 'inherit' });
rmSync(set, { recursive: true, force: true });
rmSync(big, { force: true });
console.log('Готово: assets/icon.icns');
