// main.js — Hyperfolder の画面制御
import { CATEGORIES, ALL_ITEMS, findItem } from './library.js';
import { fromNotation, parseNotation, OPERATORS, SEEDS } from './conway.js';
import { analyze, faceColors, classColor, PALETTES } from './analysis.js';
import { unfoldBest, unfoldSymmetric, decorate, foldHinges } from './unfold.js';
import { PAPERS, printableArea, layoutPages, layoutBoard, paperEfficiency, pageSVG, toDXF, toOBJ, strutPageBody } from './netview.js';
import { Viewer3D } from './viewer3d.js';
import { POLYTOPES } from './four.js';
import { Mode4D, PROJECTIONS, MODELS } from './mode4d.js';
import { Demo } from './demo.js';
import { MobileUI } from './mobile.js';
import { VERSION } from './version.js';
import { L, isEn, onLang, setLang, applyStatic } from './i18n.js';

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

// ---------- 設定の保存（このブラウザのみ） ----------
const STORE_KEY = 'res-polyhedra-settings-v1';
const defaults = {
  view: 'split', palette: 'stella', colorMode: 'class', edgeColor: '#c4a265',
  faces: true, edges: true, vertices: false, opacity: 1, edgeWidth: 0.011, vertexSize: 0.024,
  paper: 'A4', orient: 'p', edgeMM: 25, tabMode: 'one', tabMM: 6, labels: true, colorNet: true, canonical: true,
  autoRotate: true,
  netView: 'screen', // 型紙パネル: 'screen'（対称性優先）| 'print'（面積効率優先）
  demoIdle: true,    // 一定時間操作がないとデモを再生
  // 四次元
  opacity4: 0.3, proj4: 'schlegel', dist4: 0.4, shrink4: 0.12, model4: 'puzzle', size4D: 150, size4C: 30,
};
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch { /* 保存不可の環境 */ }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* 無視 */ } };

const state = {
  current: null, // { item, param } または { notation }
  P: null, an: null, colors: null, unf: null, dec: null, layout: null, fold: null,
  variant: 0, netZoom: 1, title: '', titleEn: '', notation: '',
  mode: '3d', model4: null, dispVariant: 0,
};
const is4D = () => state.mode === '4d';
const CAT4 = { id: '4d', ja: '四次元ポリトープ', en: '4D polytopes', items: POLYTOPES, dim4: true };
const findAny = (id) => findItem(id) || POLYTOPES.find((p) => p.id === id);

// ---------- 3D ----------
const viewer = new Viewer3D($('gl'));
viewer.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const m4 = new Mode4D(viewer);
let mobileUI = null; // スマホ向けの操作パネル（起動時に作る）

