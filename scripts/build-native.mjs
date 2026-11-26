// Сборка нативного модуля native/phaint_native.m → native/build/phaint_native.node (clang из Command Line Tools).
// Вызывается из build.mjs; пересобирает, только если исходник новее. Если заголовков Node нет,
// модуль пропускается: приложение работает и без него, но с обычным полноэкранным режимом и склейкой событий пера.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SOURCES = ['native/phaint_native.m','native/text_recognition.m'];
const OUT = 'native/build/phaint_native.node';

function includeDir() {
  const candidates = [
    join(dirname(realpathSync(process.execPath)), '..', 'include', 'node'),
    '/opt/homebrew/include/node',
    '/usr/local/include/node',
  ];
  return candidates.find((dir) => existsSync(join(dir, 'node_api.h')));
}

/** Возвращает путь к собранному модулю или null. */
export function buildNative() {
  if (existsSync(OUT) && [...SOURCES,'scripts/build-native.mjs'].every(path=>statSync(OUT).mtimeMs>=statSync(path).mtimeMs)) return OUT;
  const include = includeDir();
  if (!include) {
    console.warn('Нативный модуль не собран: не найден node_api.h (нужны заголовки Node).');
    return null;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  execFileSync(
    'clang',
    ['-fobjc-arc', '-O2', '-bundle', '-undefined', 'dynamic_lookup', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=13.0',
      '-I', include, '-framework', 'AppKit', '-framework', 'Vision', '-framework', 'ImageIO', '-o', OUT, ...SOURCES],
    { stdio: 'inherit' },
  );
  return OUT;
}
