import perspective from '@finos/perspective/dist/esm/perspective.inline.js';
import '@finos/perspective-viewer/dist/esm/perspective-viewer.inline.js';
import '@finos/perspective-viewer-datagrid';
import * as XLSX from 'xlsx';
import themeCss from '@finos/perspective-viewer/dist/css/pro-dark.css';

document.head.append(Object.assign(document.createElement('style'), {textContent: themeCss}));

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const PANE_COUNT = 3;
const MAX_REPORTS = 3;
const SOURCE_COL = 'レポート';
const AGGS = ['sum', 'count', 'avg', 'min', 'max'];
const VIEW_KIND = 'pivot-bench-views';

// ---- 状態 (localStorage禁止: 永続化は全てJSON入出力) ----
let master = null;
let reports = [];              // {name, rows, cols, numeric:Set}
let combine = false;           // false=並置 / true=結合
let assignments = [0, 0, 0];   // 並置モード: ペインごとのレポートindex
let activePane = 0;
let worker = null;
const tables = new Map();      // reportIdx -> perspective table
let combinedTable = null;
let ruleStats = {hits: [], unmatched: 0};
let favorites = [];

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
  const rows = raw.map(r => Object.fromEntries(cols.map(c => [c, types[c] === 'number' ? normNum(r[c]) : normText(r[c])])));
  return {rows, cols, numeric: new Set(cols.filter(c => types[c] === 'number'))};
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

function applyMaster(rows, m) {
  const col = m.target_column_candidates.find(c => c in (rows[0] || {}));
  if (!col) {
    return {
      rows: rows.map(r => ({...r, [m.levels[0]]: m.unmatched[0], [m.levels[1]]: m.unmatched[1], [m.levels[2]]: m.unmatched[2]})),
      unmatched: rows.length, col: null, hits: m.rules.map(() => 0)
    };
  }
  const regexes = m.rules.map(r => r.match.type === 'regex' ? new RegExp(r.match.value) : null);
  let unmatched = 0;
  const hits = m.rules.map(() => 0);
  const out = rows.map(r => {
    let a = m.unmatched, hit = false;
    const v = r[col], s = normText(v);
    for (let i = 0; i < m.rules.length; i++) {
      const mt = m.rules[i].match;
      const ok =
        mt.type === 'exact' ? s === mt.value :
        mt.type === 'prefix' ? s != null && s.startsWith(mt.value) :
        mt.type === 'regex' ? regexes[i].test(s || '') :
        (() => { const n = normNum(v); return n != null && n >= mt.min && n <= mt.max; })();
      if (ok) { a = m.rules[i].assign; hits[i]++; hit = true; break; }
    }
    if (!hit) unmatched++;
    return {...r, [m.levels[0]]: a[0], [m.levels[1]]: a[1], [m.levels[2]]: a[2]};
  });
  return {rows: out, unmatched, col, hits};
}

function stripLevels(rows, m) {
  const lv = new Set([...(m?.levels ?? []), ...defaultMaster.levels]);
  return rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !lv.has(k))));
}

