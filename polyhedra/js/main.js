// main.js — Polyhedra Studio の画面制御
import { CATEGORIES, ALL_ITEMS, findItem } from './library.js';
import { fromNotation, parseNotation, OPERATORS, SEEDS } from './conway.js';
import { analyze, faceColors, classColor, PALETTES } from './analysis.js';
import { unfoldBest, decorate, foldHinges } from './unfold.js';
import { PAPERS, printableArea, layoutPages, pageSVG, toDXF, toOBJ, strutPageBody } from './netview.js';
import { Viewer3D } from './viewer3d.js';
import { POLYTOPES } from './four.js';
import { Mode4D, PROJECTIONS, MODELS } from './mode4d.js';

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

// ---------- 設定の保存（このブラウザのみ） ----------
const STORE_KEY = 'res-polyhedra-settings-v1';
const defaults = {
  view: 'split', palette: 'stella', colorMode: 'class', edgeColor: '#c4a265',
  faces: true, edges: true, vertices: false, opacity: 1, edgeWidth: 0.011, vertexSize: 0.024,
  paper: 'A4', orient: 'p', edgeMM: 25, tabMode: 'one', tabMM: 6, labels: true, colorNet: true, canonical: true,
  autoRotate: true,
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
  mode: '3d', model4: null,
};
const is4D = () => state.mode === '4d';
const CAT4 = { id: '4d', ja: '四次元ポリトープ', en: '4D polytopes', items: POLYTOPES, dim4: true };
const findAny = (id) => findItem(id) || POLYTOPES.find((p) => p.id === id);

// ---------- 3D ----------
const viewer = new Viewer3D($('gl'));
viewer.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const m4 = new Mode4D(viewer);

// ---------- 初期UI ----------
function initControls() {
  // 演算子チップ
  const opBox = $('op-chips');
  for (const [k, op] of Object.entries(OPERATORS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = k;
    b.title = `${op.ja}（${op.en}）— 現在の形に適用`;
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
    b.title = sd.ja + (sd.n ? '（例: ' + k + '6）' : '');
    b.addEventListener('click', () => {
      const inp = $('notation-input');
      const ops = (inp.value.match(/^[a-z]*/) || [''])[0];
      inp.value = ops + k + (sd.n ? '6' : '');
      loadNotation(inp.value);
    });
    seedBox.appendChild(b);
  }
  $('notation-form').addEventListener('submit', (e) => { e.preventDefault(); loadNotation($('notation-input').value); });

  // パレット・用紙
  for (const [k, p] of Object.entries(PALETTES)) $('palette').add(new Option(p.ja, k));
  for (const [k, p] of Object.entries(PAPERS)) $('paper').add(new Option(p.ja, k));

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
  for (const [k, p] of Object.entries(PROJECTIONS)) $('proj4').add(new Option(p.ja, k));
  for (const [k, p] of Object.entries(MODELS)) $('model4').add(new Option(p.ja, k));
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
  for (const b of document.querySelectorAll('.seg button')) {
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

  // 型紙操作
  $('btn-reunfold').addEventListener('click', () => { state.variant++; computeNet(); });
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

  window.addEventListener('hashchange', () => loadFromHash());
}

function setView(v) {
  settings.view = v; save();
  $('stage').dataset.view = v;
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-selected', String(b.dataset.view === v));
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
    det.open = !!query || ci < 3 || cat.items.some((it) => it === state.current?.item);
    det.innerHTML = `<summary>${cat.ja}<span class="en">${cat.en}</span><span class="n">${items.length}</span></summary>`;
    const ul = document.createElement('ul');
    ul.className = 'lib-items';
    for (const it of items) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lib-item';
      b.dataset.id = it.id;
      if (state.current?.item === it) b.setAttribute('aria-current', 'true');
      const nt = it.dim ? (it.schlafli || '') : it.notation || (it.param ? it.id + (it.param === 'f' ? '·f' : '·n') : it.id);
      b.innerHTML = `<span class="ja">${it.ja}</span><span class="en">${it.en}</span><span class="nt">${nt}</span>`;
      b.addEventListener('click', () => loadItem(it));
      li.appendChild(b);
      ul.appendChild(li);
    }
    det.appendChild(ul);
    box.appendChild(det);
  });
}

