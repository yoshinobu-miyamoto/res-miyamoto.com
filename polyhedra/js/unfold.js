// unfold.js — 展開図の生成（重なり回避・用紙サイズ制約・のりしろ・番号）
import { sub, dot, cross, unit, newellNormal, facePoints, rotateAxis } from './geom.js';

// ---------- 2D ユーティリティ ----------
const v2sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const v2add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const v2mul = (a, s) => [a[0] * s, a[1] * s];
const v2len = (a) => Math.hypot(a[0], a[1]);
const v2cross = (a, b) => a[0] * b[1] - a[1] * b[0];

function bbox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

// 凸多角形どうしの重なり判定（分離軸定理）。接しているだけなら false
function convexOverlap(A, B, eps) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      const nx = q[1] - p[1], ny = p[0] - q[0];
      const l = Math.hypot(nx, ny);
      if (l < 1e-12) continue;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const v of A) { const d = (v[0] * nx + v[1] * ny) / l; if (d < amin) amin = d; if (d > amax) amax = d; }
      for (const v of B) { const d = (v[0] * nx + v[1] * ny) / l; if (d < bmin) bmin = d; if (d > bmax) bmax = d; }
      if (Math.min(amax, bmax) - Math.max(amin, bmin) <= eps) return false;
    }
  }
  return true;
}

function boxOverlap(a, b, eps) {
  return !(a.x1 <= b.x0 + eps || b.x1 <= a.x0 + eps || a.y1 <= b.y0 + eps || b.y1 <= a.y0 + eps);
}

// 2D 凸包（Andrew の単調鎖法）
export function hull2D(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && v2cross(v2sub(lower[lower.length - 1], lower[lower.length - 2]), v2sub(p, lower[lower.length - 1])) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && v2cross(v2sub(upper[upper.length - 1], upper[upper.length - 2]), v2sub(p, upper[upper.length - 1])) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// 最小面積の外接長方形（回転キャリパー）→ { angle, w, h }
export function minRect(points) {
  const H = hull2D(points);
  let best = null;
  const tryAngle = (ang) => {
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of H) {
      const rx = x * c - y * s, ry = x * s + y * c;
      if (rx < x0) x0 = rx; if (rx > x1) x1 = rx; if (ry < y0) y0 = ry; if (ry > y1) y1 = ry;
    }
    const w = x1 - x0, h = y1 - y0;
    if (!best || w * h < best.w * best.h - 1e-12) best = { angle: ang, w, h };
  };
  tryAngle(0);
  for (let i = 0; i < H.length; i++) {
    const p = H[i], q = H[(i + 1) % H.length];
    tryAngle(Math.atan2(q[1] - p[1], q[0] - p[0]));
  }
  return best;
}

// 長方形 W×H に収まるか（回転を許す）
function fitsIn(points, W, Hh, margin) {
  if (!isFinite(W)) return true;
  const H = hull2D(points);
  const angles = [0];
  for (let i = 0; i < H.length; i++) {
    const p = H[i], q = H[(i + 1) % H.length];
    angles.push(Math.atan2(q[1] - p[1], q[0] - p[0]));
  }
  for (const ang of angles) {
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of H) {
      const rx = x * c - y * s, ry = x * s + y * c;
      if (rx < x0) x0 = rx; if (rx > x1) x1 = rx; if (ry < y0) y0 = ry; if (ry > y1) y1 = ry;
    }
    const w = x1 - x0 + 2 * margin, h = y1 - y0 + 2 * margin;
    if ((w <= W && h <= Hh) || (w <= Hh && h <= W)) return true;
  }
  return false;
}

// 擬似乱数（再現可能）
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}

// 面ごとの局所2D座標（外側から見て反時計回り）
function localFaces(P, normals) {
  return P.faces.map((f, fi) => {
    const pts = facePoints(P, fi);
    const n = normals[fi];
    const u = unit(sub(pts[1], pts[0]));
    const w = cross(n, u);
    return pts.map((p) => { const d = sub(p, pts[0]); return [dot(d, u), dot(d, w)]; });
  });
}

// 子面 g を、親の配置済み辺 (Pa→Pb) に合わせて配置
function placeAcross(local, g, ia, ib, Pa, Pb) {
  const Q = local[g];
  const Qa = Q[ia], Qb = Q[ib];
  const angP = Math.atan2(Pb[1] - Pa[1], Pb[0] - Pa[0]);
  const angQ = Math.atan2(Qb[1] - Qa[1], Qb[0] - Qa[0]);
  const r = angP - angQ, c = Math.cos(r), s = Math.sin(r);
  return Q.map((q) => {
    const d = v2sub(q, Qa);
    return [Pa[0] + d[0] * c - d[1] * s, Pa[1] + d[0] * s + d[1] * c];
  });
}

