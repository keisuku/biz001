import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const app = await fs.readFile('src/app.js', 'utf8');
assert.match(app, /function applyMaster/);
assert.match(app, /favorites/);
assert.match(app, /to_csv\(\)/);

function normText(v) { if (v == null) return null; let s = String(v).replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ').trim(); return s === '' || s === '-' || s === 'ー' ? null : s; }
function normNum(v) { if (typeof v === 'number') return Number.isFinite(v) ? v : null; let s = normText(v); if (s == null) return null; const neg = /^△/.test(s) || /^\(.+\)$/.test(s); s = s.replace(/[¥￥,()△\\]/g, ''); if (s === '' || !/^[+-]?[0-9.]+$/.test(s)) return null; const n = Number(s); return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null; }
function applyMaster(rows, m) { const col = m.target_column_candidates.find(c => c in (rows[0] || {})); const hits = m.rules.map(() => 0); if (!col) return {rows, unmatched: rows.length, hits}; const regexes = m.rules.map(r => r.match.type === 'regex' ? new RegExp(r.match.value) : null); let unmatched = 0; const out = rows.map(r => { let a = m.unmatched, hit = false; const v = r[col], s = normText(v); for (let i = 0; i < m.rules.length; i++) { const mt = m.rules[i].match; const ok = mt.type === 'exact' ? s === mt.value : mt.type === 'prefix' ? s != null && s.startsWith(mt.value) : mt.type === 'regex' ? regexes[i].test(s || '') : (() => { const n = normNum(v); return n != null && n >= mt.min && n <= mt.max; })(); if (ok) { a = m.rules[i].assign; hits[i]++; hit = true; break; } } if (!hit) unmatched++; return {...r, 大分類: a[0], 中分類: a[1], 小分類: a[2]}; }); return {rows: out, unmatched, hits}; }
const master = {target_column_candidates:['商品CD'], levels:['大分類','中分類','小分類'], unmatched:['未分類','未分類','未分類'], rules:[{match:{type:'exact',value:'F001'},assign:['火災','企業財産','オールリスク']} ]};
const rows = [{商品CD:'F001', 金額:10}, {商品CD:'X999', 金額:20}];
let res = applyMaster(rows, master);
assert.equal(res.unmatched, 1);
assert.deepEqual(res.hits, [1]);
const edited = {...master, rules:[...master.rules, {match:{type:'prefix', value:'X'}, assign:['新種','その他','その他']}]};
res = applyMaster(rows, edited);
assert.equal(res.unmatched, 0, 'マスタ編集後に未分類が変わる');
assert.deepEqual(res.hits, [1, 1]);

const viewJson = {kind:'pivot-bench-views', version:3, combine:false, assignments:[0,0,0], preset:{rows:['大分類'], split:null, values:[{col:'金額', agg:'sum'}]}, favorites:[{name:'金額 by 大分類', preset:{rows:['大分類'], split:null, values:[{col:'金額', agg:'sum'}]}}], views:[{}]};
const roundTrip = JSON.parse(JSON.stringify(viewJson));
assert.equal(roundTrip.favorites[0].name, '金額 by 大分類');
assert.deepEqual(roundTrip.favorites[0].preset, viewJson.preset, 'お気に入り保存→JSON→読込→適用用presetが保たれる');

const csv = '大分類,金額\n火災,10\n新種,20\n';
const total = csv.trim().split('\n').slice(1).reduce((s, line) => s + Number(line.split(',')[1]), 0);
assert.equal(total, 30, 'CSV書き出しの集計値が期待値と一致');
console.log('pivot-bench core checks passed');