function markCurrent() {
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
    $('param-label').textContent = item.param === 'f' ? '分割数' : 'n（辺数）';
    $('param').min = min; $('param').max = max; $('param').value = param;
    $('param-out').textContent = param;
  } else {
    $('param-block').hidden = true;
  }
  state.current = { item, param };
  const name = item.param ? item.ja.replace('n', param).replace('nV', param + 'V') : item.ja;
  const notation = item.notation || (item.id === 'P' || item.id === 'A' || item.id === 'Y' || item.id === 'dA' ? item.id + param : '');
  build(() => item.build(param), name, item.en, notation, item.param ? item.id + param : item.id);
  markCurrent();
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
  msg.textContent = describeNotationJa(s);
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
  setTimeout(() => {
    try {
      const P = fn();
      state.P = P;
      state.an = analyze(P);
      state.title = name; state.titleEn = en; state.notation = notation;
      state.variant = 0;
      state.animFold = null;
      $('poly-name').textContent = name;
      $('poly-en').textContent = en;
      $('poly-notation').textContent = notation;
      $('poly-counts').textContent = `V ${state.an.V} · E ${state.an.E} · F ${state.an.F}`;
      if (notation) $('notation-input').value = notation;
      document.title = `${name} — Polyhedra Studio`;
      if (hash && location.hash.slice(1) !== hash) history.replaceState(null, '', '#' + hash);
      updateColors(false);
      computeNet(true);
      renderInfo();
    } catch (e) {
      console.error(e);
      const msg = $('notation-msg');
      msg.textContent = '形をつくれませんでした: ' + e.message;
      msg.classList.add('err');
    }
    showBusy(false);
  }, 16);
}

function updateColors(apply = true) {
  state.colors = faceColors(state.an, settings.palette, settings.colorMode);
  if (apply) viewer.setColors(state.colors);
}

// ---------- 型紙 ----------
function netOpts() {
  return {
    colors: state.colors, colorFaces: settings.colorNet, labels: settings.labels,
    title: state.title, notation: state.notation, edgeMM: settings[sizeKey()], sizeLabel: sizeLabel(),
    paper: settings.paper, landscape: settings.orient === 'l',
  };
}

function computeNet(newModel = false) {
  if (is4D()) { computeNet4(); return; }
  const { P, an } = state;
  if (!P) return;
  const scale = settings.edgeMM / an.emax; // mm / 単位
  const area = printableArea(settings.paper, settings.orient === 'l');
  const tabMM = settings.tabMode === 'none' ? 0 : settings.tabMM;
  const unf = unfoldBest(P, an, { maxW: area.w / scale, maxH: area.h / scale, margin: (tabMM + 1) / scale, variant: state.variant, tabH: tabMM / scale });
  state.unf = unf;
  state.dec = decorate(P, an, unf, { tabH: tabMM / scale, tabMode: settings.tabMode });
  state.layout = layoutPages(state.dec, { scale, paper: settings.paper, landscape: settings.orient === 'l' });
  // 3D の展開アニメーションは用紙の制約なしの展開（たいてい1枚）で見せる
  if (unf.pieces.length === 1) state.fold = foldHinges(P, an, unf);
  else {
    if (!state.animFold) state.animFold = foldHinges(P, an, unfoldBest(P, an, {}));
    state.fold = state.animFold;
  }
  if (newModel) viewer.setModel(P, an, state.colors, state.fold);
  else viewer.setFoldInfo(state.fold);
  renderNet();
  renderInfo();
}