function reapplyMasterAll() {
  const hits = (master ?? defaultMaster).rules.map(() => 0);
  let unmatchedTotal = 0;
  for (const rep of reports) {
    const base = stripLevels(rep.rows, master);
    if (master) {
      const res = applyMaster(base, master);
      rep.rows = res.rows;
      rep.unmatched = res.unmatched;
      unmatchedTotal += res.unmatched;
      res.hits.forEach((h, i) => { hits[i] = (hits[i] || 0) + h; });
      if (res.col == null) toast(`${rep.name}: 対象列が見つかりません (候補: ${master.target_column_candidates.join(', ')})`);
      rep.cols = Object.keys(rep.rows[0] || {});
    } else {
      rep.rows = base;
      rep.unmatched = 0;
      rep.cols = Object.keys(rep.rows[0] || {});
    }
  }
  ruleStats = {hits, unmatched: unmatchedTotal};
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
  if (reports.length >= MAX_REPORTS) { toast(`レポートは最大${MAX_REPORTS}本です。チップの✕で外してから追加してください`); return; }
  toast(`読込中… ${file.name}`);
  try {
    const buf = await file.arrayBuffer();
    const wb = /\.csv$/i.test(file.name) ? XLSX.read(decodeCsv(buf), {type: 'string'}) : XLSX.read(buf, {type: 'array'});
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval: null});
    if (!raw.length) { toast('データ行がありません'); return; }
    const {rows, cols, numeric} = normalize(raw);
    const rep = {name: file.name.replace(/\.(csv|xlsx)$/i, ''), rows, cols, numeric, unmatched: 0};
    if (master) {
      const res = applyMaster(rep.rows, master);
      rep.rows = res.rows; rep.unmatched = res.unmatched;
      rep.cols = Object.keys(rep.rows[0] || {});
      ruleStats = {hits: res.hits, unmatched: res.unmatched};
      if (res.col == null) toast(`対象列が見つかりません (候補: ${master.target_column_candidates.join(', ')})`);
    }
    reports.push(rep);
    if (reports.length === 1) assignments = [0, 0, 0];
    else assignments = assignments.map((a, i) => reports.length > i ? i : a); // 2本目以降は各面に自動割当
    if (!presetTouched) defaultPreset();
    await rebuild();
    toast(`完了 ${rows.length.toLocaleString()}行 × ${cols.length}列 — ${rep.name}`);
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
    if (reports.length) { reapplyMasterAll(); if (!presetTouched) defaultPreset(); await rebuild(); }
  } catch (e) {
    toast(`マスタ読込失敗: ${e.message}`);
  }
}

// ---- テーブル管理 ----
async function getWorker() { return worker ??= await perspective.worker(); }

async function clearTables() {
  await Promise.all($$('perspective-viewer').map(v => v.eject().catch(() => {})));
  for (const t of tables.values()) await t.delete().catch(() => {});
  tables.clear();
  if (combinedTable) { await combinedTable.delete().catch(() => {}); combinedTable = null; }
}

function unionCols() {
  const seen = new Set();
  for (const r of reports) for (const c of r.cols) seen.add(c);
  return [...seen];
}

async function getReportTable(i) {
  if (!tables.has(i)) tables.set(i, await (await getWorker()).table(reports[i].rows));
  return tables.get(i);
}

async function getCombinedTable() {
  if (!combinedTable) {
    const cols = unionCols();
    const rows = reports.flatMap(rep => rep.rows.map(r => {
      const o = {[SOURCE_COL]: rep.name};
      for (const c of cols) o[c] = c in r ? r[c] : null;
      return o;
    }));
    combinedTable = await (await getWorker()).table(rows);
  }
  return combinedTable;
}

// ---- プリセット (Tadの1パネル設定UXを踏襲) ----
let presetTouched = false; // ユーザーが触った後はdefaultPresetで上書きしない

function presetColumns() {
  const cols = unionCols();
  return combine ? [SOURCE_COL, ...cols] : cols;
}

function readPreset() {
  return {
    rows: [1, 2, 3, 4].map(i => $(`#row${i}`).value).filter(Boolean),
    split: $('#split').value || null,
    values: [1, 2].map(i => ({col: $(`#val${i}`).value, agg: $(`#agg${i}`).value})).filter(v => v.col)
  };
}

function writePreset(p) {
  [1, 2, 3, 4].forEach(i => { $(`#row${i}`).value = p.rows?.[i - 1] ?? ''; });
  $('#split').value = p.split ?? '';
  [1, 2].forEach(i => {
    $(`#val${i}`).value = p.values?.[i - 1]?.col ?? '';
    $(`#agg${i}`).value = p.values?.[i - 1]?.agg ?? 'sum';
  });
}

function refreshPresetOptions() {
  const cols = presetColumns();
  const opt = (list, empty) => [`<option value="">${empty}</option>`, ...list.map(c => `<option>${c}</option>`)].join('');
  const keep = readPreset();
  for (const i of [1, 2, 3, 4]) $(`#row${i}`).innerHTML = opt(cols, `行${i}`);
  $('#split').innerHTML = opt(cols, '列分割なし');
  const numeric = cols.filter(c => reports.some(r => r.numeric.has(c)));
  for (const i of [1, 2]) {
    $(`#val${i}`).innerHTML = opt(numeric.length ? numeric : cols, `値${i}`);
    if (!$(`#agg${i}`).options.length) $(`#agg${i}`).innerHTML = AGGS.map(a => `<option>${a}</option>`).join('');
  }
  writePreset({rows: keep.rows, split: keep.split, values: keep.values});
}

