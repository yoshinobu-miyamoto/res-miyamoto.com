// four.js — 四次元ポリトープ：胞の構成、4次元回転、3次元投影、胞の3D展開
import { convexHull, newellNormal } from './geom.js';
import { fromNotation, ringRadius } from './conway.js';

const PHI = (1 + Math.sqrt(5)) / 2;

// ---------- 4次元ベクトル ----------
export const add4 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
export const sub4 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
export const mul4 = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
export const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export const len4 = (a) => Math.sqrt(dot4(a, a));
export const unit4 = (a) => mul4(a, 1 / (len4(a) || 1));
const centroid4 = (pts) => mul4(pts.reduce((s, p) => add4(s, p), [0, 0, 0, 0]), 1 / pts.length);

// 3本の4次元ベクトルすべてに直交するベクトル（一般化外積）
export function cross4(a, b, c) {
  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const r = [];
  for (let i = 0; i < 4; i++) {
    const cols = [0, 1, 2, 3].filter((j) => j !== i);
    const m = [a, b, c].map((v) => cols.map((j) => v[j]));
    r.push((i % 2 === 0 ? 1 : -1) * det3(m));
  }
  return r;
}

// v に直交する正規直交基底（3本）
function basisOrthogonal(n) {
  const basis = [];
  const cand = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const nn = unit4(n);
  for (const c of cand) {
    let v = sub4(c, mul4(nn, dot4(c, nn)));
    for (const b of basis) v = sub4(v, mul4(b, dot4(v, b)));
    if (len4(v) > 1e-6) basis.push(unit4(v));
    if (basis.length === 3) break;
  }
  return basis;
}

// ---------- 頂点座標 ----------
function signs(v) {
  // すべての符号の組み合わせ（0 は符号なし）
  let out = [[]];
  for (const x of v) {
    const next = [];
    for (const o of out) {
      next.push([...o, x]);
      if (x !== 0) next.push([...o, -x]);
    }
    out = next;
  }
  return out;
}
function perms(v, evenOnly = false) {
  const out = [];
  const rec = (arr, rest, parity) => {
    if (!rest.length) { if (!evenOnly || parity === 0) out.push(arr); return; }
    rest.forEach((x, i) => {
      rec([...arr, x], [...rest.slice(0, i), ...rest.slice(i + 1)], (parity + i) % 2);
    });
  };
  rec([], v, 0);
  return out;
}
function uniq(pts) {
  const m = new Map();
  for (const p of pts) m.set(p.map((x) => Math.round(x * 1e6)).join(','), p);
  return [...m.values()];
}
const allPS = (v, even = false) => uniq(perms(v, even).flatMap(signs));

function simplex4() {
  // R^5 の標準基底を超平面 Σx=1 上で4次元座標に直す
  const E = [0, 1, 2, 3, 4].map((i) => [0, 1, 2, 3, 4].map((j) => (i === j ? 1 : 0) - 0.2));
  const B = [];
  for (const e of E.slice(0, 4)) {
    let v = e.slice();
    for (const b of B) { const d = v.reduce((s, x, k) => s + x * b[k], 0); v = v.map((x, k) => x - d * b[k]); }
    const l = Math.hypot(...v);
    B.push(v.map((x) => x / l));
  }
  return E.map((e) => B.map((b) => e.reduce((s, x, k) => s + x * b[k], 0)));
}