// ---------- 初期UI ----------
function initControls() {
  // 演算子チップ
  const opBox = $('op-chips');
  for (const [k, op] of Object.entries(OPERATORS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = k;
    b.dataset.op = k;
    b.addEventListener('click', () => {
      const base = state.notation || 'C';
      const inp = $('notation-input');
      inp.value = k + base;
      loadNotation(inp.value);
    });
    opBox.appendChild(b);
  }
  const seedBox = $('seed-chips');
  for (const [k, sd] of Object.entries(SEEDS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = sd.n ? k + 'n' : k;
    b.dataset.seed = k;
    b.addEventListener('click', () => {
      const inp = $('notation-input');
      const ops = (inp.value.match(/^[a-z]*/) || [''])[0];
      inp.value = ops + k + (sd.n ? '6' : '');
      loadNotation(inp.value);
    });
    seedBox.appendChild(b);
  }
  titleChips();
  $('notation-form').addEventListener('submit', (e) => { e.preventDefault(); loadNotation($('notation-input').value); });

  // パレット・用紙
  for (const [k, p] of Object.entries(PALETTES)) $('palette').add(new Option(L(p.ja, p.en), k));
  for (const [k, p] of Object.entries(PAPERS)) $('paper').add(new Option(L(p.ja, p.en || p.ja), k));

  // 値の反映
  const bind = (id, key, { type = 'value', onChange, fmtOut } = {}) => {
    const el = $(id);
    if (type === 'checked') el.checked = !!settings[key];
    else el.value = settings[key];
    const out = $(id + '-out');
    const show = () => { if (out && fmtOut) out.textContent = fmtOut(settings[key]); };
    show();
    el.addEventListener(type === 'checked' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      let v = type === 'checked' ? el.checked : el.value;
      if (el.type === 'range' || el.type === 'number') v = parseFloat(v);
      if (el.type === 'number' && !Number.isFinite(v)) return;
      settings[key] = v; save(); show();
      onChange && onChange(v);
    });
  };
  const display = () => viewer.setOptions({
    faces: settings.faces, edges: settings.edges, vertices: settings.vertices, opacity: is4D() ? settings.opacity4 : settings.opacity,
    edgeWidth: settings.edgeWidth, vertexSize: settings.vertexSize, edgeColor: settings.edgeColor, autoRotate: settings.autoRotate,
  });
  bind('show-faces', 'faces', { type: 'checked', onChange: display });
  bind('show-edges', 'edges', { type: 'checked', onChange: display });
  bind('show-verts', 'vertices', { type: 'checked', onChange: display });
  // 不透明度と大きさは 3D / 4D で別々に覚える
  $('opacity').addEventListener('input', () => {
    settings[is4D() ? 'opacity4' : 'opacity'] = parseFloat($('opacity').value); save();
    syncModeInputs(); display();
  });
  $('edge-mm').addEventListener('input', () => {
    const v = parseFloat($('edge-mm').value);
    if (!Number.isFinite(v) || v <= 0) return;
    settings[sizeKey()] = v; save();
    renet();
  });
  state.display = display;
  bind('edge-w', 'edgeWidth', { onChange: display, fmtOut: (v) => (v * 100).toFixed(1) });
  bind('vert-s', 'vertexSize', { onChange: display, fmtOut: (v) => (v * 100).toFixed(1) });
  bind('edge-color', 'edgeColor', { onChange: display });
  const recolor = () => {
    if (is4D()) { m4.setOptions({ palette: settings.palette, colorMode: settings.colorMode }); computeNet(); return; }
    updateColors(); renderInfo(); renderNet();
  };
  bind('palette', 'palette', { onChange: recolor });
  bind('color-mode', 'colorMode', { onChange: recolor });
  const renet = debounce(() => computeNet(), 180);
  state.renet = renet;
  bind('paper', 'paper', { onChange: renet });
  bind('orient', 'orient', { onChange: renet });
  bind('tab-mode', 'tabMode', { onChange: renet });
  bind('tab-mm', 'tabMM', { onChange: renet });
  bind('labels', 'labels', { type: 'checked', onChange: () => renderNet() });
  bind('color-net', 'colorNet', { type: 'checked', onChange: () => renderNet() });
  bind('canonical', 'canonical', { type: 'checked', onChange: () => { if (state.current?.notation) loadNotation(state.current.notation); } });

  // 四次元
  for (const [k, p] of Object.entries(PROJECTIONS)) $('proj4').add(new Option(L(p.ja, p.en), k));
  for (const [k, p] of Object.entries(MODELS)) $('model4').add(new Option(L(p.ja, p.en), k));
  const remodel = debounce(() => { if (is4D()) computeNet(); }, 250);
  bind('proj4', 'proj4', { onChange: (v) => { m4.setOptions({ projection: v }); sync4Rows(); remodel(); } });
  bind('dist4', 'dist4', { onChange: (v) => { m4.setOptions({ dist: v }); remodel(); }, fmtOut: (v) => Math.round(v * 100) + '%' });
  bind('shrink4', 'shrink4', { onChange: (v) => m4.setOptions({ shrink: v }), fmtOut: (v) => Math.round(v * 100) + '%' });
  bind('model4', 'model4', { onChange: (v) => { m4.setOptions({ model: v }); syncModeInputs(); remodel(); } });
  $('front4').addEventListener('change', () => { m4.setOptions({ frontType: parseInt($('front4').value, 10) }); remodel(); });
  for (const k of ['xw', 'yw', 'zw']) {
    $('rot-' + k).addEventListener('input', () => {
      const deg = parseFloat($('rot-' + k).value);
      $('rot-' + k + '-out').textContent = deg + '°';
      m4.setRotation({ [k]: (deg * Math.PI) / 180 });
    });
  }
  $('spin4').addEventListener('change', () => m4.setSpin($('spin4').checked, showRot4));
  $('rot4-reset').addEventListener('click', () => {
    $('spin4').checked = false; m4.setSpin(false);
    m4.setRotation({ xw: 0, yw: 0, zw: 0 }); showRot4(m4.rot);
  });
  syncModeInputs();
  display();

  // 表示切り替え
  for (const b of document.querySelectorAll('.seg button[data-view]')) {
    b.addEventListener('click', () => setView(b.dataset.view));
  }
  setView(settings.view);

  // 3D ツール
  $('btn-spin').setAttribute('aria-pressed', String(settings.autoRotate));
  $('btn-spin').addEventListener('click', () => {
    settings.autoRotate = !settings.autoRotate; save();
    $('btn-spin').setAttribute('aria-pressed', String(settings.autoRotate));
    display();
  });
  $('btn-reset').addEventListener('click', () => viewer.resetView());
  $('btn-png').addEventListener('click', () => download(fileBase() + '.png', viewer.screenshot(2)));

  // 展開スライダー
  const fold = $('fold');
  fold.addEventListener('input', () => { stopFoldAnim(); setFold(fold.value / 1000); });
  $('btn-fold').addEventListener('click', toggleFoldAnim);
  for (const b of document.querySelectorAll('.fold-chips [data-fold]')) {
    b.addEventListener('click', () => animateFoldTo(parseFloat(b.dataset.fold)));
  }

  // 型紙操作
  for (const b of document.querySelectorAll('[data-netview]')) {
    b.addEventListener('click', () => { settings.netView = b.dataset.netview; save(); syncNetView(); renderNet(); });
  }
  syncNetView();
  $('btn-reunfold').addEventListener('click', () => {
    // いま見ている側の展開だけを変える
    if (settings.netView === 'screen') state.dispVariant++; else state.variant++;
    computeNet();
  });
  $('net-zoom-in').addEventListener('click', () => setNetZoom(state.netZoom * 1.25));
  $('net-zoom-out').addEventListener('click', () => setNetZoom(state.netZoom / 1.25));
  $('net-zoom-fit').addEventListener('click', () => setNetZoom(1));

  // 書き出し
  $('btn-print').addEventListener('click', printNet);
  $('btn-svg').addEventListener('click', exportSVG);
  $('btn-dxf').addEventListener('click', () => {
    if (!state.layout) return;
    download(fileBase() + '.dxf', 'data:application/dxf;charset=utf-8,' + encodeURIComponent(toDXF(state.layout, state.dec, netOpts())));
  });
  $('btn-obj').addEventListener('click', () => {
    if (is4D()) { download(fileBase() + '-projection.obj', 'data:text/plain;charset=utf-8,' + encodeURIComponent(toOBJ(m4.projectedOBJ(), state.titleEn))); return; }
    if (!state.P) return;
    download(fileBase() + '.obj', 'data:text/plain;charset=utf-8,' + encodeURIComponent(toOBJ(state.P, state.titleEn || state.title)));
  });

  // 形状パラメータ
  $('param').addEventListener('input', debounce(() => {
    const v = parseInt($('param').value, 10);
    $('param-out').textContent = v;
    if (state.current?.item) loadItem(state.current.item, v);
  }, 120));

  // 検索
  $('search').addEventListener('input', () => renderLibrary($('search').value));

  // 面のホバー連動（型紙 → 立体）
  const pages = $('net-pages');
  pages.addEventListener('pointerover', (e) => {
    const f = e.target?.dataset?.f;
    if (f !== undefined) hoverFace(parseInt(f, 10), 'net');
  });
  pages.addEventListener('pointerout', (e) => { if (e.target?.dataset?.f !== undefined) hoverFace(-1, 'net'); });
  viewer.onHover = (f) => hoverFace(f, '3d');

  bind('demo-idle', 'demoIdle', { type: 'checked' });
  window.addEventListener('hashchange', () => { if (location.hash === '#demo') startDemo(); else loadFromHash(); });
}

// 演算子・種のチップの説明
function titleChips() {
  for (const b of document.querySelectorAll('#op-chips [data-op]')) {
    const op = OPERATORS[b.dataset.op];
    b.title = L(`${op.ja}（${op.en}）— 現在の形に適用`, `${op.en} — apply to the current shape`);
  }
  for (const b of document.querySelectorAll('#seed-chips [data-seed]')) {
    const k = b.dataset.seed, sd = SEEDS[k];
    b.title = L(sd.ja + (sd.n ? '（例: ' + k + '6）' : ''), sd.en[0].toUpperCase() + sd.en.slice(1) + (sd.n ? ` (e.g. ${k}6)` : ''));
  }
}

// 選択肢の文言を言語に合わせる
function relabelOptions() {
  const set = (id, table) => { for (const o of $(id).options) { const p = table[o.value]; if (p) o.text = L(p.ja, p.en || p.ja); } };
  set('palette', PALETTES); set('paper', PAPERS); set('proj4', PROJECTIONS); set('model4', MODELS);
}

// 言語の切り替え
function syncLangUI() {
  const b = $('btn-lang');
  b.innerHTML = isEn() ? '<span class="l-full">日本語</span><span class="l-short">JA</span>' : 'EN';
  b.lang = isEn() ? 'ja' : 'en';
  b.title = isEn() ? '日本語表示に切り替え' : 'Switch to English';
  const sfx = isEn() ? '.en.html' : '.html';
  $('ver-chip').href = 'about' + sfx + '#history';
  for (const a of document.querySelectorAll('a[data-doc]')) a.href = a.dataset.doc + sfx;
  viewer.canvas?.setAttribute('aria-label', L('多面体の3D表示。ドラッグで回転、ホイールで拡大縮小', '3D view of the polyhedron. Drag to rotate, scroll to zoom'));
}
function relabelAll() {
  syncLangUI();
  titleChips(); relabelOptions();
  renderLibrary($('search').value);
  paramLabel(); foldLabel(); syncModeInputs(); frontOptions();
  $('btn-demo').querySelector('span').textContent = demo.running ? L('終了', 'Stop') : L('デモ', 'Demo');
  demo.caption();
  mobileUI?.relabel();
  if (state.title) renderTitle();
  const msg = $('notation-msg');
  if (state.current?.notation && !msg.classList.contains('err')) msg.textContent = L(describeNotationJa(state.current.notation), describeNotation(state.current.notation));
  if (is4D()) computeNet(); else if (state.an) { renderNet(); renderInfo(); }
}

function setView(v) {
  settings.view = v; save();
  $('stage').dataset.view = v;
  for (const b of document.querySelectorAll('.seg button[data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === v));
  if (v !== '3d') requestAnimationFrame(() => renderNet());
}

// ---------- ライブラリ ----------
function renderLibrary(q = '') {
  const box = $('library-list');
  box.innerHTML = '';
  const query = q.trim().toLowerCase();
  [...CATEGORIES, CAT4].forEach((cat, ci) => {
    const items = cat.items.filter((it) => !query || [it.ja, it.en, it.id, it.notation || ''].some((s) => s.toLowerCase().includes(query)));
    if (!items.length) return;
    const det = document.createElement('details');
    det.className = 'lib-cat' + (cat.dim4 ? ' dim4' : '');
    // 広い画面では主要な3種を開き、狭い画面では見出しだけを並べて見渡せるようにする
    const wide = window.matchMedia('(min-width: 921px)').matches;
    det.open = !!query || (wide && ci < 3) || cat.items.some((it) => it === state.current?.item);
    // 閉じているときは中身を一行で予告する（先頭の数件と残りの件数、選択中の項目）
    const cur = items.find((it) => it === state.current?.item);
    const head = items.slice(0, 3).map((it) => L(it.ja, it.en)).join(L('・', ', '));
    const rest = items.length > 3 ? L(` ほか ${items.length - 3}`, ` + ${items.length - 3} more`) : '';
    const peek = cur ? curPeek(cur) : `${head}${rest}`;
    det.innerHTML = `<summary><span class="mk" aria-hidden="true"></span><span class="ttl">${L(cat.ja, cat.en)}<span class="en">${L(cat.en, cat.ja)}</span></span><span class="n" title="${items.length}${L(' 項目', ' items')}">${items.length}</span><span class="peek">${peek}</span></summary>`;
    const ul = document.createElement('ul');
    ul.className = 'lib-items';
    for (const it of items) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lib-item';
      b.dataset.id = it.id;
      if (state.current?.item === it) b.setAttribute('aria-current', 'true');
      const nt = it.dim ? (it.schlafli || '') : it.notation || (it.param ? it.id + (it.param === 'f' ? '·f' : '·n') : it.id);
      b.innerHTML = `<span class="ja">${L(it.ja, it.en)}</span><span class="en">${L(it.en, it.ja)}</span><span class="nt">${nt}</span>`;
      b.addEventListener('click', () => loadItem(it));
      li.appendChild(b);
      ul.appendChild(li);
    }
    det.appendChild(ul);
    box.appendChild(det);
  });
}

const curPeek = (it) => `<span class="cur">${L('選択中: ', 'Selected: ')}${L(it.ja, it.en)}</span>`;

function markCurrent() {
  // 閉じたカテゴリの予告行にも選択中の項目を出す
  for (const det of document.querySelectorAll('.lib-cat')) {
    const peek = det.querySelector('.peek');
    const b = state.current?.item && det.querySelector(`.lib-item[data-id="${state.current.item.id}"]`);
    if (!peek) continue;
    if (!peek.dataset.base) peek.dataset.base = peek.querySelector('.cur') ? '' : peek.innerHTML;
    if (b) {
      peek.innerHTML = curPeek(state.current.item);
      // 選択中の項目を含むカテゴリは開いておく
      if (!det.open && !det.dataset.autoOpened) { det.open = true; det.dataset.autoOpened = '1'; }
    }
    else if (peek.dataset.base) peek.innerHTML = peek.dataset.base;
  }
  for (const b of document.querySelectorAll('.lib-item')) {
    b.toggleAttribute('aria-current', state.current?.item?.id === b.dataset.id);
    if (state.current?.item?.id === b.dataset.id) b.setAttribute('aria-current', 'true');
  }
}

// ---------- 読み込み ----------
function loadItem(item, param) {
  if (item.dim === 4) { load4D(item, param); return; }
  leave4D();
  if (item.param) {
    const min = item.min ?? 3, max = item.max ?? 16;
    if (param === undefined) param = state.current?.item === item ? state.current.param : item.def;
    param = Math.max(min, Math.min(max, param));
    $('param-block').hidden = false;
    $('param').min = min; $('param').max = max; $('param').value = param;
    $('param-out').textContent = param;
  } else {
    $('param-block').hidden = true;
  }
  state.current = { item, param };
  paramLabel();
  const name = item.param ? item.ja.replace('n', param).replace('nV', param + 'V') : item.ja;
  const notation = item.notation || (item.id === 'P' || item.id === 'A' || item.id === 'Y' || item.id === 'dA' ? item.id + param : '');
  build(() => item.build(param), name, enName(item, param), notation, item.param ? item.id + param : item.id);
  markCurrent();
}

// 英語名（n や分割数を入れる）
const GONAL = { 3: 'Triangular', 4: 'Square', 5: 'Pentagonal', 6: 'Hexagonal', 7: 'Heptagonal', 8: 'Octagonal', 9: 'Enneagonal', 10: 'Decagonal', 12: 'Dodecagonal' };
function enName(item, param) {
  if (!item.param) return item.en;
  if (item.param === 'f') return `${item.en} ${param}V`;
  return `${GONAL[param] || param + '-gonal'} ${item.en.toLowerCase()}`;
}
function paramLabel() {
  const it = state.current?.item;
  $('param-label').textContent = it?.param === 'f' ? L('分割数', 'Frequency') : L('n（辺数）', 'n (sides)');
}

function loadNotation(text) {
  const msg = $('notation-msg');
  const s = (text || '').replace(/\s+/g, '');
  try { parseNotation(s); } catch (e) { msg.textContent = e.message; msg.classList.add('err'); return; }
  msg.classList.remove('err');
  leave4D();
  // ライブラリの名前があれば使う
  const named = ALL_ITEMS.find((it) => it.notation === s);
  state.current = { notation: s, item: named };
  $('param-block').hidden = true;
  $('notation-input').value = s;
  build(() => fromNotation(s, { canonical: settings.canonical }), named ? named.ja : 'コンウェイ多面体', named ? named.en : describeNotation(s), s, s);
  msg.textContent = L(describeNotationJa(s), describeNotation(s));
  markCurrent();
}

function describeNotation(s) {
  const { ops, seed, n } = parseNotation(s);
  const seedName = { T: 'tetrahedron', C: 'cube', O: 'octahedron', D: 'dodecahedron', I: 'icosahedron', P: n + '-prism', A: n + '-antiprism', Y: n + '-pyramid' }[seed];
  return [...ops].map((o) => OPERATORS[o].en).join(' · ') + (ops ? ' of ' : '') + seedName;
}
function describeNotationJa(s) {
  const { ops, seed, n } = parseNotation(s);
  const sd = SEEDS[seed].ja.replace('角', n + '角');
  if (!ops) return sd;
  return sd + ' に ' + [...ops].reverse().map((o) => OPERATORS[o].ja).join(' → ');
}

function build(fn, name, en, notation, hash) {
  showBusy(true);
  const req = state.current; // 後から別の形が指定されたら、この結果は使わない
  setTimeout(() => {
    if (state.current !== req) return;
    try {
      const P = fn();
      state.P = P;
      state.an = analyze(P);
      state.title = name; state.titleEn = en; state.notation = notation;
      state.variant = 0;
      state.dispVariant = 0;
      renderTitle();
      $('poly-notation').textContent = notation;
      $('poly-counts').textContent = `V ${state.an.V} · E ${state.an.E} · F ${state.an.F}`;
      if (notation) $('notation-input').value = notation;
      // デモ中は #demo のままにする（再読み込みしてもデモが続くように）
      if (hash && location.hash.slice(1) !== hash && !keepDemoHash()) history.replaceState(null, '', '#' + hash);
      updateColors(false);
      computeNet(true);
      renderInfo();
    } catch (e) {
      console.error(e);
      const msg = $('notation-msg');
      msg.textContent = L('形をつくれませんでした: ', 'Could not build the shape: ') + e.message;
      msg.classList.add('err');
    }
    showBusy(false);
  }, 16);
}

// 名称の表示（英語表示では英語名を主に）
const titleText = () => L(state.title, state.titleEn || state.title);
function renderTitle() {
  $('poly-name').textContent = titleText();
  $('poly-en').textContent = L(state.titleEn, state.title);
  document.title = `${titleText()} — Hyperfolder`;
}

function updateColors(apply = true) {
  state.colors = faceColors(state.an, settings.palette, settings.colorMode);
  if (apply) viewer.setColors(state.colors);
}

// ---------- 型紙 ----------
function netOpts() {
  return {
    colors: state.colors, colorFaces: settings.colorNet, labels: settings.labels,
    title: titleText(), notation: state.notation, edgeMM: settings[sizeKey()], sizeLabel: sizeLabel(),
    paper: settings.paper, landscape: settings.orient === 'l',
  };
}

function computeNet(newModel = false) {
  if (is4D()) { computeNet4(); return; }
  const { P, an } = state;
  if (!P) return;
  const scale = settings.edgeMM / an.emax; // mm / 単位
  const area = printableArea(settings.paper, settings.orient === 'l');
  const landscape = settings.orient === 'l';
  const tabMM = settings.tabMode === 'none' ? 0 : settings.tabMM;
  const tabH = tabMM / scale;

  // 画面表示: 対称性を優先（用紙の制約なし）。3D の展開アニメーションも同じ展開を使う
  const disp = unfoldSymmetric(P, an, { tabH, tabMode: settings.tabMode, variant: state.dispVariant });
  state.disp = disp;
  state.dispDec = disp.dec;
  if (disp.symmetry.mirror) state.dispDec[0].forceAngle = Math.PI / 2 - disp.symmetry.axis;
  state.board = layoutBoard(state.dispDec, { scale });

  // 印刷: ページ数 → 部品数 → 用紙の使用率 の順に良いものを選ぶ（のりしろの欠けは最優先で避ける）
  const scoreFn = (res, missing) => {
    const dec = res.dec || decorate(P, an, res, { tabH, tabMode: settings.tabMode });
    const lay = layoutPages(dec, { scale, paper: settings.paper, landscape });
    const eff = paperEfficiency(dec, lay, scale, settings.paper, landscape);
    return missing * 1e9 + lay.pages.length * 1e7 + res.pieces.length * 1e5 + (1 - eff) * 1e4;
  };
  const unf = unfoldBest(P, an, { maxW: area.w / scale, maxH: area.h / scale, margin: (tabMM + 1) / scale, variant: state.variant, tabH, scoreFn });
  state.unf = unf;
  state.dec = decorate(P, an, unf, { tabH, tabMode: settings.tabMode });
  state.layout = layoutPages(state.dec, { scale, paper: settings.paper, landscape });
  state.efficiency = paperEfficiency(state.dec, state.layout, scale, settings.paper, landscape);
  state.fold = foldHinges(P, an, disp);
  if (newModel) viewer.setModel(P, an, state.colors, state.fold);
  else viewer.setFoldInfo(state.fold);
  renderNet();
  renderInfo();
}

function symText(sym) {
  if (!sym) return '—';
  if (sym.rot > 1 && sym.mirror) return L(`${sym.rot}回回転対称＋鏡映`, `${sym.rot}-fold rotation + mirror`);
  if (sym.rot > 1) return L(`${sym.rot}回回転対称`, `${sym.rot}-fold rotation`);
  if (sym.mirror) return L('鏡映対称', 'Mirror');
  return L('非対称', 'None');
}

function syncNetView() {
  for (const b of document.querySelectorAll('[data-netview]')) b.setAttribute('aria-selected', String(b.dataset.netview === settings.netView));
}

// 画面表示（対称性優先）の台紙を描く
function renderBoard() {
  const box = $('net-pages');
  const board = state.board;
  const dec = state.dispDec;
  if (!board || !dec) return false;
  const opt = netOpts();
  const scroll = $('net-scroll');
  const avail = Math.max(200, scroll.clientWidth - 40);
  const width = Math.min(avail, 760) * state.netZoom;
  box.style.width = width + 'px';
  const symAll = is4D() ? null : state.disp?.symmetry;
  box.innerHTML = `
    <div class="net-sheet">
      <div class="sheet-head"><span>${L('画面表示 · 対称性を優先', 'Screen · symmetry first')} · ${fmt(board.usedW, 0)}×${fmt(board.usedH, 0)} mm</span>
      <button type="button" data-goto-print>${L('印刷レイアウトを見る', 'See the print layout')}</button></div>
      ${pageSVG(board.pages[0], dec, board, { ...opt, board: board.board, interactive: true, footerNote: L('画面表示（対称性優先）。印刷は面積効率を優先した割付になります', 'Screen view (symmetry first). Printing uses a layout that saves paper') })}
    </div>`;
  box.querySelector('[data-goto-print]').addEventListener('click', () => { settings.netView = 'print'; save(); syncNetView(); renderNet(); });
  const pages = state.layout ? state.layout.pages.filter((p) => !p.svgBody).length : 0;
  const effTxt = state.efficiency ? L(`（用紙の使用率 ${Math.round(state.efficiency * 100)}%）`, ` (paper use ${Math.round(state.efficiency * 100)}%)`) : '';
  if (is4D()) {
    const res = state.model4;
    const syms = res && res.groups ? res.groups.map((g) => `${g.label} ${symText(g.symmetry)}`).join(' · ') : '';
    $('net-summary').innerHTML = `${L('画面表示', 'Screen')} · ${syms}` + (res && res.warn ? ` · <span class="warn">${res.warn}</span>` : '');
  } else {
    $('net-summary').innerHTML = L(`対称性 <b>${symText(symAll)}</b> · <b>${dec.length}</b> ピース · 印刷は ${pages} ページ${effTxt}`,
      `Symmetry <b>${symText(symAll)}</b> · <b>${dec.length}</b> ${dec.length === 1 ? 'piece' : 'pieces'} · prints on ${pages} ${pages === 1 ? 'page' : 'pages'}${effTxt}`);
  }
  return true;
}

function renderNet() {
  const box = $('net-pages');
  if (!state.layout) return;
  // 部材表は印刷と同じ1枚だけ
  const strut = is4D() && state.model4?.strut;
  if (settings.netView === 'screen' && !strut && renderBoard()) return;
  const { pages } = state.layout;
  const opt = netOpts();
  const { W, H } = printableArea(settings.paper, settings.orient === 'l');
  const scroll = $('net-scroll');
  const avail = Math.max(200, scroll.clientWidth - 40);
  const width = Math.min(avail, 760) * state.netZoom;
  box.style.width = width + 'px';
  box.innerHTML = pages.map((pg, i) => `
    <div class="net-sheet">
      <div class="sheet-head"><span>${i + 1} / ${pages.length} · ${paperName()} ${W}×${H} mm</span>
      <button type="button" data-svg-page="${i}">${L('このページを SVG で保存', 'Save this page as SVG')}</button></div>
      ${pageSVG(pg, state.dec, state.layout, { ...opt, pageNo: i + 1, pageCount: pages.length, interactive: true })}
    </div>`).join('');
  for (const b of box.querySelectorAll('[data-svg-page]')) {
    b.addEventListener('click', () => {
      const i = parseInt(b.dataset.svgPage, 10);
      const svg = pageSVG(pages[i], state.dec, state.layout, { ...opt, pageNo: i + 1, pageCount: pages.length });
      download(`${fileBase()}-p${i + 1}.svg`, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    });
  }
  if (is4D()) { summary4(pages); return; }
  const pieces = state.dec.length;
  const over = state.layout.pages.some((p) => p.items.some((it) => it.oversize));
  const tabs = state.dec.reduce((s, p) => s + p.tabs.length, 0);
  const cuts = state.dec.reduce((s, p) => s + p.labels.length, 0) / 2;
  const missing = settings.tabMode === 'none' ? 0 : cuts - tabs;
  const eff = Math.round((state.efficiency || 0) * 100);
  $('net-summary').innerHTML = L(`印刷 · <b>${pieces}</b> ピース · <b>${pages.length}</b> ページ · 用紙の使用率 <b>${eff}%</b> · のりしろ ${tabs}`,
    `Print · <b>${pieces}</b> ${pieces === 1 ? 'piece' : 'pieces'} · <b>${pages.length}</b> ${pages.length === 1 ? 'page' : 'pages'} · paper use <b>${eff}%</b> · ${tabs} tabs`) +
    (missing > 0 ? ` · <span class="warn" title="${L('切れ込みが狭く、のりしろが入らない辺です。テープで留めるか「別の展開」を試してください', 'These cuts are too tight for a tab. Use tape, or try Another net')}">${L('のりしろなしの辺', 'Edges without tabs:')} ${missing}</span>` : '') +
    (over ? ` · <span class="warn">${L('用紙からはみ出す部分があります。最長辺を小さくしてください', 'Some parts do not fit on the paper. Make the longest edge shorter')}</span>` : '');
}

const paperName = () => L(PAPERS[settings.paper].ja + (settings.orient === 'l' ? '横' : '縦'), (PAPERS[settings.paper].en || PAPERS[settings.paper].ja) + (settings.orient === 'l' ? ' landscape' : ' portrait'));

function setNetZoom(z) { state.netZoom = Math.max(0.4, Math.min(4, z)); renderNet(); }

// ---------- ホバー連動 ----------
let hlEls = [];
function hoverFace(f, from) {
  if (is4D()) { hover4(f, from); return; }
  viewer.setHighlight(f);
  for (const el of hlEls) el.classList.remove('hl');
  hlEls = [];
  const info = $('hover-info');
  if (f < 0 || !state.an) { info.hidden = true; return; }
  if (from !== 'net') {
    hlEls = [...document.querySelectorAll(`#net-pages polygon[data-f="${f}"]`)];
  } else {
    hlEls = [...document.querySelectorAll(`#net-pages polygon[data-f="${f}"]`)];
  }
  for (const el of hlEls) el.classList.add('hl');
  const an = state.an;
  const cls = an.classes[an.faceClass[f]];
  const scale = settings.edgeMM / an.emax;
  const face = state.P.faces[f];
  const lens = [...new Set(face.map((v, k) => {
    const e = an.edgeIndex.map.get(an.edgeIndex.key(v, face[(k + 1) % face.length]));
    return (e.length * scale).toFixed(1);
  }))];
  info.innerHTML = `<b>${L('面', 'Face')} ${f + 1}</b> · ${cls.name} · ${L('辺', 'edges')} ${lens.join(' / ')} mm · ${L('面積', 'area')} ${(an.areas[f] * scale * scale / 100).toFixed(2)} cm²`;
  info.hidden = false;
}

// ---------- 展開アニメーション ----------
let foldAnim = null;
function setFold(t) {
  if (is4D()) m4.setFold(t); else viewer.setFold(t);
  for (const b of document.querySelectorAll('.fold-chips [data-fold]')) b.setAttribute('aria-pressed', String(Math.abs(parseFloat(b.dataset.fold) - t) < 0.01));
  $('fold').value = Math.round(t * 1000);
  $('fold-out').textContent = Math.round(t * 100) + '%';
}
function stopFoldAnim() { if (foldAnim) cancelAnimationFrame(foldAnim.raf); foldAnim = null; playIcon(false); }
// 指定した度合いまで、なめらかに展開する（スマホの「閉・半・開」ボタン）
function animateFoldTo(to) {
  stopFoldAnim();
  const from = $('fold').value / 1000;
  if (Math.abs(to - from) < 0.001) return;
  const dur = 2200 * Math.abs(to - from) + 200;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    setFold(from + (to - from) * k);
    if (k < 1) foldAnim.raf = requestAnimationFrame(step); else stopFoldAnim();
  };
  foldAnim = { raf: requestAnimationFrame(step) };
}
function toggleFoldAnim() {
  if (foldAnim) { stopFoldAnim(); return; }
  const from = $('fold').value / 1000;
  const to = from > 0.5 ? 0 : 1;
  const dur = 2600 * Math.abs(to - from) + 200;
  const t0 = performance.now();
  playIcon(true);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    setFold(from + (to - from) * k);
    if (k < 1) foldAnim.raf = requestAnimationFrame(step); else stopFoldAnim();
  };
  foldAnim = { raf: requestAnimationFrame(step) };
}
function playIcon(playing) {
  $('btn-fold').innerHTML = playing
    ? '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>';
}

// ---------- 情報 ----------
function renderInfo() {
  if (is4D()) { renderInfo4(); return; }
  const an = state.an;
  if (!an) return;
  const scale = settings.edgeMM / an.emax;
  const legend = an.classes.map((c, i) => `<li><span class="sw" style="background:${classColor(an, i, settings.palette, settings.colorMode)}"></span><span>${c.name}</span><span class="ct">× ${c.count}</span></li>`).join('');
  const vc = an.vertexConfigs.slice(0, 8).map((v) => `<span title="${v.count}${L(' 頂点', ' vertices')}">${v.config}${an.vertexConfigs.length > 1 ? ' ×' + v.count : ''}</span>`).join('');
  const dh = an.dihedrals.slice(0, 8).map((d) => `<span title="${d.convex ? L('凸（山折り）', 'Convex (mountain fold)') : L('凹（谷折り）', 'Concave (valley fold)')}">${d.deg.toFixed(2)}°${d.convex ? '' : L(' 凹', ' concave')} ×${d.count}</span>`).join('');
  const pages = state.layout ? state.layout.pages.length : 0;
  $('info').innerHTML = `
    <div class="info-grid">
      <div><b>${an.V}</b><span>${L('頂点', 'vertices')}</span></div>
      <div><b>${an.E}</b><span>${L('辺', 'edges')}</span></div>
      <div><b>${an.F}</b><span>${L('面', 'faces')}</span></div>
      <div><b>${an.chi}</b><span>${L('オイラー標数', 'Euler χ')}</span></div>
    </div>
    <p class="info-h">${L('面の種類', 'Face types')}</p>
    <ul class="legend">${legend}</ul>
    ${vc ? `<p class="info-h">${L('頂点配置', 'Vertex configurations')}</p><div class="tags">${vc}</div>` : ''}
    ${dh ? `<p class="info-h">${L('二面角', 'Dihedral angles')}</p><div class="tags">${dh}${an.dihedrals.length > 8 ? '<span>…</span>' : ''}</div>` : ''}
    <p class="info-h">${L('型紙で組んだときの大きさ', 'Size of the paper model')}</p>
    <dl class="kv">
      <dt>${L('最長辺 / 最短辺', 'Longest / shortest edge')}</dt><dd>${fmt(an.emax * scale)} / ${fmt(an.emin * scale)} mm</dd>
      <dt>${L('外接球の直径', 'Circumsphere diameter')}</dt><dd>${fmt(an.radius * 2 * scale)} mm</dd>
      <dt>${L('表面積', 'Surface area')}</dt><dd>${fmt(an.area * scale * scale / 100)} cm²</dd>
      ${an.volume ? `<dt>${L('体積', 'Volume')}</dt><dd>${fmt(Math.abs(an.volume) * scale ** 3 / 1000)} cm³</dd>` : ''}
      <dt>${L('用紙', 'Paper')}</dt><dd>${L(PAPERS[settings.paper].ja, PAPERS[settings.paper].en || PAPERS[settings.paper].ja)} × ${pages}${L(' 枚', pages === 1 ? ' sheet' : ' sheets')}</dd>
    </dl>`;
  $('size-hint').textContent = L(`組み上がりの直径 約 ${fmt(an.radius * 2 * scale, 0)} mm`, `Assembled diameter about ${fmt(an.radius * 2 * scale, 0)} mm`);
}

// ---------- 書き出し ----------
function fileBase() {
  return (state.titleEn || state.notation || 'polyhedron').replace(/\s*\(.*?\)\s*/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'polyhedron';
}

function download(name, url) {
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

function exportSVG() {
  if (!state.layout) return;
  const opt = netOpts();
  const { W, H } = printableArea(settings.paper, settings.orient === 'l');
  const pages = state.layout.pages;
  const gap = 10;
  const total = pages.length * H + (pages.length - 1) * gap;
  const inner = pages.map((pg, i) => {
    const svg = pageSVG(pg, state.dec, state.layout, { ...opt, pageNo: i + 1, pageCount: pages.length })
      .replace(/^<svg[^>]*>/, `<svg x="0" y="${i * (H + gap)}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    return svg;
  }).join('');
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${total}mm" viewBox="0 0 ${W} ${total}">${inner}</svg>`;
  download(fileBase() + '-net.svg', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc));
}

function printNet() {
  if (!state.layout) return;
  const opt = netOpts();
  const { W, H } = printableArea(settings.paper, settings.orient === 'l');
  const pages = state.layout.pages;
  $('print-root').innerHTML = pages.map((pg, i) => `<div class="print-page">${pageSVG(pg, state.dec, state.layout, { ...opt, pageNo: i + 1, pageCount: pages.length })}</div>`).join('');
  $('page-style').textContent = `@page { size: ${W}mm ${H}mm; margin: 0; }`;
  window.print();
}

// ---------- ユーティリティ ----------
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function showBusy(on) { $('busy').hidden = !on; }

function loadFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return false;
  const direct = findAny(h);
  if (direct && !direct.param) { loadItem(direct); return true; }
  const m4h = h.match(/^(.+)n(\d+)$/);
  if (m4h) {
    const it = POLYTOPES.find((p) => p.id === m4h[1]);
    if (it && it.param) { loadItem(it, parseInt(m4h[2], 10)); return true; }
  }
  const m = h.match(/^([A-Za-z]+?)(\d+)$/);
  if (m) {
    const it = findItem(m[1]);
    if (it && it.param) { loadItem(it, parseInt(m[2], 10)); return true; }
  }
  try { parseNotation(h); loadNotation(h); return true; } catch { return false; }
}

// ---------- 四次元 ----------
function sizeKey() {
  if (!is4D()) return 'edgeMM';
  return settings.model4 === 'cells' ? 'size4C' : 'size4D';
}
function sizeLabel() {
  if (!is4D()) return L('最長辺', 'Longest edge');
  return settings.model4 === 'cells' ? L('辺の長さ', 'Edge length') : L('外形の直径', 'Overall diameter');
}
function syncModeInputs() {
  $('edge-mm-label').textContent = sizeLabel();
  $('edge-mm').value = settings[sizeKey()];
  const op = is4D() ? settings.opacity4 : settings.opacity;
  $('opacity').value = op;
  $('opacity-out').textContent = Math.round(op * 100) + '%';
}
function sync4Rows() {
  const p = settings.proj4;
  $('row-front4').hidden = p === 'persp-vertex' || p === 'ortho-vertex';
  $('row-dist4').hidden = p === 'ortho-cell' || p === 'ortho-vertex';
}
function showRot4(r) {
  for (const k of ['xw', 'yw', 'zw']) {
    const deg = Math.round((r[k] * 180) / Math.PI);
    $('rot-' + k).value = deg;
    $('rot-' + k + '-out').textContent = deg + '°';
  }
}

function leave4D() {
  if (!is4D()) return;
  state.mode = '3d';
  viewer.fitAll = false;
  mobileUI?.set4D(false);
  m4.setSpin(false);
  $('spin4').checked = false;
  $('block-4d').hidden = true;
  $('notation-form').closest('.block').hidden = false;
  foldLabel();
  stopFoldAnim(); setFold(0);
  syncModeInputs();
  state.display();
}

function load4D(item, param) {
  if (item.param) {
    const min = item.min ?? 3, max = item.max ?? 16;
    if (param === undefined) param = state.current?.item === item ? state.current.param : item.def;
    param = Math.max(min, Math.min(max, param));
    $('param-block').hidden = false;
    $('param').min = min; $('param').max = max; $('param').value = param;
    $('param-out').textContent = param;
  } else {
    $('param-block').hidden = true;
  }
  stopFoldAnim();
  if (!is4D()) setFold(0);
  state.mode = '4d';
  viewer.fitAll = true;
  mobileUI?.set4D(true);
  state.current = { item, param };
  paramLabel();
  state.P = null; state.an = null;
  $('block-4d').hidden = false;
  foldLabel();
  syncModeInputs(); sync4Rows();
  markCurrent();
  showBusy(true);
  const req = state.current; // 後から別の形が指定されたら、この結果は使わない
  setTimeout(() => {
    if (state.current !== req) return;
    try {
      viewer.setFold(0);
      Object.assign(m4.opts, {
        projection: settings.proj4, dist: settings.dist4, shrink: settings.shrink4, model: settings.model4,
        palette: settings.palette, colorMode: settings.colorMode,
      });
      m4.load(item, param);
      m4.setFold($('fold').value / 1000);
      state.display();
      const name = item.param ? item.ja.replaceAll('n', param) : item.ja;
      const en = item.param ? item.en.replaceAll('n', param) : item.en;
      state.title = name; state.titleEn = en; state.notation = item.schlafli ? item.schlafli.replaceAll('n', param) : '';
      renderTitle();
      $('poly-notation').textContent = state.notation;
      const T = m4.T;
      $('poly-counts').textContent = `V ${T.V.length} · E ${T.edges.length} · F ${T.faces2.length} · C ${T.cells.length}`;
      const hash = item.param ? item.id + 'n' + param : item.id;
      if (location.hash.slice(1) !== hash && !keepDemoHash()) history.replaceState(null, '', '#' + hash);
      // 手前に置く胞の選択肢
      frontOptions();
      computeNet4();
    } catch (e) {
      console.error(e);
      $('net-summary').textContent = L('つくれませんでした: ', 'Could not build: ') + e.message;
    }
    showBusy(false);
  }, 16);
}

function foldLabel() { document.querySelector('label[for="fold"]').textContent = is4D() ? L('3D展開', '3D net') : L('展開', 'Unfold'); }
function frontOptions() {
  if (!m4.T) return;
  const sel = $('front4');
  sel.innerHTML = '';
  m4.T.types.forEach((t, i) => sel.add(new Option(`${t.name}${L('（', ' (')}${t.count}${L('）', ')')}`, i)));
  sel.value = m4.opts.frontType;
}

function computeNet4() {
  if (!m4.T) return;
  const opt = {
    paper: settings.paper, landscape: settings.orient === 'l', sizeMM: settings[sizeKey()],
    tabMode: settings.tabMode, tabMM: settings.tabMM,
  };
  const res = m4.buildModel(opt);
  state.model4 = res;
  if (res.strut) {
    const body = strutPageBody(res.strut, {
      ...opt, title: titleText(),
      subtitle: L(`${PROJECTIONS[settings.proj4].ja} · 4次元回転 0° の標準投影 · 外形の直径 ${settings.size4D} mm`,
        `${PROJECTIONS[settings.proj4].en} · standard projection at 4D rotation 0° · overall diameter ${settings.size4D} mm`),
    });
    state.dec = [];
    state.layout = { pages: [{ items: [], svgBody: body }] };
  } else {
    state.dec = res.dec;
    state.layout = layoutPages(res.dec, { scale: res.scale, paper: settings.paper, landscape: settings.orient === 'l' });
    state.efficiency = paperEfficiency(res.dec, state.layout, res.scale, settings.paper, settings.orient === 'l');
    state.dispDec = res.dispDec;
    state.board = layoutBoard(res.dispDec, { scale: res.scale });
  }
  renderNet();
  renderInfo4();
}

function summary4(pages) {
  const res = state.model4;
  if (!res) return;
  const warn = res.warn ? ` · <span class="warn">${res.warn}</span>` : '';
  if (res.strut) {
    $('net-summary').innerHTML = L(`部材 <b>${res.strut.rows.length}</b> 種類 · <b>${res.strut.edges}</b> 本 · 節点 ${res.strut.V}`,
      `<b>${res.strut.rows.length}</b> strut lengths · <b>${res.strut.edges}</b> struts · ${res.strut.V} nodes`) + warn;
    return;
  }
  const over = pages.some((p) => p.items.some((it) => it.oversize));
  const parts = res.groups.reduce((s, g) => s + g.count, 0);
  const eff = Math.round((state.efficiency || 0) * 100);
  $('net-summary').innerHTML = L(`印刷 · 型紙 <b>${res.groups.length}</b> 種類 · 部品 <b>${parts}</b> 個 · <b>${pages.length}</b> ページ · 用紙の使用率 <b>${eff}%</b>`,
    `Print · <b>${res.groups.length}</b> net types · <b>${parts}</b> parts · <b>${pages.length}</b> ${pages.length === 1 ? 'page' : 'pages'} · paper use <b>${eff}%</b>`) + warn +
    (over ? ` · <span class="warn">${L('用紙からはみ出す部分があります。大きさを小さくしてください', 'Some parts do not fit on the paper. Make the model smaller')}</span>` : '');
}

function hover4(f, from) {
  const info = $('hover-info');
  if (f < 0 || !m4.T || from === 'net') { viewer.setHighlight(-1); info.hidden = true; return; }
  viewer.setHighlight(m4.cellFaces(f));
  const ci = m4.faceCell[f];
  const c = m4.T.cells[ci];
  info.innerHTML = `<b>${L('胞', 'Cell')} ${ci + 1}</b> · ${m4.T.types[c.type].name}${ci === m4.front ? L(' · 手前の胞', ' · front cell') : ''}`;
  info.hidden = false;
}

function renderInfo4() {
  if (!m4.T) return;
  const res = state.model4;
  let model = '';
  if (res && res.groups) {
    model = `<p class="info-h">${L('模型の部品', 'Model parts')}</p><ul class="legend">` +
      res.groups.map((g) => `<li><span class="sw" style="background:${g.color}"></span><span>${g.label}　${g.name}</span><span class="ct">× ${g.count}</span></li>`).join('') + '</ul>';
  }
  $('info').innerHTML = m4.infoHTML(fmt) + model;
  const hints = isEn() ? {
    puzzle: 'The front cell becomes the outer shell; the other cells fill it as puzzle pieces.',
    hull: 'The outline of the projection — the shape of its shadow.',
    cells: 'The cells in their true shape. Make the right number of each and arrange them like the 3D net.',
    struts: 'A list of struts and nodes for building the projection as a stick model.',
  } : {
    puzzle: '手前の胞が外殻になり、その中を残りの胞の部品で埋めます。',
    hull: '投影したときの外形（影の形）です。',
    cells: '本来の形の胞です。数をそろえて作り、3D展開図のように並べられます。',
    struts: '投影図を棒と節点で組むための部材表です。',
  };
  $('size-hint').textContent = hints[settings.model4] || '';
}

// ---------- デモ・モード（自己紹介） ----------
// デモ中（と #demo で開いた直後の準備中）は URL を #demo のままにする
const keepDemoHash = () => document.body.classList.contains('demo') || document.body.dataset.keepHash === '1';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let demoPrev = null;
const waitReady = (item) => new Promise((resolve) => {
  const t0 = performance.now();
  const poll = () => {
    const ready = $('busy').hidden && state.current?.item === item;
    if (ready || performance.now() - t0 > 20000) resolve(); else setTimeout(poll, 50);
  };
  setTimeout(poll, 30);
});
const demo = new Demo({
  async load(id, param, view) {
    const it = findAny(id);
    if (!it) return;
    loadItem(it, param);
    await waitReady(it);
    viewer.resetView();
    if (view) viewer.setOrientation(view);
  },
  setFold: (t) => setFold(t),
  setSpin4: (on) => { m4.setSpin(on, showRot4); $('spin4').checked = on; },
  rot4Zero: () => { m4.setRotation({ xw: 0, yw: 0, zw: 0 }); showRot4(m4.rot); },
  enter() {
    // デモ前の状態を覚えておき、終了時に戻す
    demoPrev = { view: settings.view, current: state.current ? { ...state.current } : null };
    stopFoldAnim();
    document.body.classList.add('demo');
    $('btn-demo').querySelector('span').textContent = L('終了', 'Stop');
    setView('3d');
    viewer.setOptions({ autoRotate: true });
    hoverFace(-1, '3d');
    window.scrollTo(0, 0);
  },
  leave() {
    document.body.classList.remove('demo');
    delete document.body.dataset.keepHash;
    $('btn-demo').querySelector('span').textContent = L('デモ', 'Demo');
    setFold(0);
    if (demoPrev) {
      setView(demoPrev.view);
      const c = demoPrev.current;
      if (c?.notation) loadNotation(c.notation);
      else if (c?.item) loadItem(c.item, c.param);
    }
    state.display();
    viewer.resetView();
  },
}, $('demo-overlay'));

let lastActivity = performance.now();
let demoStartedAt = 0;
let demoPointer = null;
function startDemo() {
  if (demo.running) return;
  demoStartedAt = performance.now();
  demoPointer = null;
  demo.start();
}
function stopDemo(e) {
  demo.stop();
  lastActivity = performance.now();
  // 終了のためのクリックが、下にあるボタンなどに届かないようにする
  if (e && (e.type === 'pointerdown' || e.type === 'touchstart')) {
    const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', block, { capture: true }), 500);
  }
}
const onActivity = (e) => {
  lastActivity = performance.now();
  if (!demo.running || performance.now() - demoStartedAt < 900) return;
  if (e.type === 'pointermove') {
    // 小さな手ぶれでは終了しない
    if (!demoPointer) { demoPointer = [e.clientX, e.clientY]; return; }
    if (Math.hypot(e.clientX - demoPointer[0], e.clientY - demoPointer[1]) < 40) return;
  }
  stopDemo(e);
};
for (const t of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
  window.addEventListener(t, onActivity, { capture: true, passive: true });
}
// 操作がないまま一定時間たったら自動で始める
setInterval(() => {
  if (demo.running || !settings.demoIdle || reduceMotion) return;
  if (document.visibilityState !== 'visible' || !$('busy').hidden || foldAnim) return;
  if (performance.now() - lastActivity > 90000) startDemo();
}, 3000);
$('btn-demo').addEventListener('click', (e) => {
  e.stopPropagation();
  if (demo.running) stopDemo(); else startDemo();
});

// ---------- 起動 ----------
initControls();
renderLibrary();
mobileUI = new MobileUI();
$('ver-chip').textContent = 'v' + VERSION;
applyStatic();
syncLangUI();
mobileUI.relabel();
$('btn-lang').addEventListener('click', () => setLang(isEn() ? 'ja' : 'en'));
onLang(relabelAll);
if (location.hash === '#demo') {
  document.body.dataset.keepHash = '1';
  loadItem(findItem('tI'));
  setTimeout(startDemo, 800);
} else if (!loadFromHash()) loadItem(findItem('tI'));
window.addEventListener('resize', debounce(() => renderNet(), 200));