function defaultPreset() {
  refreshPresetOptions();
  const cols = presetColumns();
  const levels = (master ?? defaultMaster).levels.filter(c => cols.includes(c));
  const firstNumeric = cols.find(c => reports.some(r => r.numeric.has(c)));
  writePreset({
    rows: levels,
    split: combine && reports.length > 1 ? SOURCE_COL : null,
    values: firstNumeric ? [{col: firstNumeric, agg: 'sum'}] : []
  });
}

function presetConfig(paneCols) {
  const p = readPreset();
  const group_by = p.rows.filter(c => paneCols.includes(c));
  const split_by = p.split && paneCols.includes(p.split) ? [p.split] : [];
  let values = p.values.filter(v => paneCols.includes(v.col));
  if (!values.length) {
    const c = paneCols.find(c => reports.some(r => r.numeric.has(c))) ?? paneCols[0];
    if (c) values = [{col: c, agg: reports.some(r => r.numeric.has(c)) ? 'sum' : 'count'}];
  }
  return {
    plugin: 'Datagrid',
    group_by, split_by,
    columns: values.map(v => v.col),
    aggregates: Object.fromEntries(values.map(v => [v.col, v.agg])),
    expressions: {}, filter: [], sort: []
  };
}

async function applyPreset(target /* 'all' | paneIndex */) {
  const panes = target === 'all' ? [...Array(PANE_COUNT).keys()] : [target];
  for (const i of panes) {
    const v = $(`#pane${i} perspective-viewer`);
    if (!v) continue;
    const cols = combine ? [SOURCE_COL, ...unionCols()] : (reports[assignments[i]]?.cols ?? []);
    await v.restore(presetConfig(cols));
  }
}


function refreshFavorites() {
  const sel = $('#favoriteSelect');
  if (!sel) return;
  const keep = sel.value;
  sel.innerHTML = '<option value="">お気に入り選択</option>' + favorites.map((f, i) => `<option value="${i}">${f.name}</option>`).join('');
  sel.value = keep;
}

function saveFavorite() {
  const name = prompt('お気に入り集計の名前', `集計 ${favorites.length + 1}`);
  if (!name) return;
  favorites.push({name, preset: readPreset()});
  refreshFavorites();
  $('#favoriteSelect').value = String(favorites.length - 1);
  toast(`お気に入り保存: ${name}`);
}

async function applyFavorite() {
  const fav = favorites[Number($('#favoriteSelect').value)];
  if (!fav) return;
  presetTouched = true;
  refreshPresetOptions();
  writePreset(fav.preset);
  await applyPreset($('#sync').checked ? 'all' : activePane);
  toast(`お気に入り適用: ${fav.name}`);
}

function deleteFavorite() {
  const i = Number($('#favoriteSelect').value);
  if (!favorites[i]) return;
  const [f] = favorites.splice(i, 1);
  refreshFavorites();
  toast(`お気に入り削除: ${f.name}`);
}

// ---- 描画 ----
function updateGauge() {
  const total = reports.reduce((s, r) => s + (r.unmatched || 0), 0);
  $('#unmatched b').textContent = total.toLocaleString();
  $('#unmatched').classList.toggle('warn', total > 0);
}

function renderChips() {
  $('#chips').innerHTML = reports.map((r, i) =>
    `<span class="chip" data-i="${i}"><b>${String.fromCharCode(65 + i)}</b> ${r.name} <i>${r.rows.length.toLocaleString()}</i><button class="x" data-i="${i}" title="このレポートを外す">×</button></span>`
  ).join('');
  $$('#chips .x').forEach(b => b.onclick = async e => {
    const i = Number(e.target.dataset.i);
    reports.splice(i, 1);
    assignments = assignments.map(a => Math.min(a >= i && a > 0 ? a - 1 : a, Math.max(reports.length - 1, 0)));
    if (!reports.length) { await clearTables(); $('#bench').hidden = true; $('#start').hidden = false; updateGauge(); renderChips(); return; }
    await rebuild();
  });
}