const VERTS = {
  '5C': () => simplex4(),
  '8C': () => allPS([1, 1, 1, 1]),
  '16C': () => allPS([1, 0, 0, 0]),
  '24C': () => allPS([1, 1, 0, 0]),
  '600C': () => uniq([
    ...allPS([0.5, 0.5, 0.5, 0.5]),
    ...allPS([1, 0, 0, 0]),
    ...allPS([PHI / 2, 0.5, 1 / (2 * PHI), 0], true),
  ]),
  '120C': () => {
    const s5 = Math.sqrt(5), p = PHI, ip = 1 / PHI, ip2 = 1 / (PHI * PHI), p2 = PHI * PHI;
    return uniq([
      ...allPS([0, 0, 2, 2]),
      ...allPS([1, 1, 1, s5]),
      ...allPS([ip2, p, p, p]),
      ...allPS([ip, ip, ip, p2]),
      ...allPS([0, ip2, 1, p2], true),
      ...allPS([0, ip, p, s5], true),
      ...allPS([ip, 1, p, 2], true),
    ]);
  },
  r5C: () => { const S = simplex4(); const o = []; for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) o.push(mul4(add4(S[i], S[j]), 0.5)); return o; },
  t5C: () => { const S = simplex4(); const o = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (i !== j) o.push(add4(mul4(S[i], 2 / 3), mul4(S[j], 1 / 3))); return o; },
  r8C: () => allPS([0, 1, 1, 1]),
  t8C: () => allPS([1, 1 + Math.SQRT2, 1 + Math.SQRT2, 1 + Math.SQRT2]),
  t16C: () => allPS([0, 0, 1, 2]),
  t24C: () => allPS([0, 1, 2, 3]),
};

function polyPrism(notation) {
  const P = fromNotation(notation);
  // 辺長 1 に合わせる
  const f = P.faces[0];
  const a = P.vertices[f[0]], b = P.vertices[f[1]];
  const s = 1 / Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const out = [];
  for (const v of P.vertices) out.push([v[0] * s, v[1] * s, v[2] * s, 0.5], [v[0] * s, v[1] * s, v[2] * s, -0.5]);
  return out;
}
function duoprism(p, q) {
  const Rp = ringRadius(p), Rq = ringRadius(q);
  const out = [];
  for (let i = 0; i < p; i++) for (let j = 0; j < q; j++) {
    const a = (2 * Math.PI * i) / p, b = (2 * Math.PI * j) / q;
    out.push([Rp * Math.cos(a), Rp * Math.sin(a), Rq * Math.cos(b), Rq * Math.sin(b)]);
  }
  return out;
}

// ---------- 名前付きポリトープ ----------
const N4 = (id, ja, en, verts, extra = {}) => ({ id, ja, en, dim: 4, verts, ...extra });
export const POLYTOPES = [
  N4('5C', '正五胞体', '5-cell (pentachoron)', VERTS['5C'], { schlafli: '{3,3,3}' }),
  N4('8C', '正八胞体', 'Tesseract (8-cell)', VERTS['8C'], { schlafli: '{4,3,3}' }),
  N4('16C', '正十六胞体', '16-cell', VERTS['16C'], { schlafli: '{3,3,4}' }),
  N4('24C', '正二十四胞体', '24-cell', VERTS['24C'], { schlafli: '{3,4,3}' }),
  N4('120C', '正百二十胞体', '120-cell', VERTS['120C'], { schlafli: '{5,3,3}' }),
  N4('600C', '正六百胞体', '600-cell', VERTS['600C'], { schlafli: '{3,3,5}' }),
  N4('r5C', '修正五胞体', 'Rectified 5-cell', VERTS.r5C, { schlafli: 'r{3,3,3}' }),
  N4('t5C', '切頂五胞体', 'Truncated 5-cell', VERTS.t5C, { schlafli: 't{3,3,3}' }),
  N4('r8C', '修正正八胞体', 'Rectified tesseract', VERTS.r8C, { schlafli: 'r{4,3,3}' }),
  N4('t8C', '切頂正八胞体', 'Truncated tesseract', VERTS.t8C, { schlafli: 't{4,3,3}' }),
  N4('t16C', '切頂正十六胞体', 'Truncated 16-cell', VERTS.t16C, { schlafli: 't{3,3,4}' }),
  N4('t24C', '切頂正二十四胞体', 'Truncated 24-cell', VERTS.t24C, { schlafli: 't{3,4,3}' }),
  N4('PT', '正四面体柱', 'Tetrahedral prism', () => polyPrism('T'), { schlafli: '{3,3}×{ }' }),
  N4('PO', '正八面体柱', 'Octahedral prism', () => polyPrism('O'), { schlafli: '{3,4}×{ }' }),
  N4('PD', '正十二面体柱', 'Dodecahedral prism', () => polyPrism('D'), { schlafli: '{5,3}×{ }' }),
  N4('PI', '正二十面体柱', 'Icosahedral prism', () => polyPrism('I'), { schlafli: '{3,5}×{ }' }),
  N4('PaC', '立方八面体柱', 'Cuboctahedral prism', () => polyPrism('aC'), { schlafli: 'r{4,3}×{ }' }),
  N4('PtI', '切頂二十面体柱', 'Truncated icosahedral prism', () => polyPrism('tI'), { schlafli: 't{3,5}×{ }' }),
  N4('DP', 'n-n デュオプリズム', 'n-n duoprism', (n) => duoprism(n, n), { param: 'n', def: 5, min: 3, max: 16, schlafli: '{n}×{n}' }),
  N4('DP3', '3-n デュオプリズム', '3-n duoprism', (n) => duoprism(3, n), { param: 'n', def: 8, min: 3, max: 24, schlafli: '{3}×{n}' }),
];

