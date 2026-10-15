// analysis.js — 面の合同分類、頂点配置、二面角、寸法
import {
  sub, dot, cross, len, unit, dist, centroid, newellNormal, buildEdges,
  facePoints, faceArea, volume, surfaceArea,
} from './geom.js';

const NUM_JA = ['', '', '', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const ngon = (n) => (NUM_JA[n] || n) + '角形';

function faceShape(pts) {
  const n = pts.length;
  const L = [], A = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], q = pts[i], r = pts[(i + 1) % n];
    L.push(dist(q, r));
    const u = unit(sub(p, q)), v = unit(sub(r, q));
    A.push((Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI);
  }
  return { L, A };
}

// 回転・反転に対して最小となる表現（合同判定用）
function canonicalSig(L, A, scale) {
  const n = L.length;
  const tok = [];
  for (let i = 0; i < n; i++) tok.push(Math.round((L[i] / scale) * 2000) + ':' + Math.round(A[i] * 20));
  let best = null;
  for (const dir of [1, -1]) {
    for (let s = 0; s < n; s++) {
      const seq = [];
      for (let k = 0; k < n; k++) {
        if (dir === 1) seq.push(tok[(s + k) % n]);
        else {
          // 逆回り: 辺 i は頂点 i と i+1 の間。角はそのまま、辺はずらす
          const vi = (s - k + n * 2) % n;
          const ei = (vi - 1 + n) % n;
          const [, a] = tok[vi].split(':');
          const [l] = tok[ei].split(':');
          seq.push(l + ':' + a);
        }
      }
      const str = seq.join('|');
      if (best === null || str < best) best = str;
    }
  }
  return best;
}

function nameFace(L, A) {
  const n = L.length;
  const lmax = Math.max(...L), lmin = Math.min(...L);
  const amax = Math.max(...A), amin = Math.min(...A);
  const eqL = lmax - lmin < 1e-4 * lmax;
  const eqA = amax - amin < 0.05;
  if (eqL && eqA) return n === 4 ? '正方形' : '正' + ngon(n);
  if (n === 3) {
    const s = [...L].sort((a, b) => a - b);
    if (s[1] - s[0] < 1e-4 * lmax || s[2] - s[1] < 1e-4 * lmax) return '二等辺三角形';
    return '不等辺三角形';
  }
  if (n === 4) {
    if (eqL) return '菱形';
    if (eqA) return '長方形';
    const e = (a, b) => Math.abs(a - b) < 1e-4 * lmax;
    if ((e(L[0], L[1]) && e(L[2], L[3])) || (e(L[1], L[2]) && e(L[3], L[0]))) return '凧形';
    return '四角形';
  }
  if (eqL) return '等辺' + ngon(n);
  return ngon(n);
}

