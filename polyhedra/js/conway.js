// conway.js — コンウェイの多面体表記（George Hart の方式）
// 例: "tI" = 切頂二十面体（サッカーボール）, "sC" = 変形立方体
import {
  add, sub, mul, dot, cross, len, unit, lerp, mid, centroid, newellNormal,
  buildEdges, normalize, convexHull,
} from './geom.js';

const PHI = (1 + Math.sqrt(5)) / 2;

// ---------- 種多面体 ----------
export function tetrahedron() {
  return { vertices: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], faces: [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]] };
}
export function cube() {
  return convexHull([[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]]);
}
export function octahedron() {
  return convexHull([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
}
export function icosahedron() {
  const p = [];
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) p.push([0, a, b], [a, b, 0], [b, 0, a]);
  return convexHull(p);
}
export function dodecahedron() {
  const p = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) p.push([a, b, c]);
  const ip = 1 / PHI;
  for (const a of [-ip, ip]) for (const b of [-PHI, PHI]) p.push([0, a, b], [a, b, 0], [b, 0, a]);
  return convexHull(p);
}

// 正 k 角形の環（辺長 1）
export const ringRadius = (k) => 1 / (2 * Math.sin(Math.PI / k));
export function ring(k, z = 0, phase = 0, R = ringRadius(k)) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const t = phase + (2 * Math.PI * i) / k;
    out.push([R * Math.cos(t), R * Math.sin(t), z]);
  }
  return out;
}

// 角柱・反角柱・角錐は面を明示的に構成（凸包だと n が大きいとき数値誤差に弱いため）
export function prism(n) {
  const v = [...ring(n, -0.5), ...ring(n, 0.5)];
  const faces = [];
  faces.push([...Array(n).keys()].reverse());
  faces.push([...Array(n).keys()].map((i) => i + n));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, j + n, i + n]);
  }
  return { vertices: v, faces };
}
export function antiprism(n) {
  const R = ringRadius(n);
  const h = Math.sqrt(Math.max(1e-9, 1 - 2 * R * R * (1 - Math.cos(Math.PI / n))));
  const v = [...ring(n, -h / 2), ...ring(n, h / 2, Math.PI / n)];
  const faces = [];
  faces.push([...Array(n).keys()].reverse());
  faces.push([...Array(n).keys()].map((i) => i + n));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, i + n]);
    faces.push([j, j + n, i + n]);
  }
  return { vertices: v, faces };
}
export function pyramid(n, h) {
  const R = ringRadius(n);
  if (h === undefined) h = n < 6 ? Math.sqrt(1 - R * R) : 1;
  const v = [...ring(n, 0), [0, 0, h]];
  const faces = [[...Array(n).keys()].reverse()];
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, n]);
  return { vertices: v, faces };
}

// ---------- フラグ構築器（polyHédronisme 方式） ----------
class Flags {
  constructor() { this.verts = new Map(); this.faces = new Map(); }
  v(name, pos) { if (!this.verts.has(name)) this.verts.set(name, pos); }
  f(face, a, b) {
    let m = this.faces.get(face);
    if (!m) { m = new Map(); this.faces.set(face, m); }
    m.set(a, b);
  }
  build() {
    const idx = new Map();
    const vertices = [];
    for (const [k, p] of this.verts) { idx.set(k, vertices.length); vertices.push(p); }
    const faces = [];
    for (const m of this.faces.values()) {
      const start = m.keys().next().value;
      const f = [];
      let cur = start, guard = 0;
      do {
        f.push(idx.get(cur));
        cur = m.get(cur);
        if (guard++ > 10000) throw new Error('flag loop');
      } while (cur !== start && cur !== undefined);
      if (f.length >= 3) faces.push(f);
    }
    return { vertices, faces };
  }
}

const faceCenters = (P) => P.faces.map((f) => centroid(f.map((i) => P.vertices[i])));
const faceNormals = (P) => P.faces.map((f) => newellNormal(f.map((i) => P.vertices[i])));

// 辺 → 反対側の面 の対応
function edgeFaceMap(P) {
  const m = new Map();
  P.faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) m.set(f[i] + '>' + f[(i + 1) % f.length], fi);
  });
  return m;
}

