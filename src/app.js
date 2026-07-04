import perspective from '@finos/perspective/dist/esm/perspective.inline.js';
import '@finos/perspective-viewer/dist/esm/perspective-viewer.inline.js';
import '@finos/perspective-viewer-datagrid';
import * as XLSX from 'xlsx';
import themeCss from '@finos/perspective-viewer/dist/css/pro-dark.css';

document.head.append(Object.assign(document.createElement('style'), {textContent: themeCss}));

const $ = s => document.querySelector(s);
const PANE_COUNT = 3;
let master = null, table = null, rows = [], fileName = '';

const defaultMaster = {
  meta: {name: '商材分類 v1', updated: '2026-07-04', note: ''},
  target_column_candidates: ['商品コード', '商品CD', 'PRODUCT_CODE'],
  levels: ['大分類', '中分類', '小分類'],
  rules: [
    {match: {type: 'exact', value: 'F001'}, assign: ['火災', '企業財産', 'オールリスク']},
    {match: {type: 'prefix', value: 'F'}, assign: ['火災', '企業財産', 'その他']},
    {match: {type: 'regex', value: '^A[0-9]{3}$'}, assign: ['自動車', 'フリート', 'その他']},
    {match: {type: 'range', min: 1000, max: 1999}, assign: ['新種', '賠償', 'その他']}
  ],
  unmatched: ['未分類', '未分類', '未分類']
};

let toastTimer = 0;
function toast(m) {
  $('#toast').textContent = m;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 4000);
}

// ---- 正規化 ----
function normText(v) {
  if (v == null) return null;
  let s = String(v)
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .trim();
  return s === '' || s === '-' || s === 'ー' ? null : s;
}

function normNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = normText(v);
  if (s == null) return null;
  const neg = /^△/.test(s) || /^\(.+\)$/.test(s);
  // Shift_JISでは0x5C(¥)がバックスラッシュにデコードされるため \ も通貨記号として除去
  s = s.replace(/[¥￥,()△\\]/g, '');
  if (s === '' || !/^[+-]?[0-9.]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
}

function infer(vals) {
  let n = 0, t = 0;
  for (const v of vals) {
    if (v == null || normText(v) == null) continue;
    t++;
    if (normNum(v) != null) n++;
  }
  return t > 0 && n / t > 0.8 ? 'number' : 'string';
}

function normalize(raw) {
  const cols = Object.keys(raw[0] || {});
  const types = Object.fromEntries(cols.map(c => [c, infer(raw.slice(0, 200).map(r => r[c]))]));
  return raw.map(r => Object.fromEntries(cols.map(c => [c, types[c] === 'number' ? normNum(r[c]) : normText(r[c])])));
}

// ---- バケットマスタ ----
function validateMaster(m) {
  if (!m || typeof m !== 'object') return 'JSONオブジェクトではありません';
  if (!Array.isArray(m.target_column_candidates) || !m.target_column_candidates.length) return 'target_column_candidates が必要です';
  if (!Array.isArray(m.levels) || m.levels.length !== 3) return 'levels は3要素の配列が必要です';
  if (!Array.isArray(m.rules)) return 'rules が必要です';
  for (const [i, r] of m.rules.entries()) {
    if (!r.match || !['exact', 'prefix', 'regex', 'range'].includes(r.match.type)) return `rules[${i}].match.type が不正です`;
    if (!Array.isArray(r.assign) || r.assign.length !== 3) return `rules[${i}].assign は3要素の配列が必要です`;
  }
  if (!Array.isArray(m.unmatched) || m.unmatched.length !== 3) return 'unmatched は3要素の配列が必要です';
  return null;
}

function applyMaster(data, m) {
  const col = m.target_column_candidates.find(c => c in (data[0] || {}));
  if (!col) {
    toast(`対象列が見つかりません (候補: ${m.target_column_candidates.join(', ')})`);
    $('#unmatched b').textContent = data.length;
    $('#unmatched').classList.add('warn');
    return {out: data.map(r => ({...r, [m.levels[0]]: m.unmatched[0], [m.levels[1]]: m.unmatched[1], [m.levels[2]]: m.unmatched[2]})), unmatched: data.length, col: null};
  }
  const regexes = m.rules.map(r => r.match.type === 'regex' ? new RegExp(r.match.value) : null);
  let unmatched = 0;
  const out = data.map(r => {
    let a = m.unmatched, hit = false;
    const v = r[col], s = normText(v);
    for (let i = 0; i < m.rules.length; i++) {
      const mt = m.rules[i].match;
      const ok =
        mt.type === 'exact' ? s === mt.value :
        mt.type === 'prefix' ? s != null && s.startsWith(mt.value) :
        mt.type === 'regex' ? regexes[i].test(s || '') :
        (() => { const n = normNum(v); return n != null && n >= mt.min && n <= mt.max; })();
      if (ok) { a = m.rules[i].assign; hit = true; break; }
    }
    if (!hit) unmatched++;
    return {...r, [m.levels[0]]: a[0], [m.levels[1]]: a[1], [m.levels[2]]: a[2]};
  });
  $('#unmatched b').textContent = unmatched;
  $('#unmatched').classList.toggle('warn', unmatched > 0);
  return {out, unmatched, col};
}

