// geom.js — 多面体の基本データ構造とベクトル演算
// Polyhedron: { vertices: [[x,y,z], ...], faces: [[i,j,k,...], ...] }
// 面は外側から見て反時計回り（右手系で外向き法線）とする。

export const EPS = 1e-9;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => len(sub(a, b));
export const unit = (a) => {
  const l = len(a);
  return l < 1e-300 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mid = (a, b) => lerp(a, b, 0.5);

export function centroid(pts) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return mul(c, 1 / pts.length);
}

// Newell 法による面法線（非平面でも安定）
export function newellNormal(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return unit(n);
}

export const facePoints = (poly, f) => poly.faces[f].map((i) => poly.vertices[i]);
export const faceNormal = (poly, f) => newellNormal(facePoints(poly, f));
export const faceCentroid = (poly, f) => centroid(facePoints(poly, f));

export function faceArea(pts) {
  const n = newellNormal(pts);
  let s = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) s = add(s, cross(pts[i], pts[(i + 1) % pts.length]));
  return Math.abs(dot(s, n)) / 2;
}

export function clonePoly(p) {
  return { ...p, vertices: p.vertices.map((v) => v.slice()), faces: p.faces.map((f) => f.slice()) };
}

const ekey = (a, b) => (a < b ? a + ',' + b : b + ',' + a);

// 辺リストと面隣接を構築する
// edges[k] = { a, b, faces: [f (a→b の向き), g (b→a の向き)] }
export function buildEdges(poly) {
  const map = new Map();
  const edges = [];
  poly.faces.forEach((face, fi) => {
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const k = ekey(a, b);
      let e = map.get(k);
      if (!e) {
        e = { a: Math.min(a, b), b: Math.max(a, b), faces: [], sides: [] };
        map.set(k, e);
        edges.push(e);
      }
      e.faces.push(fi);
      e.sides.push(i); // その面での辺の位置（face[i] → face[i+1]）
    }
  });
  return { edges, map, key: ekey };
}

// 頂点数・辺数で単位を揃える: 中心を原点、外接球半径 1
export function normalize(poly, mode = 'radius') {
  const c = centroid(poly.vertices);
  let vs = poly.vertices.map((v) => sub(v, c));
  let s = 1;
  if (mode === 'radius') {
    s = 1 / Math.max(...vs.map(len));
  } else if (mode === 'edge') {
    const { edges } = buildEdges(poly);
    let m = 0;
    for (const e of edges) m = Math.max(m, dist(vs[e.a], vs[e.b]));
    s = 1 / m;
  }
  vs = vs.map((v) => mul(v, s));
  return { ...poly, vertices: vs };
}

// 面の向きを外向きに揃える（凸に近い形状を想定: 重心からの方向で判定）
export function orientOutward(poly) {
  const c = centroid(poly.vertices);
  const faces = poly.faces.map((f) => {
    const pts = f.map((i) => poly.vertices[i]);
    const n = newellNormal(pts);
    return dot(n, sub(centroid(pts), c)) < 0 ? f.slice().reverse() : f;
  });
  return { ...poly, faces };
}

// 体積（発散定理）
export function volume(poly) {
  let v = 0;
  for (const f of poly.faces) {
    const p0 = poly.vertices[f[0]];
    for (let i = 1; i + 1 < f.length; i++) {
      v += dot(p0, cross(poly.vertices[f[i]], poly.vertices[f[i + 1]]));
    }
  }
  return v / 6;
}

export function surfaceArea(poly) {
  let s = 0;
  for (let f = 0; f < poly.faces.length; f++) s += faceArea(facePoints(poly, f));
  return s;
}

// 3x3 一次方程式（平面3枚の交点） n_i · x = d_i
export function intersectPlanes(planes) {
  if (planes.length === 3) {
    const [p1, p2, p3] = planes;
    const det = dot(p1.n, cross(p2.n, p3.n));
    if (Math.abs(det) < 1e-12) return null;
    let x = mul(cross(p2.n, p3.n), p1.d);
    x = add(x, mul(cross(p3.n, p1.n), p2.d));
    x = add(x, mul(cross(p1.n, p2.n), p3.d));
    return mul(x, 1 / det);
  }
  // 最小二乗: (Σ n nᵀ) x = Σ n d
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const b = [0, 0, 0];
  for (const { n, d } of planes) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) A[i][j] += n[i] * n[j];
      b[i] += n[i] * d;
    }
  }
  return solve3(A, b);
}

export function solve3(A, b) {
  const det = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-14) return null;
  const r = [];
  for (let k = 0; k < 3; k++) {
    const M = A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)));
    r.push(det(M) / D);
  }
  return r;
}

// 軸 axis（単位ベクトル）を z 軸に合わせる回転を返す
export function rotationToZ(axis) {
  const z = [0, 0, 1];
  const a = unit(axis);
  const c = dot(a, z);
  if (c > 1 - 1e-12) return (v) => v.slice();
  if (c < -1 + 1e-12) return (v) => [v[0], -v[1], -v[2]];
  const k = unit(cross(a, z));
  const s = Math.sqrt(1 - c * c);
  return (v) => rotateAxis(v, k, c, s);
}