/**
 * 展開図を生成する
 * @param P 多面体
 * @param an analyze() の結果
 * @param opt { maxW, maxH, margin, strategy: 'compact'|'bfs'|'strip'|'random', seed, root }
 */
export function unfoldOnce(P, an, opt = {}) {
  const { maxW = Infinity, maxH = Infinity, margin = 0, strategy = 'compact', seed = 1 } = opt;
  const nF = P.faces.length;
  const local = opt.local || localFaces(P, an.normals);
  const rand = rng(seed);
  const placedBy = new Array(nF).fill(null); // その面の2D座標（ピースごと）
  const pieceOf = new Array(nF).fill(-1);
  const pieces = [];
  const scale = an.emax;
  const eps = 1e-7 * scale;

  // 面 f の k 番目の辺の反対側の面
  const neighbor = (f, k) => {
    const face = P.faces[f];
    const a = face[k], b = face[(k + 1) % face.length];
    const e = an.edgeIndex.map.get(an.edgeIndex.key(a, b));
    const g = e.faces.find((x) => x !== f);
    if (g === undefined || e.faces.length !== 2) return null;
    return { g, edge: e, ia: P.faces[g].indexOf(a), ib: P.faces[g].indexOf(b), a, b };
  };

  const remaining = new Set([...Array(nF).keys()]);
  // 根の候補: 面積の大きい面を優先
  const byArea = [...Array(nF).keys()].sort((x, y) => an.areas[y] - an.areas[x]);

  while (remaining.size) {
    let root;
    if (opt.root !== undefined && remaining.has(opt.root) && pieces.length === 0) root = opt.root;
    else if (strategy === 'random') { const arr = [...remaining]; root = arr[Math.floor(rand() * arr.length)]; }
    else root = byArea.find((f) => remaining.has(f));

    const pi = pieces.length;
    const piece = { root, faces: [root], parent: new Map(), polys: new Map(), boxes: new Map(), order: [root] };
    const rootPoly = local[root].map((p) => p.slice());
    piece.polys.set(root, rootPoly);
    piece.boxes.set(root, bbox([rootPoly]));
    placedBy[root] = rootPoly; pieceOf[root] = pi;
    remaining.delete(root);
    pieces.push(piece);
    let hullPts = hull2D(rootPoly);
    const rootC = rootPoly.reduce((s, p) => v2add(s, p), [0, 0]).map((x) => x / rootPoly.length);

    const frontier = [];
    const pushNeighbors = (f) => {
      const face = P.faces[f];
      for (let k = 0; k < face.length; k++) {
        const nb = neighbor(f, k);
        if (!nb || !remaining.has(nb.g)) continue;
        const Pa = piece.polys.get(f)[k], Pb = piece.polys.get(f)[(k + 1) % face.length];
        const poly = placeAcross(local, nb.g, nb.ia, nb.ib, Pa, Pb);
        const c = poly.reduce((s, p) => v2add(s, p), [0, 0]).map((x) => x / poly.length);
        frontier.push({ parent: f, k, ...nb, poly, d: v2len(v2sub(c, rootC)), r: rand() });
      }
    };
    pushNeighbors(root);

    while (frontier.length) {
      let idx;
      if (strategy === 'compact') {
        idx = 0;
        for (let i = 1; i < frontier.length; i++) if (frontier[i].d < frontier[idx].d - 1e-9) idx = i;
      } else if (strategy === 'bfs') idx = 0;
      else if (strategy === 'strip') idx = frontier.length - 1;
      else idx = Math.floor(rand() * frontier.length);
      const cand = frontier.splice(idx, 1)[0];
      if (!remaining.has(cand.g)) continue;
      const box = bbox([cand.poly]);
      let ok = true;
      for (const [f, poly] of piece.polys) {
        if (!boxOverlap(box, piece.boxes.get(f), eps)) continue;
        if (convexOverlap(cand.poly, poly, eps)) { ok = false; break; }
      }
      if (ok && isFinite(maxW)) ok = fitsIn(hullPts.concat(cand.poly), maxW, maxH, margin);
      if (!ok) continue;
      piece.polys.set(cand.g, cand.poly);
      piece.boxes.set(cand.g, box);
      piece.parent.set(cand.g, { parent: cand.parent, a: cand.a, b: cand.b, edge: cand.edge });
      piece.faces.push(cand.g);
      piece.order.push(cand.g);
      placedBy[cand.g] = cand.poly; pieceOf[cand.g] = pi;
      remaining.delete(cand.g);
      hullPts = hull2D(hullPts.concat(cand.poly));
      pushNeighbors(cand.g);
    }
  }
  return { pieces, pieceOf, local };
}

