import fs from 'node:fs/promises';
import {build} from 'esbuild';

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
if (!await exists('node_modules/@finos/perspective') || !await exists('node_modules/xlsx')) {
  throw new Error('依存が未取得です。`npm install`で @finos/perspective / viewer / datagrid / xlsx をnpmから取得してください。実行時は外部アクセスしません。');
}

await fs.mkdir('dist', {recursive: true});
await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/app.bundle.js',
  loader: {'.wasm': 'dataurl', '.css': 'text'},
  minify: true,
});

// インラインscript内で閉じタグとして解釈されないようエスケープ('\/'は'/'と等価)
const js = (await fs.readFile('dist/app.bundle.js', 'utf8')).replace(/<\/script/gi, '<\\/script');
const css = await fs.readFile('src/styles.css', 'utf8');
const html = (await fs.readFile('src/index.html', 'utf8'))
  // 置換文字列中の $& 等がreplaceの特殊パターンとして解釈されないよう関数で渡す
  .replace('__CSS__', () => css)
  .replace('__APP__', () => js);
await fs.writeFile('dist/pivot-bench.html', html);
await fs.rm('dist/app.bundle.js', {force: true});
const {size} = await fs.stat('dist/pivot-bench.html');
console.log(`dist/pivot-bench.html を生成しました (${(size / 1048576).toFixed(1)} MB)`);