// ロドリゲスの回転公式
export function rotateAxis(v, k, c, s) {
  const kv = cross(k, v);
  const kd = dot(k, v);
  return [
    v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
    v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
    v[2] * c + kv[2] * s + k[2] * kd * (1 - c),
  ];
}

// ---------------------------------------------------------------
// 3次元凸包（逐次追加法）＋ 同一平面の三角形を多角形に統合
// ---------------------------------------------------------------
export function convexHull(points, tol = 1e-7) {
  // 重複点を除去
  const pts = [];
  for (const p of points) {
    if (!pts.some((q) => dist(p, q) < tol * 10)) pts.push(p.slice());
  }
  const n = pts.length;
  if (n < 4) throw new Error('hull: too few points');

  // 初期四面体
  let i0 = 0;
  for (let i = 1; i < n; i++) if (pts[i][0] < pts[i0][0]) i0 = i;
  let i1 = -1, best = -1;
  for (let i = 0; i < n; i++) { const d = dist(pts[i], pts[i0]); if (d > best) { best = d; i1 = i; } }
  let i2 = -1; best = -1;
  const dir01 = unit(sub(pts[i1], pts[i0]));
  for (let i = 0; i < n; i++) {
    const v = sub(pts[i], pts[i0]);
    const d = len(cross(v, dir01));
    if (d > best) { best = d; i2 = i; }
  }
  let i3 = -1; best = -1;
  const nrm = unit(cross(sub(pts[i1], pts[i0]), sub(pts[i2], pts[i0])));
  for (let i = 0; i < n; i++) {
    const d = Math.abs(dot(sub(pts[i], pts[i0]), nrm));
    if (d > best) { best = d; i3 = i; }
  }
  if (best < tol) throw new Error('hull: coplanar points');

  const tris = [];
  const center = centroid([pts[i0], pts[i1], pts[i2], pts[i3]]);
  const makeTri = (a, b, c) => {
    let t = [a, b, c];
    let nn = unit(cross(sub(pts[b], pts[a]), sub(pts[c], pts[a])));
    if (dot(nn, sub(pts[a], center)) < 0) { t = [a, c, b]; nn = mul(nn, -1); }
    return { v: t, n: nn, d: dot(nn, pts[t[0]]), alive: true };
  };
  tris.push(makeTri(i0, i1, i2), makeTri(i0, i1, i3), makeTri(i0, i2, i3), makeTri(i1, i2, i3));
  const used = new Set([i0, i1, i2, i3]);

  for (let p = 0; p < n; p++) {
    if (used.has(p)) continue;
    const P = pts[p];
    const visible = tris.filter((t) => t.alive && dot(t.n, P) - t.d > tol);
    if (visible.length === 0) continue;
    // 地平線の辺を収集
    const edgeCount = new Map();
    for (const t of visible) {
      t.alive = false;
      for (let k = 0; k < 3; k++) {
        const a = t.v[k], b = t.v[(k + 1) % 3];
        const key = a + ',' + b, rk = b + ',' + a;
        if (edgeCount.has(rk)) edgeCount.delete(rk);
        else edgeCount.set(key, [a, b]);
      }
    }
    for (const [a, b] of edgeCount.values()) {
      const nn = unit(cross(sub(pts[b], pts[a]), sub(P, pts[a])));
      tris.push({ v: [a, b, p], n: nn, d: dot(nn, pts[a]), alive: true });
    }
  }

  const live = tris.filter((t) => t.alive);
  // 同一平面の三角形をグループ化
  const groups = [];
  for (const t of live) {
    let g = groups.find((g) => dot(g.n, t.n) > 1 - 1e-6 && Math.abs(g.d - t.d) < tol * 100);
    if (!g) { g = { n: t.n, d: t.d, tris: [] }; groups.push(g); }
    g.tris.push(t);
  }
  // 各グループの外周を辿って多角形にする
  const faces = [];
  for (const g of groups) {
    const cnt = new Map();
    for (const t of g.tris) {
      for (let k = 0; k < 3; k++) {
        const a = t.v[k], b = t.v[(k + 1) % 3];
        const rk = b + ',' + a;
        if (cnt.has(rk)) cnt.delete(rk);
        else cnt.set(a + ',' + b, [a, b]);
      }
    }
    const next = new Map();
    for (const [a, b] of cnt.values()) next.set(a, b);
    const start = next.keys().next().value;
    const loop = [start];
    let cur = next.get(start);
    let guard = 0;
    while (cur !== start && guard++ < 1000) { loop.push(cur); cur = next.get(cur); }
    // 一直線上の頂点を除去
    const clean = loop.filter((v, i) => {
      const a = pts[loop[(i - 1 + loop.length) % loop.length]], b = pts[v], c = pts[loop[(i + 1) % loop.length]];
      return len(cross(sub(b, a), sub(c, b))) > tol * 10;
    });
    faces.push(clean);
  }
  // 使用頂点のみ残す
  const remap = new Map();
  const vertices = [];
  for (const f of faces) for (const v of f) if (!remap.has(v)) { remap.set(v, vertices.length); vertices.push(pts[v]); }
  return { vertices, faces: faces.map((f) => f.map((v) => remap.get(v))) };
}