// ---------- 胞の構成 ----------
// 頂点（球面上・中心が原点）と最短距離の辺から、頂点図形を使って胞を求める
export function buildPolytope(V) {
  const nV = V.length;
  const R = Math.max(...V.map(len4));
  let dmin = Infinity;
  for (let i = 0; i < nV; i++) for (let j = i + 1; j < nV; j++) dmin = Math.min(dmin, len4(sub4(V[i], V[j])));
  const tol = dmin * 1e-5;
  const edges = [];
  const nb = V.map(() => []);
  for (let i = 0; i < nV; i++) for (let j = i + 1; j < nV; j++) {
    if (Math.abs(len4(sub4(V[i], V[j])) - dmin) < tol * 10) { edges.push([i, j]); nb[i].push(j); nb[j].push(i); }
  }

  const cellMap = new Map();
  const cells = [];
  for (let v = 0; v < nV; v++) {
    const a = unit4(mul4(V[v], -1));
    const B = basisOrthogonal(a);
    // 隣接頂点の方向を、v の反対向きの超平面へ中心投影 → 3次元の頂点図形
    const pts = nb[v].map((w) => {
      const u = sub4(V[w], V[v]);
      const s = mul4(u, 1 / dot4(u, a));
      return B.map((b) => dot4(s, b));
    });
    let H;
    try { H = convexHull(pts, 1e-9); } catch { continue; }
    for (const face of H.faces) {
      // 凸包の頂点 → 元の隣接頂点
      const idx = face.map((hi) => {
        const hp = H.vertices[hi];
        let best = -1, bd = Infinity;
        pts.forEach((p, k) => { const d = Math.hypot(p[0] - hp[0], p[1] - hp[1], p[2] - hp[2]); if (d < bd) { bd = d; best = k; } });
        return nb[v][best];
      });
      let N = cross4(sub4(V[idx[0]], V[v]), sub4(V[idx[1]], V[v]), sub4(V[idx[2]], V[v]));
      N = unit4(N);
      let off = dot4(N, V[v]);
      if (off < 0) { N = mul4(N, -1); off = -off; }
      const cv = [];
      for (let w = 0; w < nV; w++) if (Math.abs(dot4(N, V[w]) - off) < tol * 50) cv.push(w);
      const key = cv.join(',');
      if (cellMap.has(key)) continue;
      cellMap.set(key, cells.length);
      cells.push({ verts: cv, normal: N, offset: off });
    }
  }

  // 各胞の3次元形（胞の超平面内の座標）と面
  const faceMap = new Map();
  const faces2 = [];
  cells.forEach((c, ci) => {
    const center = centroid4(c.verts.map((i) => V[i]));
    const B = basisOrthogonal(c.normal);
    // 基底の向きを4次元の向きにそろえる（外向き法線と右手系）
    if (dot4(cross4(B[0], B[1], B[2]), c.normal) < 0) B[2] = mul4(B[2], -1);
    const local = c.verts.map((i) => { const d = sub4(V[i], center); return B.map((b) => dot4(d, b)); });
    const H = convexHull(local, 1e-9);
    const map = H.vertices.map((hp) => {
      let best = -1, bd = Infinity;
      local.forEach((p, k) => { const d = Math.hypot(p[0] - hp[0], p[1] - hp[1], p[2] - hp[2]); if (d < bd) { bd = d; best = k; } });
      return c.verts[best];
    });
    c.center = center;
    c.basis = B;
    c.faces = H.faces.map((f) => f.map((i) => map[i]));
    c.shape = { vertices: H.vertices, faces: H.faces }; // 実形（3D）
    c.faceIds = c.faces.map((f) => {
      const key = [...f].sort((x, y) => x - y).join(',');
      let fi = faceMap.get(key);
      if (fi === undefined) { fi = faces2.length; faceMap.set(key, fi); faces2.push({ verts: f, cells: [] }); }
      faces2[fi].cells.push(ci);
      return fi;
    });
  });

  // 胞の種類（合同類）
  const types = [];
  cells.forEach((c) => {
    const sig = shapeSignature(c.shape.vertices);
    let t = types.findIndex((x) => x.sig === sig);
    if (t < 0) { t = types.length; types.push({ sig, count: 0, rep: c, name: nameShape(c.shape) }); }
    types[t].count++;
    c.type = t;
  });
  // 多い順
  const order = types.map((t, i) => i).sort((a, b) => types[b].count - types[a].count || a - b);
  const remap = []; order.forEach((o, n) => (remap[o] = n));
  cells.forEach((c) => (c.type = remap[c.type]));
  const sortedTypes = order.map((i) => types[i]);

  // 胞どうしの角（胞二面角）
  const dihed = new Map();
  for (const f of faces2) {
    if (f.cells.length !== 2) continue;
    const [a, b] = f.cells;
    const ang = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot4(cells[a].normal, cells[b].normal))));
    const k = ((ang * 180) / Math.PI).toFixed(2);
    dihed.set(k, (dihed.get(k) || 0) + 1);
  }

  return {
    V, R, edgeLen: dmin, edges, cells, faces2, types: sortedTypes,
    dihedrals: [...dihed.entries()].map(([deg, count]) => ({ deg: +deg, count })).sort((x, y) => x.deg - y.deg),
    euler: nV - edges.length + faces2.length - cells.length,
  };
}

