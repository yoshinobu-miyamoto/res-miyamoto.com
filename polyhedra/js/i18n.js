// i18n.js — 日本語／英語の切り替え
// ・固定の文言（HTML）は、日本語の文言をキーにした対訳表で置き換える（元に戻せるよう原文を覚えておく）
// ・計算結果などの動的な文言は、表示するときに L(日本語, 英語) で選ぶ
// 言語は ?lang=en / ?lang=ja、保存された設定、端末の言語の順に決める。

const KEY = 'hyperfolder-lang';
const listeners = [];
let current = detect();

function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ja') return q;
  } catch { /* 無視 */ }
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'en' || s === 'ja') return s;
  } catch { /* 保存できない環境 */ }
  return (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export const lang = () => current;
export const isEn = () => current === 'en';
/** 現在の言語の文言を返す */
export const L = (ja, en) => (current === 'en' ? en : ja);
/** 対訳表にあれば英語に（日本語表示ではそのまま） */
export const T = (ja) => (current === 'en' && STATIC[ja] !== undefined ? STATIC[ja] : ja);

export function onLang(cb) { listeners.push(cb); }

export function setLang(l) {
  if (l !== 'en' && l !== 'ja') return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* 無視 */ }
  // URL に ?lang= があれば合わせて書き換える（再読み込みで戻らないように）
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); history.replaceState(null, '', u); }
  } catch { /* 無視 */ }
  document.documentElement.lang = l;
  applyStatic();
  for (const cb of listeners) cb(l);
}

// ---------- 固定の文言 ----------
const original = new WeakMap(); // ノード → 日本語の原文
const ATTRS = ['title', 'placeholder', 'aria-label'];

export function applyStatic(root = document.body) {
  document.documentElement.lang = current;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const ja = original.has(n) ? original.get(n) : n.nodeValue;
    const key = ja.trim();
    if (!key || STATIC[key] === undefined) continue;
    if (!original.has(n)) original.set(n, ja);
    n.nodeValue = current === 'en' ? ja.replace(key, STATIC[key]) : ja;
  }
  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    let store = original.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const ja = store && store[a] !== undefined ? store[a] : el.getAttribute(a);
      if (STATIC[ja] === undefined) continue;
      if (!store) { store = {}; original.set(el, store); }
      store[a] = ja;
      el.setAttribute(a, current === 'en' ? STATIC[ja] : ja);
    }
  }
}