export function analyze(P) {
  const E = buildEdges(P);
  const { edges } = E;
  const nF = P.faces.length;
  const normals = [], centers = [], areas = [];
  for (let f = 0; f < nF; f++) {
    const pts = facePoints(P, f);
    normals.push(newellNormal(pts));
    centers.push(centroid(pts));
    areas.push(faceArea(pts));
  }
  let emax = 0, emin = Infinity;
  for (const e of edges) {
    const l = dist(P.vertices[e.a], P.vertices[e.b]);
    e.length = l;
    emax = Math.max(emax, l); emin = Math.min(emin, l);
  }

  // 面の合同クラス
  const sigMap = new Map();
  const classes = [];
  const faceClass = new Array(nF);
  for (let f = 0; f < nF; f++) {
    const { L, A } = faceShape(facePoints(P, f));
    const sig = canonicalSig(L, A, emax);
    let ci = sigMap.get(sig);
    if (ci === undefined) {
      ci = classes.length;
      sigMap.set(sig, ci);
      classes.push({ sig, sides: L.length, count: 0, name: nameFace(L, A), area: areas[f], L, A });
    }
    classes[ci].count++;
    faceClass[f] = ci;
  }
  // 多い順・辺数順に並べ替えて色の割り当てを安定させる
  const order = classes.map((c, i) => i).sort((a, b) => classes[a].sides - classes[b].sides || classes[b].count - classes[a].count);
  const remap = new Array(classes.length);
  order.forEach((old, nw) => (remap[old] = nw));
  const sortedClasses = order.map((i) => classes[i]);
  for (let f = 0; f < nF; f++) faceClass[f] = remap[faceClass[f]];

  // 二面角
  const dihedralMap = new Map();
  for (const e of edges) {
    if (e.faces.length !== 2) { e.dihedral = null; continue; }
    const [f, g] = e.faces;
    const c = Math.max(-1, Math.min(1, dot(normals[f], normals[g])));
    const theta = Math.acos(c);
    const convex = dot(normals[f], sub(centers[g], centers[f])) < 1e-9;
    const di = convex ? Math.PI - theta : Math.PI + theta;
    e.dihedral = di;
    e.convex = convex;
    const deg = (di * 180) / Math.PI;
    const k = deg.toFixed(2);
    const d = dihedralMap.get(k) || { deg, count: 0, convex };
    d.count++;
    dihedralMap.set(k, d);
  }
  const dihedrals = [...dihedralMap.values()].sort((a, b) => a.deg - b.deg);

  // 頂点配置（各頂点まわりの面の辺数）
  const efm = new Map();
  P.faces.forEach((f, fi) => f.forEach((v, k) => efm.set(v + '>' + f[(k + 1) % f.length], fi)));
  const around = new Map();
  P.faces.forEach((f, fi) => {
    for (let k = 0; k < f.length; k++) {
      const a = f[k], b = f[(k + 1) % f.length];
      if (!around.has(a)) around.set(a, new Map());
      around.get(a).set(fi, efm.get(b + '>' + a));
    }
  });
  const vcMap = new Map();
  let openVertex = false;
  for (const [, m] of around) {
    const start = m.keys().next().value;
    const seq = [];
    let cur = start, g = 0;
    do { seq.push(P.faces[cur].length); cur = m.get(cur); } while (cur !== undefined && cur !== start && g++ < 100);
    if (cur === undefined) { openVertex = true; continue; }
    const n = seq.length;
    let best = null;
    for (const s of [seq, [...seq].reverse()]) {
      for (let r = 0; r < n; r++) {
        const str = [...s.slice(r), ...s.slice(0, r)].join('.');
        if (best === null || cmpConfig(str, best) < 0) best = str;
      }
    }
    vcMap.set(best, (vcMap.get(best) || 0) + 1);
  }
  const vertexConfigs = [...vcMap.entries()].map(([k, c]) => ({ config: k, count: c })).sort((a, b) => b.count - a.count);

  const open = edges.some((e) => e.faces.length !== 2) || openVertex;
  const faceCounts = {};
  for (const f of P.faces) faceCounts[f.length] = (faceCounts[f.length] || 0) + 1;

  return {
    edgeIndex: E,
    edges,
    normals, centers, areas,
    faceClass,
    classes: sortedClasses,
    dihedrals,
    vertexConfigs,
    faceCounts,
    V: P.vertices.length, E: edges.length, F: nF,
    chi: P.vertices.length - edges.length + nF,
    emin, emax,
    radius: Math.max(...P.vertices.map(len)),
    area: surfaceArea(P),
    volume: open ? null : volume(P),
    open,
  };
}

function cmpConfig(a, b) {
  const A = a.split('.').map(Number), B = b.split('.').map(Number);
  for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return A[i] - B[i];
  return A.length - B.length;
}

// ---------- 色 ----------
export const PALETTES = {
  stella: {
    ja: 'ステラ', colors: ['#e8423f', '#f6c32a', '#2f7fe0', '#36b04a', '#f08a24', '#9b55d4', '#1fb7b0', '#e15fa6', '#8d6a3e', '#a4b23a', '#5b6bd6', '#d9534f'],
  },
  washi: {
    ja: '和紙', colors: ['#c4a265', '#b5524a', '#3f6e8c', '#6e9160', '#d8c6a0', '#7d5b8f', '#c98a3e', '#4f8a86', '#a86f7d', '#8a8f5a', '#5c6f9e', '#b98e5a'],
  },
  pastel: {
    ja: 'パステル', colors: ['#f2a7a0', '#f7dc8c', '#9ec5f0', '#a8dba8', '#f6c193', '#c9b0e8', '#93d9d3', '#f3b4d4', '#d6c2a1', '#cfd98e', '#b0b8ef', '#e8a3a3'],
  },
  gold: {
    ja: '金と墨', colors: ['#c4a265', '#3a3833', '#e2cf9f', '#8a7448', '#5e5a51', '#f1e6c8', '#a88b52', '#24231f'],
  },
  paper: {
    ja: '白い紙', colors: ['#f4f1ea', '#ebe6dc', '#f8f6f1', '#e4ded2', '#efebe3', '#faf9f6'],
  },
};

export function faceColors(an, palette = 'stella', mode = 'class') {
  const cols = PALETTES[palette]?.colors || PALETTES.stella.colors;
  if (mode === 'single') return an.faceClass.map(() => cols[0]);
  if (mode === 'sides') {
    const sides = [...new Set(an.classes.map((c) => c.sides))].sort((a, b) => a - b);
    return an.faceClass.map((ci) => cols[sides.indexOf(an.classes[ci].sides) % cols.length]);
  }
  return an.faceClass.map((ci) => cols[ci % cols.length]);
}

export const classColor = (an, ci, palette, mode) => {
  const cols = PALETTES[palette]?.colors || PALETTES.stella.colors;
  if (mode === 'single') return cols[0];
  if (mode === 'sides') {
    const sides = [...new Set(an.classes.map((c) => c.sides))].sort((a, b) => a - b);
    return cols[sides.indexOf(an.classes[ci].sides) % cols.length];
  }
  return cols[ci % cols.length];
};