function setActivePane(i) {
  activePane = i;
  $$('.pane').forEach((p, j) => p.classList.toggle('active', j === i));
}

// rebuild中の追加操作(チップ✕連打・モード切替)で状態が壊れないよう直列化する
let rebuildChain = Promise.resolve();
function rebuild() {
  return rebuildChain = rebuildChain.then(rebuildNow, rebuildNow);
}

async function rebuildNow() {
  $('#start').hidden = true;
  $('#bench').hidden = false;
  await clearTables();
  refreshPresetOptions();
  renderChips();
  updateGauge();
  $('#combineBtn').textContent = combine ? '結合中' : '並置中';
  $('#combineBtn').classList.toggle('on', combine);

  $('#panes').innerHTML = '';
  for (let i = 0; i < PANE_COUNT; i++) {
    const p = document.createElement('section');
    p.className = 'pane';
    p.id = `pane${i}`;
    const selector = combine
      ? `<span class="src">結合 (${reports.map(r => r.name).join(' + ')})</span>`
      : `<select class="assign" data-pane="${i}">${reports.map((r, j) => `<option value="${j}" ${assignments[i] === j ? 'selected' : ''}>${String.fromCharCode(65 + j)} ${r.name}</option>`).join('')}</select>`;
    p.innerHTML = `<h2><span class="num">${i + 1}</span>${selector}</h2><perspective-viewer theme="Pro Dark"></perspective-viewer>`;
    $('#panes').append(p);
    p.onclick = () => setActivePane(i);
    const v = p.querySelector('perspective-viewer');
    const table = combine ? await getCombinedTable() : await getReportTable(assignments[i] ?? 0);
    await v.load(table);
  }
  $$('.assign').forEach(s => s.onchange = async e => {
    const i = Number(e.target.dataset.pane);
    assignments[i] = Number(e.target.value);
    // 旧テーブルの列を参照する設定が新テーブルに再適用されないよう、ビューアごと作り直す
    const old = $(`#pane${i} perspective-viewer`);
    await old.eject().catch(() => {});
    const v = document.createElement('perspective-viewer');
    v.setAttribute('theme', 'Pro Dark');
    old.replaceWith(v);
    await v.load(await getReportTable(assignments[i]));
    await applyPreset(i);
  });
  setActivePane(Math.min(activePane, PANE_COUNT - 1));
  await applyPreset('all');
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
  const vs = $$('perspective-viewer');
  if (!vs.length) { toast('保存するビューがありません'); return; }
  const views = await Promise.all(vs.map(v => v.save()));
  download('pivot-bench-views.json', {
    kind: VIEW_KIND, version: 3, saved: new Date().toISOString(),
    combine, assignments, preset: readPreset(), favorites, views
  });
}

async function importViews(file) {
  try {
    const cfg = JSON.parse(await file.text());
    if (cfg.kind !== VIEW_KIND || !Array.isArray(cfg.views)) { toast('ビュー設定JSONではありません'); return; }
    if (!reports.length) { toast('先にデータを読み込んでください'); return; }
    if (cfg.version >= 2) {
      combine = !!cfg.combine;
      assignments = (cfg.assignments ?? [0, 0, 0]).map(a => Math.min(a, reports.length - 1));
      favorites = Array.isArray(cfg.favorites) ? cfg.favorites : [];
      presetTouched = true;
      await rebuild();
      refreshFavorites();
      if (cfg.preset) { refreshPresetOptions(); writePreset(cfg.preset); }
    }
    const vs = $$('perspective-viewer');
    let failed = 0;
    for (const [i, v] of vs.entries()) {
      if (!cfg.views[i]) continue;
      try { await v.restore(cfg.views[i]); } catch (e) { failed++; console.error('restore失敗', i, e); }
    }
    toast(failed ? `ビュー復元: ${failed}面が復元できませんでした` : 'ビュー設定を復元しました');
  } catch (e) {
    toast(`ビュー読込失敗: ${e.message}`);
  }
}