// ---------- 演算子 ----------
export function dual(P) {
  const fl = new Flags();
  const centers = faceCenters(P);
  // 面重心を球面上で反転（極双対の近似）
  centers.forEach((c, i) => {
    const r2 = dot(c, c);
    fl.v('f' + i, r2 > 1e-12 ? mul(c, 1 / r2) : c);
  });
  const efm = edgeFaceMap(P);
  P.faces.forEach((f, i) => {
    for (let k = 0; k < f.length; k++) {
      const a = f[k], b = f[(k + 1) % f.length];
      const other = efm.get(b + '>' + a);
      if (other === undefined) continue;
      fl.f('v' + a, 'f' + other, 'f' + i);
    }
  });
  return fl.build();
}

export function kis(P, heightFn) {
  const fl = new Flags();
  P.vertices.forEach((v, i) => fl.v('v' + i, v));
  const C = faceCenters(P), N = faceNormals(P);
  P.faces.forEach((f, i) => {
    let apex = C[i];
    if (typeof heightFn === 'function') apex = heightFn(i, C[i], N[i], f);
    else if (typeof heightFn === 'number') apex = add(C[i], mul(N[i], heightFn));
    fl.v('c' + i, apex);
    for (let k = 0; k < f.length; k++) {
      const a = f[k], b = f[(k + 1) % f.length];
      const fn = 'k' + i + '_' + a;
      fl.f(fn, 'v' + a, 'v' + b);
      fl.f(fn, 'v' + b, 'c' + i);
      fl.f(fn, 'c' + i, 'v' + a);
    }
  });
  return fl.build();
}

export function ambo(P) {
  const fl = new Flags();
  const mn = (a, b) => (a < b ? 'm' + a + '_' + b : 'm' + b + '_' + a);
  P.faces.forEach((f, i) => {
    for (let k = 0; k < f.length; k++) {
      const v1 = f[k], v2 = f[(k + 1) % f.length], v3 = f[(k + 2) % f.length];
      fl.v(mn(v1, v2), mid(P.vertices[v1], P.vertices[v2]));
      fl.f('o' + i, mn(v1, v2), mn(v2, v3));
      fl.f('d' + v2, mn(v2, v3), mn(v1, v2));
    }
  });
  return fl.build();
}

export function gyro(P) {
  const fl = new Flags();
  P.vertices.forEach((v, i) => fl.v('v' + i, v));
  const C = faceCenters(P);
  C.forEach((c, i) => fl.v('c' + i, c));
  P.faces.forEach((f, i) => {
    for (let k = 0; k < f.length; k++) {
      const v1 = f[k], v2 = f[(k + 1) % f.length], v3 = f[(k + 2) % f.length];
      fl.v(v1 + '~' + v2, lerp(P.vertices[v1], P.vertices[v2], 1 / 3));
      fl.v(v2 + '~' + v1, lerp(P.vertices[v2], P.vertices[v1], 1 / 3));
      fl.v(v2 + '~' + v3, lerp(P.vertices[v2], P.vertices[v3], 1 / 3));
      const fn = 'g' + i + '_' + v1;
      fl.f(fn, 'c' + i, v1 + '~' + v2);
      fl.f(fn, v1 + '~' + v2, v2 + '~' + v1);
      fl.f(fn, v2 + '~' + v1, 'v' + v2);
      fl.f(fn, 'v' + v2, v2 + '~' + v3);
      fl.f(fn, v2 + '~' + v3, 'c' + i);
    }
  });
  return fl.build();
}

// 面取り（chamfer）: 各辺が六角形になる
export function chamfer(P) {
  const fl = new Flags();
  P.vertices.forEach((v, i) => fl.v('v' + i, v));
  const C = faceCenters(P);
  const efm = edgeFaceMap(P);
  const inner = (fi, v) => 'i' + fi + '_' + v;
  P.faces.forEach((f, i) => {
    for (const v of f) fl.v(inner(i, v), lerp(P.vertices[v], C[i], 0.35));
    for (let k = 0; k < f.length; k++) {
      const a = f[k], b = f[(k + 1) % f.length];
      fl.f('in' + i, inner(i, a), inner(i, b));
      const g = efm.get(b + '>' + a);
      if (g === undefined) continue;
      if (a < b) {
        const hn = 'h' + a + '_' + b;
        // in_f(a) → v_a → in_g(a) → in_g(b) → v_b → in_f(b) → in_f(a)
        fl.f(hn, inner(i, b), inner(i, a));
        fl.f(hn, inner(i, a), 'v' + a);
        fl.f(hn, 'v' + a, inner(g, a));
        fl.f(hn, inner(g, a), inner(g, b));
        fl.f(hn, inner(g, b), 'v' + b);
        fl.f(hn, 'v' + b, inner(i, b));
      }
    }
  });
  return fl.build();
}