// 距離の多重集合による合同判定（鏡像は同一視）
export function shapeSignature(pts) {
  let dmax = 0;
  const d = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const x = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
    d.push(x); dmax = Math.max(dmax, x);
  }
  return pts.length + ':' + d.map((x) => Math.round(x * 1e4)).sort((a, b) => a - b).join(',');
}

const SHAPE_NAMES = {
  '4:4:3': '正四面体', '8:6:4': '立方体', '6:8:3': '正八面体', '20:12:5': '正十二面体', '12:20:3': '正二十面体',
  '12:14:3,4': '立方八面体', '12:8:3,6': '切頂四面体', '24:14:3,8': '切頂六面体', '24:14:4,6': '切頂八面体',
  '60:32:5,6': '切頂二十面体',
};
function nameShape(S) {
  const sides = [...new Set(S.faces.map((f) => f.length))].sort((a, b) => a - b);
  const key = `${S.vertices.length}:${S.faces.length}:${sides.join(',')}`;
  if (SHAPE_NAMES[key]) return SHAPE_NAMES[key];
  // 角柱
  if (S.faces.length === S.vertices.length / 2 + 2 && sides.includes(4)) {
    const n = S.vertices.length / 2;
    return n === 4 ? '立方体' : `正${n}角柱`;
  }
  return `${S.faces.length}面体`;
}

// ---------- 4次元回転・投影 ----------
// 4×4 行列（行優先の配列）
export const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mat4mul(A, B) {
  const C = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += A[i * 4 + k] * B[k * 4 + j];
    C[i * 4 + j] = s;
  }
  return C;
}
export const matVec = (M, v) => [0, 1, 2, 3].map((i) => M[i * 4] * v[0] + M[i * 4 + 1] * v[1] + M[i * 4 + 2] * v[2] + M[i * 4 + 3] * v[3]);
export function planeRotation(i, j, ang) {
  const M = I4();
  const c = Math.cos(ang), s = Math.sin(ang);
  M[i * 4 + i] = c; M[i * 4 + j] = -s; M[j * 4 + i] = s; M[j * 4 + j] = c;
  return M;
}
// 方向 a を +w 軸へ向ける回転（鏡映2回）
export function alignToW(a) {
  const u = unit4(a);
  const e = [0, 0, 0, 1];
  if (len4(sub4(u, e)) < 1e-9) return I4();
  const h = unit4(sub4(u, e));
  const H = I4().map((x, k) => x - 2 * h[Math.floor(k / 4)] * h[k % 4]);
  const F = I4(); F[0] = -1;
  return mat4mul(F, H);
}

