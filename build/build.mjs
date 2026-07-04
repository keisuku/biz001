import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const root=process.cwd();
async function exists(p){try{await fs.access(p);return true}catch{return false}}
if(!await exists('node_modules/@finos/perspective')||!await exists('node_modules/xlsx')){throw new Error('依存が未取得です。`npm install`で @finos/perspective / viewer / datagrid / xlsx をnpmから取得してください。実行時は外部アクセスしません。')}
await fs.mkdir('dist',{recursive:true});
await build({entryPoints:['src/app.js'],bundle:true,format:'esm',outfile:'dist/app.bundle.js',loader:{'.wasm':'dataurl','.css':'text'},minify:true});
let html=await fs.readFile('src/index.html','utf8');
html=html.replace('__CSS__',await fs.readFile('src/styles.css','utf8')).replace('__APP__',await fs.readFile('dist/app.bundle.js','utf8'));
await fs.writeFile('dist/pivot-bench.html',html);
await fs.rm('dist/app.bundle.js',{force:true});
console.log('dist/pivot-bench.html を生成しました');