// 複数の戦略・根を試して最良の展開を選ぶ
export function unfoldBest(P, an, opt = {}) {
  const nF = P.faces.length;
  const local = localFaces(P, an.normals);
  const trials = [];
  const budget = nF > 600 ? 3 : nF > 200 ? 8 : 24;
  const roots = [];
  const seen = new Set();
  // クラスごとに代表面を根の候補に
  for (let f = 0; f < nF && roots.length < 6; f++) {
    if (!seen.has(an.faceClass[f])) { seen.add(an.faceClass[f]); roots.push(f); }
  }
  for (const r of roots) trials.push({ strategy: 'compact', root: r, seed: 7 + r });
  trials.push({ strategy: 'bfs', seed: 3 });
  for (let i = 0; trials.length < budget; i++) trials.push({ strategy: i % 3 === 0 ? 'strip' : 'random', seed: 101 + i * 7919 });
  if (opt.variant) {
    // 「別の展開」: 乱数で並びを変える
    for (let i = 0; i < trials.length; i++) trials[i] = { strategy: ['compact', 'random', 'bfs', 'random'][i % 4], root: Math.floor(((opt.variant * 9301 + i * 49297) % 233280) / 233280 * nF), seed: opt.variant * 131 + i };
  }
  let best = null;
  for (const t of trials) {
    const res = unfoldOnce(P, an, { ...opt, ...t, local });
    const area = res.pieces.reduce((s, p) => {
      const pts = [...p.polys.values()].flat();
      const r = minRect(pts);
      return s + r.w * r.h;
    }, 0);
    // のりしろが付かない辺が少ない展開を優先
    let missing = 0;
    if (opt.tabH > 0) {
      const dec = decorate(P, an, res, { tabH: opt.tabH, tabMode: 'one' });
      const cut = dec.reduce((s, p) => s + p.labels.length, 0) / 2;
      missing = cut - dec.reduce((s, p) => s + p.tabs.length, 0);
      res.dec = dec;
    }
    const score = res.pieces.length * 1e6 + missing * 1e4 + area;
    if (!best || score < best.score) best = { ...res, score, trial: t };
  }
  return best;
}

// ---------- のりしろ・番号・折り線 ----------
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) a += v2cross(pts[i], pts[(i + 1) % pts.length]);
  return a / 2;
}

function faceAngleAt(polyPts, idx) {
  const n = polyPts.length;
  const p = polyPts[(idx - 1 + n) % n], q = polyPts[idx], r = polyPts[(idx + 1) % n];
  const u = v2sub(p, q), v = v2sub(r, q);
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (v2len(u) * v2len(v)))));
}

function tabPolygon(p, q, h, angP, angQ) {
  const d = v2sub(q, p);
  const L = v2len(d);
  const t = v2mul(d, 1 / L);
  const r = [t[1], -t[0]]; // 右手側 = 面の外側
  let ip = h / Math.tan(angP), iq = h / Math.tan(angQ);
  if (ip + iq > L * 0.85) {
    const k = (L * 0.85) / (ip + iq);
    h *= k; ip *= k; iq *= k;
  }
  return [p, q, v2add(v2add(q, v2mul(r, h)), v2mul(t, -iq)), v2add(v2add(p, v2mul(r, h)), v2mul(t, ip))];
}

/**
 * 展開結果からのりしろ・番号・線種を作る
 * @param tabH のりしろ高さ（多面体単位）, tabMode 'one'|'none'
 */