// ---- ファイル読込 ----
function decodeCsv(buf) {
  const utf8 = new TextDecoder('utf-8', {fatal: false}).decode(buf);
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('shift_jis', {fatal: false}).decode(buf);
  } catch {
    return utf8;
  }
}

async function loadDataFile(file) {
  toast(`読込中… ${file.name}`);
  try {
    const buf = await file.arrayBuffer();
    let wb;
    if (/\.csv$/i.test(file.name)) {
      wb = XLSX.read(decodeCsv(buf), {type: 'string'});
    } else {
      wb = XLSX.read(buf, {type: 'array'});
    }
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval: null});
    if (!raw.length) { toast('データ行がありません'); return; }
    rows = normalize(raw);
    fileName = file.name;
    if (master) rows = applyMaster(rows, master).out;
    await render();
    toast(`完了 ${rows.length.toLocaleString()}行 × ${Object.keys(rows[0]).length}列`);
  } catch (e) {
    console.error(e);
    toast(`読込失敗: ${e.message}`);
  }
}

async function loadMasterFile(file) {
  try {
    const m = JSON.parse(await file.text());
    const err = validateMaster(m);
    if (err) { toast(`マスタが不正: ${err}`); return; }
    master = m;
    toast(`マスタ読込: ${m.meta?.name ?? file.name}`);
    if (rows.length) {
      rows = applyMaster(stripLevels(rows, m), master).out;
      await render();
    }
  } catch (e) {
    toast(`マスタ読込失敗: ${e.message}`);
  }
}

function stripLevels(data, m) {
  const lv = new Set([...m.levels, ...defaultMaster.levels]);
  return data.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !lv.has(k))));
}

// ---- 表示 ----
function viewers() {
  return [...document.querySelectorAll('perspective-viewer')];
}

async function render() {
  $('#start').hidden = true;
  $('#bench').hidden = false;
  if (table) {
    const old = table;
    table = null;
    await Promise.all(viewers().map(v => v.eject()));
    await old.delete();
  }
  $('#panes').innerHTML = '';
  const worker = await perspective.worker();
  table = await worker.table(rows);
  const cols = Object.keys(rows[0] || {});
  const groupBy = (master ?? defaultMaster).levels.filter(c => cols.includes(c));
  for (let i = 0; i < PANE_COUNT; i++) {
    const p = document.createElement('section');
    p.className = 'pane';
    p.innerHTML = `<h2>${i + 1} </h2><perspective-viewer theme="Pro Dark"></perspective-viewer>`;
    p.querySelector('h2').append(fileName);
    $('#panes').append(p);
    const v = p.querySelector('perspective-viewer');
    await v.load(table);
    await v.restore({plugin: 'Datagrid', group_by: groupBy, columns: cols.slice(0, 12)});
  }
}

// ---- JSON入出力 ----
function download(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'}));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function exportViews() {
  const vs = viewers();
  if (!vs.length) { toast('保存するビューがありません'); return; }
  const views = await Promise.all(vs.map(v => v.save()));
  download('pivot-bench-views.json', {kind: 'pivot-bench-views', version: 1, saved: new Date().toISOString(), views});
}

async function importViews(file) {
  try {
    const cfg = JSON.parse(await file.text());
    if (cfg.kind !== 'pivot-bench-views' || !Array.isArray(cfg.views)) { toast('ビュー設定JSONではありません'); return; }
    const vs = viewers();
    if (!vs.length) { toast('先にデータを読み込んでください'); return; }
    await Promise.all(vs.map((v, i) => cfg.views[i] ? v.restore(cfg.views[i]) : null));
    toast('ビュー設定を復元しました');
  } catch (e) {
    toast(`ビュー読込失敗: ${e.message}`);
  }
}

// ---- UI配線 ----
function pickFile(accept, cb) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.onchange = () => inp.files[0] && cb(inp.files[0]);
  inp.click();
}

$('#open').onclick = () => pickFile('.csv,.xlsx', loadDataFile);
$('#reopen').onclick = () => pickFile('.csv,.xlsx', loadDataFile);
$('#masterOpen').onclick = () => pickFile('.json,application/json', loadMasterFile);
$('#masterDefault').onclick = () => {
  master = defaultMaster;
  toast('標準マスタを読込');
  if (rows.length) { rows = applyMaster(stripLevels(rows, master), master).out; render(); }
};
$('#masterExport').onclick = () => download('pivot-bench-master.json', master ?? defaultMaster);
$('#viewExport').onclick = exportViews;
$('#viewImport').onclick = () => pickFile('.json,application/json', importViews);
$('#specBtn').onclick = () => $('#spec').showModal();
$('#closeSpec').onclick = () => $('#spec').close();

addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); pickFile('.csv,.xlsx', loadDataFile); }
  if (e.key === 'Escape') $('#spec').close();
});

// ドラッグ&ドロップ: CSV/xlsxはデータ、JSONはマスタとして読込
addEventListener('dragover', e => { e.preventDefault(); $('#start').classList.add('drag'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) $('#start').classList.remove('drag'); });
addEventListener('drop', e => {
  e.preventDefault();
  $('#start').classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (!f) return;
  if (/\.json$/i.test(f.name)) loadMasterFile(f);
  else if (/\.(csv|xlsx)$/i.test(f.name)) loadDataFile(f);
  else toast('CSV / xlsx / JSON のみ対応です');
});