function renderNet() {
  const box = $('net-pages');
  if (!state.layout) return;
  const { pages } = state.layout;
  const opt = netOpts();
  const { W, H } = printableArea(settings.paper, settings.orient === 'l');
  const scroll = $('net-scroll');
  const avail = Math.max(200, scroll.clientWidth - 40);
  const width = Math.min(avail, 760) * state.netZoom;
  box.style.width = width + 'px';
  box.innerHTML = pages.map((pg, i) => `
    <div class="net-sheet">
      <div class="sheet-head"><span>${i + 1} / ${pages.length} · ${PAPERS[settings.paper].ja}${settings.orient === 'l' ? '横' : '縦'} ${W}×${H} mm</span>
      <button type="button" data-svg-page="${i}">このページを SVG で保存</button></div>
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
  $('net-summary').innerHTML = `<b>${pieces}</b> ピース · <b>${pages.length}</b> ページ · のりしろ ${tabs}` +
    (missing > 0 ? ` · <span class="warn" title="切れ込みが狭く、のりしろが入らない辺です。テープで留めるか「別の展開」を試してください">のりしろなしの辺 ${missing}</span>` : '') +
    (over ? ' · <span class="warn">用紙からはみ出す部分があります。最長辺を小さくしてください</span>' : '');
}

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
  info.innerHTML = `<b>面 ${f + 1}</b> · ${cls.name} · 辺 ${lens.join(' / ')} mm · 面積 ${(an.areas[f] * scale * scale / 100).toFixed(2)} cm²`;
  info.hidden = false;
}

// ---------- 展開アニメーション ----------
let foldAnim = null;
function setFold(t) {
  if (is4D()) m4.setFold(t); else viewer.setFold(t);
  $('fold').value = Math.round(t * 1000);
  $('fold-out').textContent = Math.round(t * 100) + '%';
}
function stopFoldAnim() { if (foldAnim) cancelAnimationFrame(foldAnim.raf); foldAnim = null; playIcon(false); }
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
  const vc = an.vertexConfigs.slice(0, 8).map((v) => `<span title="${v.count} 頂点">${v.config}${an.vertexConfigs.length > 1 ? ' ×' + v.count : ''}</span>`).join('');
  const dh = an.dihedrals.slice(0, 8).map((d) => `<span title="${d.convex ? '凸（山折り）' : '凹（谷折り）'}">${d.deg.toFixed(2)}°${d.convex ? '' : ' 凹'} ×${d.count}</span>`).join('');
  const pages = state.layout ? state.layout.pages.length : 0;
  $('info').innerHTML = `
    <div class="info-grid">
      <div><b>${an.V}</b><span>頂点</span></div>
      <div><b>${an.E}</b><span>辺</span></div>
      <div><b>${an.F}</b><span>面</span></div>
      <div><b>${an.chi}</b><span>オイラー標数</span></div>
    </div>
    <p class="info-h">面の種類</p>
    <ul class="legend">${legend}</ul>
    ${vc ? `<p class="info-h">頂点配置</p><div class="tags">${vc}</div>` : ''}
    ${dh ? `<p class="info-h">二面角</p><div class="tags">${dh}${an.dihedrals.length > 8 ? '<span>…</span>' : ''}</div>` : ''}
    <p class="info-h">型紙で組んだときの大きさ</p>
    <dl class="kv">
      <dt>最長辺 / 最短辺</dt><dd>${fmt(an.emax * scale)} / ${fmt(an.emin * scale)} mm</dd>
      <dt>外接球の直径</dt><dd>${fmt(an.radius * 2 * scale)} mm</dd>
      <dt>表面積</dt><dd>${fmt(an.area * scale * scale / 100)} cm²</dd>
      ${an.volume ? `<dt>体積</dt><dd>${fmt(Math.abs(an.volume) * scale ** 3 / 1000)} cm³</dd>` : ''}
      <dt>用紙</dt><dd>${PAPERS[settings.paper].ja} × ${pages} 枚</dd>
    </dl>`;
  $('size-hint').textContent = `組み上がりの直径 約 ${fmt(an.radius * 2 * scale, 0)} mm`;
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
  if (!is4D()) return '最長辺';
  return settings.model4 === 'cells' ? '辺の長さ' : '外形の直径';
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
  m4.setSpin(false);
  $('spin4').checked = false;
  $('block-4d').hidden = true;
  $('notation-form').closest('.block').hidden = false;
  document.querySelector('label[for="fold"]').textContent = '展開';
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
    $('param-label').textContent = 'n（辺数）';
    $('param').min = min; $('param').max = max; $('param').value = param;
    $('param-out').textContent = param;
  } else {
    $('param-block').hidden = true;
  }
  stopFoldAnim();
  if (!is4D()) setFold(0);
  state.mode = '4d';
  viewer.fitAll = true;
  state.current = { item, param };
  state.P = null; state.an = null;
  $('block-4d').hidden = false;
  document.querySelector('label[for="fold"]').textContent = '3D展開';
  syncModeInputs(); sync4Rows();
  markCurrent();
  showBusy(true);
  setTimeout(() => {
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
      $('poly-name').textContent = name;
      $('poly-en').textContent = en;
      $('poly-notation').textContent = state.notation;
      const T = m4.T;
      $('poly-counts').textContent = `V ${T.V.length} · E ${T.edges.length} · F ${T.faces2.length} · C ${T.cells.length}`;
      document.title = `${name} — Polyhedra Studio`;
      const hash = item.param ? item.id + 'n' + param : item.id;
      if (location.hash.slice(1) !== hash) history.replaceState(null, '', '#' + hash);
      // 手前に置く胞の選択肢
      const sel = $('front4');
      sel.innerHTML = '';
      T.types.forEach((t, i) => sel.add(new Option(`${t.name}（${t.count}）`, i)));
      sel.value = m4.opts.frontType;
      computeNet4();
    } catch (e) {
      console.error(e);
      $('net-summary').textContent = 'つくれませんでした: ' + e.message;
    }
    showBusy(false);
  }, 16);
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
      ...opt, title: state.title,
      subtitle: `${PROJECTIONS[settings.proj4].ja} · 4次元回転 0° の標準投影 · 外形の直径 ${settings.size4D} mm`,
    });
    state.dec = [];
    state.layout = { pages: [{ items: [], svgBody: body }] };
  } else {
    state.dec = res.dec;
    state.layout = layoutPages(res.dec, { scale: res.scale, paper: settings.paper, landscape: settings.orient === 'l' });
  }
  renderNet();
  renderInfo4();
}

function summary4(pages) {
  const res = state.model4;
  if (!res) return;
  const warn = res.warn ? ` · <span class="warn">${res.warn}</span>` : '';
  if (res.strut) {
    $('net-summary').innerHTML = `部材 <b>${res.strut.rows.length}</b> 種類 · <b>${res.strut.edges}</b> 本 · 節点 ${res.strut.V}` + warn;
    return;
  }
  const over = pages.some((p) => p.items.some((it) => it.oversize));
  const parts = res.groups.reduce((s, g) => s + g.count, 0);
  $('net-summary').innerHTML = `型紙 <b>${res.groups.length}</b> 種類 · 部品 <b>${parts}</b> 個 · <b>${pages.length}</b> ページ` + warn +
    (over ? ' · <span class="warn">用紙からはみ出す部分があります。大きさを小さくしてください</span>' : '');
}

function hover4(f, from) {
  const info = $('hover-info');
  if (f < 0 || !m4.T || from === 'net') { viewer.setHighlight(-1); info.hidden = true; return; }
  viewer.setHighlight(m4.cellFaces(f));
  const ci = m4.faceCell[f];
  const c = m4.T.cells[ci];
  info.innerHTML = `<b>胞 ${ci + 1}</b> · ${m4.T.types[c.type].name}${ci === m4.front ? ' · 手前の胞' : ''}`;
  info.hidden = false;
}

function renderInfo4() {
  if (!m4.T) return;
  const res = state.model4;
  let model = '';
  if (res && res.groups) {
    model = `<p class="info-h">模型の部品</p><ul class="legend">` +
      res.groups.map((g) => `<li><span class="sw" style="background:${g.color}"></span><span>${g.label}　${g.name}</span><span class="ct">× ${g.count}</span></li>`).join('') + '</ul>';
  }
  $('info').innerHTML = m4.infoHTML(fmt) + model;
  const hints = {
    puzzle: '手前の胞が外殻になり、その中を残りの胞の部品で埋めます。',
    hull: '投影したときの外形（影の形）です。',
    cells: '本来の形の胞です。数をそろえて作り、3D展開図のように並べられます。',
    struts: '投影図を棒と節点で組むための部材表です。',
  };
  $('size-hint').textContent = hints[settings.model4] || '';
}

// ---------- 起動 ----------
initControls();
renderLibrary();
if (!loadFromHash()) loadItem(findItem('tI'));
window.addEventListener('resize', debounce(() => renderNet(), 200));