// プロペラ: 各面を回転した小面と、辺ごとの四角形に
export function propellor(P) {
  const fl = new Flags();
  P.vertices.forEach((v, i) => fl.v('v' + i, v));
  P.faces.forEach((f, i) => {
    for (let k = 0; k < f.length; k++) {
      const v1 = f[k], v2 = f[(k + 1) % f.length], v3 = f[(k + 2) % f.length];
      fl.v(v1 + '~' + v2, lerp(P.vertices[v1], P.vertices[v2], 1 / 3));
      fl.v(v2 + '~' + v1, lerp(P.vertices[v2], P.vertices[v1], 1 / 3));
      fl.v(v2 + '~' + v3, lerp(P.vertices[v2], P.vertices[v3], 1 / 3));
      fl.f('p' + i, v1 + '~' + v2, v2 + '~' + v3);
      const fn = 'q' + i + '_' + v2;
      fl.f(fn, v1 + '~' + v2, v2 + '~' + v1);
      fl.f(fn, v2 + '~' + v1, 'v' + v2);
      fl.f(fn, 'v' + v2, v2 + '~' + v3);
      fl.f(fn, v2 + '~' + v3, v1 + '~' + v2);
    }
  });
  return fl.build();
}

// 極双対（中球が単位球の正準形に対して厳密な双対を与える）
export function polarDual(P) {
  const N = faceNormals(P);
  const vertices = P.faces.map((f, i) => {
    const d = dot(N[i], P.vertices[f[0]]);
    return mul(N[i], 1 / d);
  });
  const efm = edgeFaceMap(P);
  // 各頂点まわりの面を順に辿る
  const around = new Map();
  P.faces.forEach((f, i) => {
    for (let k = 0; k < f.length; k++) {
      const a = f[k], b = f[(k + 1) % f.length];
      const other = efm.get(b + '>' + a);
      if (!around.has(a)) around.set(a, new Map());
      around.get(a).set(i, other);
    }
  });
  const faces = [];
  for (const [, m] of [...around.entries()].sort((x, y) => x[0] - y[0])) {
    const start = m.keys().next().value;
    const f = [];
    let cur = start, g = 0;
    do { f.push(cur); cur = m.get(cur); } while (cur !== start && cur !== undefined && g++ < 1000);
    faces.push(f.reverse());
  }
  return { vertices, faces };
}

// ---------- 正準化（Hart の反復法） ----------
// 全辺が単位球に接し、各面が平面、接点の重心が原点になるよう反復
export function canonicalize(P, iterations, tol = 1e-11) {
  let V = P.vertices.map((v) => v.slice());
  const { edges } = buildEdges(P);
  if (iterations === undefined) iterations = Math.round(Math.min(4000, Math.max(300, 4e6 / edges.length)));
  const F = P.faces;
  // 初期スケール: 辺の接点距離の平均を 1 に
  {
    const c = centroid(V);
    V = V.map((v) => sub(v, c));
    let s = 0;
    for (const e of edges) s += len(tangentPoint(V[e.a], V[e.b]));
    s /= edges.length;
    V = V.map((v) => mul(v, 1 / s));
  }
  const nV = V.length;
  for (let it = 0; it < iterations; it++) {
    const delta = V.map(() => [0, 0, 0]);
    const count = new Array(nV).fill(0);
    // 接線化
    let tc = [0, 0, 0];
    for (const e of edges) {
      const t = tangentPoint(V[e.a], V[e.b]);
      const r = len(t);
      const c = mul(t, (1 - r) / Math.max(r, 1e-9));
      delta[e.a] = add(delta[e.a], c); count[e.a]++;
      delta[e.b] = add(delta[e.b], c); count[e.b]++;
      tc = add(tc, t);
    }
    tc = mul(tc, 1 / edges.length);
    // 平面化
    const pd = V.map(() => [0, 0, 0]);
    const pc = new Array(nV).fill(0);
    for (const f of F) {
      const pts = f.map((i) => V[i]);
      const n = newellNormal(pts);
      const c = centroid(pts);
      for (const i of f) {
        const off = dot(sub(V[i], c), n);
        pd[i] = sub(pd[i], mul(n, off)); pc[i]++;
      }
    }
    let maxMove = 0;
    for (let i = 0; i < nV; i++) {
      let m = sub(mul(delta[i], 0.5 / Math.max(1, count[i])), tc);
      m = add(m, mul(pd[i], 0.8 / Math.max(1, pc[i])));
      V[i] = add(V[i], m);
      maxMove = Math.max(maxMove, len(m));
    }
    if (maxMove < tol) break;
  }
  return { ...P, vertices: V };
}