// 投影の設定から、表示用の基準回転・視点距離を決める
// mode: 'schlegel' | 'persp-vertex' | 'ortho-cell' | 'ortho-vertex'
export function viewSetup(T, mode, frontType = 0, dist = 0.4) {
  const front = T.cells.find((c) => c.type === frontType) || T.cells[0];
  const vertexFirst = mode === 'persp-vertex' || mode === 'ortho-vertex';
  const axis = vertexFirst ? T.V[0] : front.normal;
  const B = alignToW(axis);
  let d = Infinity;
  let rf = 0, dmax = Infinity;
  if (mode === 'schlegel') {
    rf = front.offset;
    for (const c of T.cells) {
      if (c === front) continue;
      const nw = matVec(B, c.normal)[3];
      if (nw > 1e-9) dmax = Math.min(dmax, c.offset / nw);
    }
    if (!Number.isFinite(dmax)) dmax = T.R * 3;
    d = rf + (dmax - rf) * Math.max(0.02, Math.min(0.98, dist));
  } else if (mode === 'persp-vertex') {
    d = T.R * (1.15 + dist * 4);
  }
  return { B, d, front: T.cells.indexOf(front), perspective: Number.isFinite(d) };
}

export function project(p4, d, persp = 1) {
  if (!Number.isFinite(d) || persp <= 0) return [p4[0], p4[1], p4[2]];
  const k = 1 / Math.max(d - p4[3], d * 0.02);
  const f = (1 - persp) + persp * k * d;
  return [p4[0] * f, p4[1] * f, p4[2] * f];
}

// ---------- 胞の3D展開（4次元での「展開図」） ----------
function affCompose(A, B) {
  // (A∘B)(x) = A.M (B.M x + B.t) + A.t
  return { M: mat4mul(A.M, B.M), t: add4(matVec(A.M, B.t), A.t) };
}
const affApply = (A, x) => add4(matVec(A.M, x), A.t);

function hingeRotation(nC, nP, o, ang) {
  const c0 = Math.max(-1, Math.min(1, dot4(nC, nP)));
  const e1 = nC;
  let e2 = sub4(nP, mul4(nC, c0));
  const l = len4(e2);
  if (l < 1e-12) return { M: I4(), t: [0, 0, 0, 0] };
  e2 = mul4(e2, 1 / l);
  const c = Math.cos(ang), s = Math.sin(ang);
  const M = I4();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    M[i * 4 + j] += (c - 1) * (e1[i] * e1[j] + e2[i] * e2[j]) + s * (e2[i] * e1[j] - e1[i] * e2[j]);
  }
  return { M, t: sub4(o, matVec(M, o)) };
}

// 3次元の凸多面体どうしの重なり（分離軸）
function polyOverlap3(A, B, eps) {
  const axes = [...A.normals, ...B.normals];
  for (const ea of A.dirs) for (const eb of B.dirs) {
    const c = [ea[1] * eb[2] - ea[2] * eb[1], ea[2] * eb[0] - ea[0] * eb[2], ea[0] * eb[1] - ea[1] * eb[0]];
    const l = Math.hypot(...c);
    if (l > 1e-6) axes.push([c[0] / l, c[1] / l, c[2] / l]);
  }
  for (const ax of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of A.pts) { const d = p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2]; if (d < a0) a0 = d; if (d > a1) a1 = d; }
    for (const p of B.pts) { const d = p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2]; if (d < b0) b0 = d; if (d > b1) b1 = d; }
    if (Math.min(a1, b1) - Math.max(a0, b0) <= eps) return false;
  }
  return true;
}