export function decorate(P, an, unf, { tabH = 0.15, tabMode = 'one', tabAngleDeg = 50 } = {}) {
  const { pieces, pieceOf } = unf;
  const eps = 1e-7 * an.emax;
  const out = pieces.map(() => ({ faces: [], folds: [], cuts: [], tabs: [], labels: [] }));
  const hinge = new Set();
  pieces.forEach((pc) => {
    for (const [, info] of pc.parent) hinge.add(info.edge);
  });
  // 面の配置を出力
  pieces.forEach((pc, pi) => {
    for (const f of pc.faces) out[pi].faces.push({ f, pts: pc.polys.get(f), cls: an.faceClass[f] });
  });
  const posInPiece = (f, v) => {
    const pc = pieces[pieceOf[f]];
    const k = P.faces[f].indexOf(v);
    return pc.polys.get(f)[k];
  };
  let label = 0;
  const tabAngle = (tabAngleDeg * Math.PI) / 180;
  const tabsByPiece = pieces.map(() => []);
  for (const e of an.edges) {
    if (hinge.has(e)) {
      const f = e.faces[0];
      const pi = pieceOf[f];
      out[pi].folds.push({ p: posInPiece(f, e.a), q: posInPiece(f, e.b), mountain: e.convex !== false, deg: e.dihedral });
      continue;
    }
    if (e.faces.length !== 2) {
      const f = e.faces[0];
      out[pieceOf[f]].cuts.push([posInPiece(f, e.a), posInPiece(f, e.b)]);
      continue;
    }
    label++;
    const occ = e.faces.map((f, side) => {
      const face = P.faces[f];
      const k = e.sides[side];
      const a = face[k], b = face[(k + 1) % face.length];
      const poly = pieces[pieceOf[f]].polys.get(f);
      return { f, pi: pieceOf[f], k, p: poly[k], q: poly[(k + 1) % face.length], a, b };
    });
    for (const o of occ) {
      out[o.pi].cuts.push([o.p, o.q]);
      out[o.pi].labels.push({ text: String(label), p: o.p, q: o.q, f: o.f });
    }
    if (tabMode === 'none') continue;
    // のりしろの角度は、貼り合わせる相手の面の角度を超えない。
    // 隣の面に重なる場合は、両端の角度と高さを段階的に絞って収まる形を探す
    const tryTab = (o, other, hScale, kP, kQ) => {
      const otherPoly = pieces[other.pi].polys.get(other.f);
      const ia = P.faces[other.f].indexOf(o.a), ib = P.faces[other.f].indexOf(o.b);
      const angA = Math.min(tabAngle * kP, faceAngleAt(otherPoly, ia) * 0.92);
      const angB = Math.min(tabAngle * kQ, faceAngleAt(otherPoly, ib) * 0.92);
      const poly = tabPolygon(o.p, o.q, tabH * hScale, angA, angB);
      const box = bbox([poly]);
      const pc = pieces[o.pi];
      for (const [f, fp] of pc.polys) {
        if (!boxOverlap(box, pc.boxes.get(f), eps)) continue;
        if (convexOverlap(poly, fp, eps * 10)) return null;
      }
      for (const t of tabsByPiece[o.pi]) {
        if (boxOverlap(box, t.box, eps) && convexOverlap(poly, t.poly, eps * 10)) return null;
      }
      return { poly, box, area: Math.abs(polyArea(poly)) };
    };
    let placed = null;
    const shapes = [[1, 1, 1], [1, 1, 0.5], [1, 0.5, 1], [1, 0.5, 0.5], [1, 1, 0.22], [1, 0.22, 1], [1, 0.22, 0.22],
      [0.65, 1, 1], [0.65, 0.5, 0.5], [0.65, 0.22, 0.22], [0.4, 0.5, 0.5], [0.4, 0.22, 0.22],
      [0.6, 1, 0.1], [0.6, 0.1, 1], [0.6, 0.5, 0.1], [0.6, 0.1, 0.5], [0.6, 0.1, 0.1], [0.35, 0.1, 0.1], [0.2, 0.06, 0.06]];
    for (const [hs, kP, kQ] of shapes) {
      // 両側を試し、面積の大きいほうを採用
      let best = null;
      for (const [i, j] of [[0, 1], [1, 0]]) {
        const t = tryTab(occ[i], occ[j], hs, kP, kQ);
        if (t && (!best || t.area > best.area * 1.05)) best = { ...t, o: occ[i] };
      }
      if (best) { placed = best; break; }
    }
    if (placed) {
      const tab = { poly: placed.poly, box: placed.box, label: String(label), overlap: false };
      tabsByPiece[placed.o.pi].push(tab);
      out[placed.o.pi].tabs.push(tab);
      // 面との境界は折り線（のりしろは裏へ折る＝山折り）
      out[placed.o.pi].cuts = out[placed.o.pi].cuts.filter((c) => !(c[0] === placed.o.p && c[1] === placed.o.q));
      out[placed.o.pi].folds.push({ p: placed.o.p, q: placed.o.q, mountain: true, tab: true });
    }
  }
  return out;
}

// ---------- 3D 折りたたみアニメーション用の変換 ----------
// 各面について、親との蝶番まわりの回転（元の3D座標系）を求める
export function foldHinges(P, an, unf) {
  const hinges = new Array(P.faces.length).fill(null);
  for (const pc of unf.pieces) {
    for (const [g, info] of pc.parent) {
      const A = P.vertices[info.a], B = P.vertices[info.b];
      const axis = unit(sub(B, A));
      const nP = an.normals[info.parent], nC = an.normals[g];
      // 子の法線を親の法線に一致させる角
      const c = Math.max(-1, Math.min(1, dot(nP, nC)));
      let ang = Math.acos(c);
      const test = rotateAxis(nC, axis, Math.cos(ang), Math.sin(ang));
      if (dot(test, nP) < 1 - 1e-6) ang = -ang;
      hinges[g] = { parent: info.parent, origin: A, axis, angle: ang };
    }
  }
  const order = unf.pieces.flatMap((pc) => pc.order);
  return { hinges, order };
}