// 日本語 → 英語
export const STATIC = {
  // ヘッダー
  'デモ': 'Demo', '終了': 'Stop', '立体': '3D', '分割': 'Split', '展開図': 'Net',
  'res-miyamoto.com へ戻る': 'Back to res-miyamoto.com',
  '概要と改版履歴': 'Overview & release history',
  '代表例を自動で見せる自己紹介モード（クリックやキーで終了）': 'Self-introduction that plays showcase examples (click or press a key to stop)',
  '表示の切り替え': 'View',
  '日本語表示に切り替え': 'Switch to Japanese',
  '英語表示に切り替え': 'Switch to English',
  // ライブラリ
  '多面体ライブラリ': 'Polyhedron library',
  'コンウェイ表記': 'Conway notation', '作成': 'Make',
  '例: tI, sC, dkD': 'e.g. tI, sC, dkD',
  '演算子（左に追加）': 'Operators (added on the left)', '種多面体': 'Seeds',
  '正準化（辺を中球に接し、面を平面に整える）': 'Canonicalize (edges tangent to the midsphere, faces planar)',
  '名前・表記で検索': 'Search by name or notation', 'ライブラリを検索': 'Search the library',
  '使い方': 'How to',
  '左の一覧から形を選ぶか、コンウェイ表記を入力します。': 'Pick a shape from the list, or type Conway notation.',
  '「型紙」で用紙と最長辺の長さを決めます。': 'Under Paper model, choose the paper size and the longest edge.',
  '「印刷 / PDF」で実寸（100%）印刷。実線で切り、破線で折り、同じ番号の辺どうしを貼り合わせます。': 'Print at actual size (100%) with Print / PDF. Cut the solid lines, fold the dashed lines, and glue edges with the same number.',
  '「四次元ポリトープ」では、シュレーゲル図などの3次元投影を4次元回転できます。模型は、投影した胞を組み合わせる立体パズル、投影の外形、胞の実形、棒模型の部材表から選べます。': 'Under 4D polytopes you can rotate Schlegel diagrams and other 3D projections in four dimensions. Models: a puzzle of projected cells, the projection hull, the true cells, or a strut list.',
  '回転': 'Rotate', 'ドラッグ（はじくと回り続けます）': 'Drag (flick to keep it spinning)',
  '拡大・縮小': 'Zoom', 'ホイール / ピンチ': 'Wheel / pinch',
  '視点リセット': 'Reset view', 'ダブルクリック': 'Double-click',
  '面の対応': 'Matching faces', '面にカーソルを置く': 'Hover a face',
  '解説': 'Docs', '詳細技術解説': 'Technical notes',
  'ヘッダーの「デモ」で代表例を自動再生。URL の末尾に #demo を付けると、開いてすぐ始まります（展示用）': 'Demo in the header plays showcase examples. Add #demo to the URL to start it on load (for exhibitions).',
  // 立体表示
  '立体表示': '3D view', '自動回転': 'Auto-rotate', '視点をリセット（ダブルクリックでも可）': 'Reset view (or double-click)',
  '画像（PNG）を保存': 'Save image (PNG)', '展開アニメーション': 'Unfold animation', '展開の度合い': 'Unfold amount',
  '展開': 'Unfold', '3D展開': '3D net', '閉': 'Closed', '半': 'Half', '開': 'Open',
  'ハイパーフォールダー — 次元のあいだを旅する': 'Hyperfolder — travel between dimensions',
  '三次元の多面体と四次元のポリトープを眺め、': 'Explore 3D polyhedra and 4D polytopes,',
  '展開し、紙でふたたび折り上げる。': 'unfold them, and fold them again in paper.',
  'クリック・キー・タップでデモを終了': 'Click, press a key or tap to stop the demo',
  // 型紙パネル
  '型紙の表示': 'Net view', '画面（対称）': 'Screen (symmetric)', '印刷（面積効率）': 'Print (efficient)',
  '対称性を優先した展開図。3Dの展開アニメーションと同じ形です': 'A net chosen for symmetry; the same one the 3D unfold animation uses',
  '用紙の枚数と無駄が少ない割付。印刷・SVG・DXF はこの形で書き出します': 'A layout that uses fewer sheets and less paper; print, SVG and DXF use it',
  '別の展開': 'Another net', '別の切り開き方を試す': 'Try a different way to cut it open',
  '縮小': 'Zoom out', '幅に合わせる': 'Fit width', '拡大': 'Zoom in', '計算中…': 'Computing…',
  '印刷レイアウトを見る': 'See the print layout', 'このページを SVG で保存': 'Save this page as SVG',
  // 設定
  '設定': 'Settings', '形状': 'Shape', '分割数': 'Frequency', 'n（辺数）': 'n (sides)',
  '四次元': '4D', '投影': 'Projection', '手前の胞': 'Front cell', '視点の距離': 'Eye distance', '胞の縮小': 'Cell shrink',
  '4次元回転': '4D rotation', 'XW 平面': 'XW plane', 'YW 平面': 'YW plane', 'ZW 平面': 'ZW plane',
  '4次元で回し続ける': 'Keep rotating in 4D', '回転を 0° に戻す': 'Reset rotation to 0°', '模型': 'Model',
  '「展開」スライダーで、胞が3次元の展開図に開きます。模型は4次元回転 0° の標準投影から作ります。': 'The unfold control opens the cells into a 3D net. Models are made from the standard projection with 4D rotation at 0°.',
  '表示': 'Display', '面': 'Faces', '辺': 'Edges', '頂点': 'Vertices',
  '不透明度': 'Opacity', '辺の太さ': 'Edge width', '頂点の大きさ': 'Vertex size',
  '配色': 'Palette', '色分け': 'Coloring', '合同な面ごと': 'By congruent face', '辺の数ごと': 'By number of sides', '単色': 'Single color',
  '辺の色': 'Edge color', '金': 'Gold', '墨': 'Ink', '白': 'White',
  '90秒操作がないとデモを再生': 'Play the demo after 90 s without input',
  '型紙': 'Paper model', '用紙': 'Paper', '用紙の向き': 'Orientation', '縦': 'Portrait', '横': 'Landscape',
  '最長辺': 'Longest edge', '辺の長さ': 'Edge length', '外形の直径': 'Overall diameter',
  'のりしろ': 'Glue tabs', '片側に付ける': 'On one side', '付けない': 'None', 'のりしろ幅': 'Tab width',
  '辺の番号': 'Edge numbers', '面に色を付けて印刷': 'Print faces in color',
  '書き出し': 'Export', '印刷 / PDF': 'Print / PDF',
  'カッティングマシン・CAD 用（CUT / MOUNTAIN / VALLEY レイヤー）': 'For cutting machines and CAD (CUT / MOUNTAIN / VALLEY layers)',
  '3D モデル（Rhino・SketchUp・Blender など）': '3D model (Rhino, SketchUp, Blender, etc.)',
  '印刷は「実際のサイズ（100%）」で。フッターの 50 mm バーで倍率を確認できます。': 'Print at “Actual size (100%)”. Check the scale with the 50 mm bar in the footer.',
  '情報': 'Info',
  // スマホ
  '操作パネル': 'Controls', '操作の種類': 'Sections', 'パネルを広げる': 'Enlarge panel', 'パネルを縮める': 'Shrink panel',
  'パネルを広げる／縮める': 'Enlarge / shrink panel', '減らす': 'Decrease', '増やす': 'Increase',
  '形': 'Shape', '書出': 'Export',
};