// 根の胞から幅優先で広げ、3次元で重ならないように胞の木をつくる
export function unfoldCells(T, root = 0) {
  const nC = T.cells.length;
  let baseCell = T.cells[root];
  const toRoot3 = (p) => { const d = sub4(p, baseCell.center); return baseCell.basis.map((b) => dot4(d, b)); };
  const flat = new Array(nC).fill(null);  // 展開後の変換
  const parent = new Array(nC).fill(-1);
  const hinge = new Array(nC).fill(null);
  const placed3 = new Array(nC).fill(null);
  const eps = T.edgeLen * 1e-6;

  const shape3 = (ci, A) => {
    const c = T.cells[ci];
    const pts = c.verts.map((i) => toRoot3(affApply(A, T.V[i])));
    const idx = new Map(c.verts.map((v, k) => [v, k]));
    const normals = [];
    const dirs = [];
    for (const f of c.faces) {
      const fp = f.map((i) => pts[idx.get(i)]);
      normals.push(newellNormal(fp));
      for (let k = 0; k < fp.length; k++) {
        const a = fp[k], b = fp[(k + 1) % fp.length];
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const l = Math.hypot(...d);
        dirs.push([d[0] / l, d[1] / l, d[2] / l]);
      }
    }
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
    const cen = [cx / pts.length, cy / pts.length, cz / pts.length];
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p[0] - cen[0], p[1] - cen[1], p[2] - cen[2]));
    return { pts, normals, dirs, cen, r };
  };

  const pieces = [];
  const done = new Array(nC).fill(false);
  const pieceOf = new Array(nC).fill(-1);
  let nextRoot = root;
  while (nextRoot >= 0) {
    const pr = nextRoot;
    baseCell = T.cells[pr];
    const piece = { root: pr, cells: [pr], order: [pr] };
    pieces.push(piece);
    flat[pr] = { M: I4(), t: [0, 0, 0, 0] };
    placed3[pr] = shape3(pr, flat[pr]);
    done[pr] = true; pieceOf[pr] = pieces.length - 1;
    const queue = [pr];
    while (queue.length) {
      const ci = queue.shift();
      for (const fi of T.cells[ci].faceIds) {
        const other = T.faces2[fi].cells.find((x) => x !== ci);
        if (other === undefined || done[other]) continue;
        const P = T.cells[ci], C = T.cells[other];
        // 親の展開後の座標系で考える: 子を親の超平面へ回す蝶番
        const o = T.V[T.faces2[fi].verts[0]];
        const ang = Math.acos(Math.max(-1, Math.min(1, dot4(C.normal, P.normal))));
        const H = hingeRotation(C.normal, P.normal, o, ang);
        const A = affCompose(flat[ci], H);
        const s3 = shape3(other, A);
        let ok = true;
        for (const pc of piece.cells) {
          const q = placed3[pc];
          if (Math.hypot(q.cen[0] - s3.cen[0], q.cen[1] - s3.cen[1], q.cen[2] - s3.cen[2]) > q.r + s3.r) continue;
          if (polyOverlap3(q, s3, eps * 10)) { ok = false; break; }
        }
        if (!ok) continue;
        flat[other] = A; placed3[other] = s3;
        parent[other] = ci; hinge[other] = { o, ang, nC: C.normal, nP: P.normal };
        done[other] = true; pieceOf[other] = pieces.length - 1;
        piece.cells.push(other); piece.order.push(other);
        queue.push(other);
      }
    }
    nextRoot = done.indexOf(false);
  }
  return { root, parent, hinge, pieces, pieceOf, placed3 };
}

// 展開の度合い t における各胞の変換
export function foldTransforms(T, U, t) {
  const nC = T.cells.length;
  const out = new Array(nC).fill(null);
  for (const pc of U.pieces) {
    for (const ci of pc.order) {
      const p = U.parent[ci];
      if (p < 0) { out[ci] = { M: I4(), t: [0, 0, 0, 0] }; continue; }
      const h = U.hinge[ci];
      out[ci] = affCompose(out[p], hingeRotation(h.nC, h.nP, h.o, h.ang * t));
    }
  }
  return out;
}
export { affApply };
