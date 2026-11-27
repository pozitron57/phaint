// Сборка в dist/: главный процесс и preload (CommonJS для Electron), рендерер (один бандл)
// и нативный модуль. `node build.mjs` — один раз, `node build.mjs --watch` — пересобирать при правках.
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readCatalogs } from './src/locales/read.ts';
import { buildNative } from './scripts/build-native.mjs';

const watch = process.argv.includes('--watch');
// Тот же источник версии, что у пакета приложения; доступен и браузерной сборке.
const {version}=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));
// SVGO не разбирается при обычном сохранении: отдельный модуль загружается по галочке.
const lazySvg = {name:'lazy-files',setup(build){build.onResolve({filter:/\/(svg-optimize|pdf-render|pdf-svg)\.ts$/},args=>args.kind==='entry-point'?undefined:({path:'./'+args.path.split('/').pop().replace('.ts','.js'),external:true}));}};
// В приложении нет доступа к исходникам. Включаем все переводы и следим за новыми файлами в --watch.
const localeDirectory=new URL('./src/locales/',import.meta.url);
const locales={name:'locales',setup(build){
  build.onLoad({filter:/[/\\]locales[/\\]catalogs\.ts$/},()=>{
    const catalogs=readCatalogs(localeDirectory);
    return {contents:'export const catalogs = '+JSON.stringify(catalogs),
      watchFiles:Object.keys(catalogs).map(code=>fileURLToPath(new URL(code+'.json',localeDirectory))),
      watchDirs:[fileURLToPath(localeDirectory)]};
  });
}};
const common = { bundle: true, sourcemap: true, logLevel: 'info', plugins:[locales,lazySvg], define:{__PHAINT_VERSION__:JSON.stringify(version)} };
const node = { ...common, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] };

const configs = [
  { ...node, entryPoints: ['electron/main.ts'], outfile: 'dist/main.cjs' },
  { ...node, entryPoints: ['electron/preload.ts'], outfile: 'dist/preload.cjs' },
  { ...node, entryPoints: ['electron/pdf-worker.ts'], outfile: 'dist/pdf-worker.cjs' },
  { ...node, entryPoints: ['electron/pdf-compose-worker.ts'], outfile: 'dist/pdf-compose-worker.cjs' },
  { ...common, entryPoints: ['src/main.ts'], outfile: 'dist/renderer/app.js', platform: 'browser', format: 'iife', target: 'es2022' },
  { ...common, entryPoints: ['src/files/worker.ts'], outfile: 'dist/renderer/document-worker.js', platform: 'browser', format: 'iife', target: 'es2022' },
  { ...common, plugins:[locales], entryPoints: ['src/files/svg-optimize.ts'], outfile: 'dist/renderer/svg-optimize.js', platform: 'browser', format: 'esm', target: 'es2022', minify:true },
  { ...common, plugins:[locales], entryPoints: ['src/files/pdf-render.ts'], outfile: 'dist/renderer/pdf-render.js', platform:'browser',format:'esm',target:'es2022',minify:true },
  { ...common, plugins:[locales,lazySvg,{name:'mupdf',setup(build){build.onResolve({filter:/^mupdf$/},()=>({path:'./mupdf/mupdf.js',external:true}));}}], entryPoints:['src/files/pdf-svg.ts'],outfile:'dist/renderer/pdf-svg.js',platform:'browser',format:'esm',target:'es2022',minify:true },
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist/renderer', { recursive: true });
await cp('src/index.html', 'dist/renderer/index.html');
await cp('src/styles.css', 'dist/renderer/styles.css');
await cp('node_modules/svgo/LICENSE', 'dist/SVGO-LICENSE.txt');
await cp('node_modules/pdfjs-dist/LICENSE','dist/PDFJS-LICENSE.txt');
await cp('node_modules/mupdf/LICENSE','dist/MUPDF-LICENSE.txt');
await mkdir('dist/renderer/mupdf',{recursive:true});
for(const name of ['mupdf.js','mupdf-wasm.js','mupdf-wasm.wasm'])await cp(`node_modules/mupdf/dist/${name}`,`dist/renderer/mupdf/${name}`);
await mkdir('dist/renderer/pdfjs',{recursive:true});
await cp('node_modules/pdfjs-dist/build/pdf.worker.mjs','dist/renderer/pdfjs/pdf.worker.mjs');
for(const name of ['cmaps','standard_fonts','wasm','iccs'])await cp(`node_modules/pdfjs-dist/${name}`,`dist/renderer/pdfjs/${name}`,{recursive:true});
const native = buildNative();
if (native) await cp(native, 'dist/phaint_native.node');

if (watch) {
  for (const c of configs) await (await esbuild.context(c)).watch();
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)));
}
