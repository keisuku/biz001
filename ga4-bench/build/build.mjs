import fs from 'node:fs/promises';
import {build} from 'esbuild';
await fs.mkdir('dist',{recursive:true});
await build({entryPoints:['ga4-bench/src/app.js'],bundle:true,format:'esm',outfile:'dist/ga4-bench.bundle.js',minify:true});
const js=(await fs.readFile('dist/ga4-bench.bundle.js','utf8')).replace(/<\/script/gi,'<\\/script');
const css=await fs.readFile('ga4-bench/src/styles.css','utf8');
const html=(await fs.readFile('ga4-bench/src/index.html','utf8')).replace('__CSS__',()=>css).replace('__APP__',()=>js);
await fs.writeFile('dist/ga4-bench.html',html);await fs.rm('dist/ga4-bench.bundle.js',{force:true});
const {size}=await fs.stat('dist/ga4-bench.html');console.log(`dist/ga4-bench.html を生成しました (${(size/1048576).toFixed(2)} MB)`);