function cloneMaster() { return JSON.parse(JSON.stringify(master ?? defaultMaster)); }
function escAttr(v) {
  return String(v ?? '').replace(/[&\"<>]/g, c => ({'&': '&amp;', '\"': '&quot;', '<': '&lt;', '>': '&gt;'}[c]));
}
function ruleToRow(r = {match: {type: 'exact', value: ''}, assign: ['', '', '']}) {
  const mt = r.match ?? {type: 'exact', value: ''};
  const val = escAttr(mt.type === 'range' ? mt.min : mt.value);
  const max = escAttr(mt.type === 'range' ? mt.max : '');
  const assign = [0, 1, 2].map(i => escAttr(r.assign?.[i]));
  return `<tr><td class="idx"></td><td><select class="rtype">${['exact','prefix','regex','range'].map(t => `<option ${mt.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td><input class="rval" value="${val}"></td><td><input class="rmax" value="${max}"></td><td><input class="a0" value="${assign[0]}"></td><td><input class="a1" value="${assign[1]}"></td><td><input class="a2" value="${assign[2]}"></td><td class="hit">0</td><td><button class="up">↑</button><button class="down">↓</button><button class="del">削除</button></td></tr>`;
}
function refreshRuleIndexes() {
  $$('#masterRules tbody tr').forEach((tr, i) => { tr.querySelector('.idx').textContent = i + 1; tr.querySelector('.hit').textContent = (ruleStats.hits[i] ?? 0).toLocaleString(); });
  $('#masterHitSummary').textContent = `未分類 ${ruleStats.unmatched.toLocaleString()}件`;
}
function openMasterEditor() {
  const m = cloneMaster();
  $('#masterName').value = m.meta?.name ?? '';
  $('#masterUpdated').value = m.meta?.updated ?? new Date().toISOString().slice(0, 10);
  $('#masterTargets').value = m.target_column_candidates.join(', ');
  $('#masterUnmatched').value = m.unmatched.join(', ');
  $('#masterRules tbody').innerHTML = m.rules.map(ruleToRow).join('');
  refreshRuleIndexes();
  $('#masterDialog').showModal();
}
function collectMasterFromEditor() {
  return {meta: {name: $('#masterName').value, updated: $('#masterUpdated').value, note: master?.meta?.note ?? ''}, target_column_candidates: $('#masterTargets').value.split(',').map(s => s.trim()).filter(Boolean), levels: (master ?? defaultMaster).levels, rules: $$('#masterRules tbody tr').map(tr => { const type = tr.querySelector('.rtype').value; const match = type === 'range' ? {type, min: Number(tr.querySelector('.rval').value), max: Number(tr.querySelector('.rmax').value)} : {type, value: tr.querySelector('.rval').value}; return {match, assign: [0,1,2].map(i => tr.querySelector(`.a${i}`).value)}; }), unmatched: $('#masterUnmatched').value.split(',').map(s => s.trim()).slice(0, 3)};
}
async function applyMasterEditor() {
  const m = collectMasterFromEditor();
  const err = validateMaster(m);
  if (err) { toast(`マスタが不正: ${err}`); return; }
  master = m;
  if (reports.length) { reapplyMasterAll(); if (!presetTouched) defaultPreset(); await rebuild(); }
  refreshRuleIndexes();
  toast('編集したマスタを適用しました');
}
async function activeViewerCsv() {
  const v = $(`#pane${activePane} perspective-viewer`);
  if (!v) throw new Error('集計結果がありません');
  const view = await v.getView();
  try { return await view.to_csv(); } finally { await view.delete?.().catch?.(() => {}); }
}
async function exportActiveCsv() {
  const csv = await activeViewerCsv();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  a.download = `pivot-bench-pane${activePane + 1}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('CSVを書き出しました');
}
async function copyActiveTsv() {
  const tsv = (await activeViewerCsv()).replace(/,/g, '\t');
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(tsv);
  else {
    const ta = document.createElement('textarea');
    ta.value = tsv;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('集計結果をコピーしました');
}

// ---- UI配線 ----
function pickFile(accept, cb) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.multiple = accept.includes('csv');
  inp.onchange = async () => { for (const f of inp.files) await cb(f); };
  inp.click();
}

$('#open').onclick = () => pickFile('.csv,.xlsx', loadDataFile);
$('#masterEdit').onclick = openMasterEditor;
$('#closeMaster').onclick = () => $('#masterDialog').close();
$('#addRule').onclick = () => { $('#masterRules tbody').insertAdjacentHTML('beforeend', ruleToRow()); refreshRuleIndexes(); };
$('#applyMasterEdit').onclick = applyMasterEditor;
$('#exportMasterEdit').onclick = () => download('pivot-bench-master.json', collectMasterFromEditor());
$('#masterRules').onclick = e => { const tr = e.target.closest('tr'); if (!tr) return; if (e.target.className === 'del') tr.remove(); if (e.target.className === 'up' && tr.previousElementSibling) tr.parentNode.insertBefore(tr, tr.previousElementSibling); if (e.target.className === 'down' && tr.nextElementSibling) tr.parentNode.insertBefore(tr.nextElementSibling, tr); refreshRuleIndexes(); };
$('#favoriteSave').onclick = saveFavorite;
$('#favoriteSelect').onchange = applyFavorite;
$('#favoriteDelete').onclick = deleteFavorite;
$('#csvResult').onclick = () => exportActiveCsv().catch(e => toast(`CSV失敗: ${e.message}`));
$('#copyResult').onclick = () => copyActiveTsv().catch(e => toast(`コピー失敗: ${e.message}`));
$('#addReport').onclick = () => pickFile('.csv,.xlsx', loadDataFile);
$('#masterOpen').onclick = () => pickFile('.json,application/json', loadMasterFile);
$('#masterDefault').onclick = async () => {
  master = defaultMaster;
  toast('標準マスタを読込');
  if (reports.length) { reapplyMasterAll(); if (!presetTouched) defaultPreset(); await rebuild(); }
};
$('#masterExport').onclick = () => download('pivot-bench-master.json', master ?? defaultMaster);
$('#viewExport').onclick = exportViews;
$('#viewImport').onclick = () => pickFile('.json,application/json', importViews);
$('#specBtn').onclick = () => $('#spec').showModal();
$('#closeSpec').onclick = () => $('#spec').close();

$('#combineBtn').onclick = async () => {
  if (reports.length < 2 && !combine) { toast('結合には2本以上のレポートが必要です'); return; }
  combine = !combine;
  if (!presetTouched) defaultPreset();
  await rebuild();
  if (combine && !$('#split').value) { $('#split').value = SOURCE_COL; await applyPreset('all'); }
  toast(combine ? `結合モード: ${reports.length}本を1テーブル化 (${SOURCE_COL}列で分割)` : '並置モード: 面ごとにレポート割当');
};

$('#applyBtn').onclick = () => { presetTouched = true; applyPreset($('#sync').checked ? 'all' : activePane); };
$('#presetbar').addEventListener('change', e => {
  if (e.target.matches('select') && e.target.id !== 'favoriteSelect') { presetTouched = true; applyPreset($('#sync').checked ? 'all' : activePane); }
});

addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); pickFile('.csv,.xlsx', loadDataFile); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); $('#applyBtn').click(); }
  if (e.key === 'Escape') $('#spec').close();
  const el = document.activeElement;
  const typing = el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type)));
  if (['1', '2', '3'].includes(e.key) && !typing && !$('#bench').hidden) setActivePane(Number(e.key) - 1);
});

// ドラッグ&ドロップ: CSV/xlsxはデータ、JSONはマスタとして読込
addEventListener('dragover', e => { e.preventDefault(); $('#start').classList.add('drag'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) $('#start').classList.remove('drag'); });
addEventListener('drop', async e => {
  e.preventDefault();
  $('#start').classList.remove('drag');
  for (const f of e.dataTransfer.files) {
    if (/\.json$/i.test(f.name)) await loadMasterFile(f);
    else if (/\.(csv|xlsx)$/i.test(f.name)) await loadDataFile(f);
    else toast('CSV / xlsx / JSON のみ対応です');
  }
});
