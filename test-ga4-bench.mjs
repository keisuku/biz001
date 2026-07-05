import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {classify,buildReport,normNum} from './ga4-bench/src/core.js';
assert.equal(normNum('12.3%'),12.3);assert.equal(normNum('△1,200'),-1200);
await import('./ga4-bench/build/generate-sample.mjs');
const names=(await fs.readdir('testdata/ga4-sample')).filter(n=>n.endsWith('.csv'));
const files=[];for(const n of names){const text=await fs.readFile(`testdata/ga4-sample/${n}`,'utf8');files.push({name:n,...classify(n,text)});}
assert.equal(files.length,12);assert.ok(files.some(f=>f.kind==='ga4-channel'));assert.ok(files.some(f=>f.kind==='gsc-query'));assert.ok(files.every(f=>f.month));
const r=buildReport(files,{sigma:2,months:6});assert.equal(r.current,'2026-06');assert.equal(r.summary.length,3);assert.ok(r.channel.length>=4);assert.ok(r.lp.length>=4);assert.ok(r.seo.length>=4);assert.ok(r.anomalies.length>=1,'仕込んだ異常が検出される');
const settings={conversionEvents:['問い合わせ'],sigma:2,months:6};assert.deepEqual(JSON.parse(JSON.stringify(settings)),settings);
console.log('ga4-bench core checks passed');