export function tangentPoint(a, b) {
  const d = sub(b, a);
  const t = -dot(a, d) / dot(d, d);
  return add(a, mul(d, t));
}

// 面の平面性のみを整える（ジオデシック等、球面性を保ちたい場合）
export function planarize(P, iterations = 400) {
  let V = P.vertices.map((v) => v.slice());
  for (let it = 0; it < iterations; it++) {
    const pd = V.map(() => [0, 0, 0]);
    const pc = new Array(V.length).fill(0);
    for (const f of P.faces) {
      const pts = f.map((i) => V[i]);
      const n = newellNormal(pts);
      const c = centroid(pts);
      for (const i of f) { pd[i] = sub(pd[i], mul(n, dot(sub(V[i], c), n))); pc[i]++; }
    }
    for (let i = 0; i < V.length; i++) V[i] = add(V[i], mul(pd[i], 0.8 / Math.max(1, pc[i])));
  }
  return { ...P, vertices: V };
}

// ---------- 表記の解釈 ----------
export const OPERATORS = {
  d: { ja: '双対', en: 'dual', fn: dual },
  a: { ja: '中点切断', en: 'ambo', fn: ambo },
  t: { ja: '切頂', en: 'truncate', fn: (P) => dual(kis(dual(P))) },
  k: { ja: '角錐化', en: 'kis', fn: (P) => kis(P) },
  j: { ja: '結合', en: 'join', fn: (P) => dual(ambo(P)) },
  e: { ja: '拡張', en: 'expand', fn: (P) => ambo(ambo(P)) },
  o: { ja: '直交', en: 'ortho', fn: (P) => dual(ambo(ambo(P))) },
  b: { ja: '面取切頂', en: 'bevel', fn: (P) => dual(kis(dual(ambo(P)))) },
  m: { ja: 'メタ', en: 'meta', fn: (P) => kis(dual(ambo(P))) },
  n: { ja: '針', en: 'needle', fn: (P) => kis(dual(P)) },
  z: { ja: 'ジップ', en: 'zip', fn: (P) => dual(kis(P)) },
  g: { ja: 'ジャイロ', en: 'gyro', fn: gyro },
  s: { ja: 'スナブ', en: 'snub', fn: (P) => dual(gyro(dual(P))) },
  c: { ja: '面取り', en: 'chamfer', fn: chamfer },
  p: { ja: 'プロペラ', en: 'propellor', fn: propellor },
};

export const SEEDS = {
  T: { ja: '正四面体', fn: tetrahedron },
  C: { ja: '立方体', fn: cube },
  O: { ja: '正八面体', fn: octahedron },
  D: { ja: '正十二面体', fn: dodecahedron },
  I: { ja: '正二十面体', fn: icosahedron },
  P: { ja: '角柱', fn: prism, n: true },
  A: { ja: '反角柱', fn: antiprism, n: true },
  Y: { ja: '角錐', fn: pyramid, n: true },
};

// "tkD" や "aP6" を解釈する。戻り値 { poly, ops, seed } または例外
export function parseNotation(str) {
  const s = str.replace(/\s+/g, '');
  const m = s.match(/^([a-z]*)([TCODIPAY])(\d*)$/);
  if (!m) throw new Error('表記を解釈できません: 例 tI, sC, aP6');
  const [, ops, seed, num] = m;
  for (const ch of ops) if (!OPERATORS[ch]) throw new Error('未知の演算子: ' + ch);
  const sd = SEEDS[seed];
  let n = 0;
  if (sd.n) {
    n = parseInt(num || '5', 10);
    if (!(n >= 3 && n <= 40)) throw new Error('n は 3〜40 で指定してください');
  } else if (num) throw new Error(seed + ' に数字は付けられません');
  return { ops, seed, n };
}

export function fromNotation(str, { canonical = true } = {}) {
  const { ops, seed, n } = parseNotation(str);
  let P = SEEDS[seed].n ? SEEDS[seed].fn(n) : SEEDS[seed].fn();
  // 右から順に適用
  for (let i = ops.length - 1; i >= 0; i--) {
    P = OPERATORS[ops[i]].fn(normalize(P));
    if (P.faces.length > 6000) throw new Error('面数が多すぎます（6000面まで）');
  }
  if (ops.length && canonical) {
    const C = canonicalize(P);
    // 発散した場合は正準化前の形を使う
    if (C.vertices.every((v) => v.every(Number.isFinite))) P = C;
  }
  return normalize(P);
}

export { PHI };
