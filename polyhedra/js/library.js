// library.js — 多面体ライブラリ（名前付き立体）
import {
  add, sub, mul, dot, cross, len, unit, dist, centroid, newellNormal,
  normalize, convexHull, rotationToZ, intersectPlanes, buildEdges, orientOutward,
} from './geom.js';
import {
  fromNotation, ringRadius, ring, pyramid, prism, antiprism, kis, polarDual,
  icosahedron, dodecahedron, octahedron, PHI,
} from './conway.js';

const R = ringRadius;
const antiH = (n) => Math.sqrt(1 - 2 * R(n) * R(n) * (1 - Math.cos(Math.PI / n)));
const pyrH = (n) => Math.sqrt(1 - R(n) * R(n));
const cupH = (n) => {
  const h2 = R(n) ** 2 + R(2 * n) ** 2 - 2 * R(n) * R(2 * n) * Math.cos(Math.PI / (2 * n));
  return Math.sqrt(1 - h2);
};
const hull = (pts) => normalize(convexHull(pts));

// 正五角形を上に向けた二十・十二面体（辺長 1）。円塔用
function icosidodecahedronUp() {
  const P = fromNotation('aD');
  const { edges } = buildEdges(P);
  const s = 1 / dist(P.vertices[edges[0].a], P.vertices[edges[0].b]);
  const pent = P.faces.find((f) => f.length === 5);
  const n = newellNormal(pent.map((i) => P.vertices[i]));
  const rot = rotationToZ(n);
  return P.vertices.map((v) => mul(rot(v), s));
}
function rotundaPoints() {
  return icosidodecahedronUp().filter((v) => v[2] > -1e-6);
}

// 台塔（cupola）: 下面 2n 角形 z=z0、上面 n 角形
function cupolaPts(n, z0 = 0, dir = 1, gyro = false, withBase = true) {
  const pts = [];
  if (withBase) pts.push(...ring(2 * n, z0, Math.PI / (2 * n)));
  pts.push(...ring(n, z0 + dir * cupH(n), gyro ? Math.PI / n : 0));
  return pts;
}

function geodesicSphere(freq, vertexUp = false) {
  let ico = icosahedron();
  if (vertexUp) {
    const rot = rotationToZ(ico.vertices[0]);
    ico = { ...ico, vertices: ico.vertices.map(rot) };
  }
  const vmap = new Map();
  const vertices = [];
  const key = (p) => p.map((x) => Math.round(x * 1e6)).join(',');
  const vid = (p) => {
    const u = unit(p);
    const k = key(u);
    if (!vmap.has(k)) { vmap.set(k, vertices.length); vertices.push(u); }
    return vmap.get(k);
  };
  const faces = [];
  for (const [ia, ib, ic] of ico.faces) {
    const A = ico.vertices[ia], B = ico.vertices[ib], C = ico.vertices[ic];
    const P = (i, j) => vid(add(A, add(mul(sub(B, A), i / freq), mul(sub(C, A), j / freq))));
    for (let i = 0; i < freq; i++) {
      for (let j = 0; i + j < freq; j++) {
        faces.push([P(i, j), P(i + 1, j), P(i, j + 1)]);
        if (i + j + 1 < freq) faces.push([P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
      }
    }
  }
  return { vertices, faces };
}

function geodesicDome(freq) {
  const S = geodesicSphere(freq, true);
  const keep = S.faces.filter((f) => centroid(f.map((i) => S.vertices[i]))[2] > -1e-6);
  const remap = new Map();
  const vertices = [];
  const faces = keep.map((f) => f.map((i) => {
    if (!remap.has(i)) { remap.set(i, vertices.length); vertices.push(S.vertices[i]); }
    return remap.get(i);
  }));
  return { vertices, faces, open: true };
}

// ---------- 星型 ----------
// 隣接面の平面を延長して角錐をつくる（第一星型）
function stellateNeighbors(P) {
  const N = P.faces.map((f) => newellNormal(f.map((i) => P.vertices[i])));
  const planes = P.faces.map((f, i) => ({ n: N[i], d: dot(N[i], P.vertices[f[0]]) }));
  const efm = new Map();
  P.faces.forEach((f, fi) => f.forEach((v, k) => efm.set(v + '>' + f[(k + 1) % f.length], fi)));
  return kis(P, (i, c, n, f) => {
    const pl = f.map((v, k) => planes[efm.get(f[(k + 1) % f.length] + '>' + v)]);
    return intersectPlanes(pl) || c;
  });
}

function greatDodecahedron() {
  const P = icosahedron();
  const V = P.vertices;
  const { edges } = buildEdges(P);
  const nb = V.map(() => []);
  for (const e of edges) { nb[e.a].push(e.b); nb[e.b].push(e.a); }
  const pent = V.map((v, i) => { const n = unit(v); return { n, d: dot(n, V[nb[i][0]]) }; });
  return kis(P, (i, c, n, f) => intersectPlanes(f.map((v) => pent[v])) || c);
}

function greatStellatedDodecahedron() {
  // 二十面体の各面に黄金三角形（頂角36°）の三角錐を載せる
  const I = icosahedron();
  const a = dist(I.vertices[I.faces[0][0]], I.vertices[I.faces[0][1]]);
  const h = Math.sqrt((PHI * a) ** 2 - a * a / 3);
  return kis(I, h);
}

function stellaOctangula() { return stellateNeighbors(octahedron()); }

// ---------- 名前付き立体の定義 ----------
const N = (id, ja, en, build, extra = {}) => ({ id, ja, en, build, ...extra });
const conway = (id, ja, en, notation) => N(id, ja, en, () => fromNotation(notation), { notation });

export const CATEGORIES = [
  {
    id: 'platonic', ja: '正多面体', en: 'Platonic',
    items: [
      conway('T', '正四面体', 'Tetrahedron', 'T'),
      conway('C', '立方体', 'Cube', 'C'),
      conway('O', '正八面体', 'Octahedron', 'O'),
      conway('D', '正十二面体', 'Dodecahedron', 'D'),
      conway('I', '正二十面体', 'Icosahedron', 'I'),
    ],
  },
  {
    id: 'archimedean', ja: 'アルキメデスの立体', en: 'Archimedean',
    items: [
      conway('tT', '切頂四面体', 'Truncated tetrahedron', 'tT'),
      conway('aC', '立方八面体', 'Cuboctahedron', 'aC'),
      conway('tC', '切頂六面体', 'Truncated cube', 'tC'),
      conway('tO', '切頂八面体', 'Truncated octahedron', 'tO'),
      conway('eC', '斜方立方八面体', 'Rhombicuboctahedron', 'eC'),
      conway('bC', '斜方切頂立方八面体', 'Truncated cuboctahedron', 'bC'),
      conway('sC', '変形立方体', 'Snub cube', 'sC'),
      conway('aD', '二十・十二面体', 'Icosidodecahedron', 'aD'),
      conway('tD', '切頂十二面体', 'Truncated dodecahedron', 'tD'),
      conway('tI', '切頂二十面体', 'Truncated icosahedron', 'tI'),
      conway('eD', '斜方二十・十二面体', 'Rhombicosidodecahedron', 'eD'),
      conway('bD', '斜方切頂二十・十二面体', 'Truncated icosidodecahedron', 'bD'),
      conway('sD', '変形十二面体', 'Snub dodecahedron', 'sD'),
    ],
  },
  {
    id: 'catalan', ja: 'カタランの立体', en: 'Catalan',
    items: [
      conway('kT', '三方四面体', 'Triakis tetrahedron', 'kT'),
      conway('jC', '菱形十二面体', 'Rhombic dodecahedron', 'jC'),
      conway('kO', '三方八面体', 'Triakis octahedron', 'kO'),
      conway('kC', '四方六面体', 'Tetrakis hexahedron', 'kC'),
      conway('oC', '凧形二十四面体', 'Deltoidal icositetrahedron', 'oC'),
      conway('mC', '六方八面体', 'Disdyakis dodecahedron', 'mC'),
      conway('gC', '五角二十四面体', 'Pentagonal icositetrahedron', 'gC'),
      conway('jD', '菱形三十面体', 'Rhombic triacontahedron', 'jD'),
      conway('kI', '三方二十面体', 'Triakis icosahedron', 'kI'),
      conway('kD', '五方十二面体', 'Pentakis dodecahedron', 'kD'),
      conway('oD', '凧形六十面体', 'Deltoidal hexecontahedron', 'oD'),
      conway('mD', '六方二十面体', 'Disdyakis triacontahedron', 'mD'),
      conway('gD', '五角六十面体', 'Pentagonal hexecontahedron', 'gD'),
    ],
  },
  {
    id: 'prism', ja: '角柱・反角柱・錐', en: 'Prisms & pyramids',
    items: [
      N('P', '正n角柱', 'Prism', (n) => normalize(prism(n)), { param: 'n', def: 6 }),
      N('A', '正n角反柱', 'Antiprism', (n) => normalize(antiprism(n)), { param: 'n', def: 6 }),
      N('Y', '正n角錐', 'Pyramid', (n) => normalize(pyramid(n)), { param: 'n', def: 6 }),
      N('BP', '正n角双錐', 'Bipyramid', (n) => hull([...ring(n), [0, 0, n < 6 ? pyrH(n) : 1], [0, 0, n < 6 ? -pyrH(n) : -1]]), { param: 'n', def: 6 }),
      N('dA', 'n方偏方面体', 'Trapezohedron', (n) => fromNotation('dA' + n), { param: 'n', def: 5 }),
    ],
  },
  {
    id: 'johnson', ja: 'ジョンソンの立体', en: 'Johnson solids',
    items: [
      N('J1', '正四角錐', 'Square pyramid (J1)', () => normalize(pyramid(4))),
      N('J2', '正五角錐', 'Pentagonal pyramid (J2)', () => normalize(pyramid(5))),
      N('J3', '正三角台塔', 'Triangular cupola (J3)', () => hull(cupolaPts(3))),
      N('J4', '正四角台塔', 'Square cupola (J4)', () => hull(cupolaPts(4))),
      N('J5', '正五角台塔', 'Pentagonal cupola (J5)', () => hull(cupolaPts(5))),
      N('J6', '正五角円塔', 'Pentagonal rotunda (J6)', () => hull(rotundaPoints())),
      N('J7', '正三角錐柱', 'Elongated triangular pyramid (J7)', () => hull([...ring(3, 0), ...ring(3, 1), [0, 0, 1 + pyrH(3)]])),
      N('J8', '正四角錐柱', 'Elongated square pyramid (J8)', () => hull([...ring(4, 0), ...ring(4, 1), [0, 0, 1 + pyrH(4)]])),
      N('J9', '正五角錐柱', 'Elongated pentagonal pyramid (J9)', () => hull([...ring(5, 0), ...ring(5, 1), [0, 0, 1 + pyrH(5)]])),
      N('J10', '正四角錐反柱', 'Gyroelongated square pyramid (J10)', () => hull([...ring(4, 0, Math.PI / 4), ...ring(4, antiH(4)), [0, 0, antiH(4) + pyrH(4)]])),
      N('J12', '正三角双錐', 'Triangular bipyramid (J12)', () => hull([...ring(3), [0, 0, pyrH(3)], [0, 0, -pyrH(3)]])),
      N('J13', '正五角双錐', 'Pentagonal bipyramid (J13)', () => hull([...ring(5), [0, 0, pyrH(5)], [0, 0, -pyrH(5)]])),
      N('J14', '正三角双錐柱', 'Elongated triangular bipyramid (J14)', () => hull([...ring(3, 0), ...ring(3, 1), [0, 0, 1 + pyrH(3)], [0, 0, -pyrH(3)]])),
      N('J15', '正四角双錐柱', 'Elongated square bipyramid (J15)', () => hull([...ring(4, 0), ...ring(4, 1), [0, 0, 1 + pyrH(4)], [0, 0, -pyrH(4)]])),
      N('J16', '正五角双錐柱', 'Elongated pentagonal bipyramid (J16)', () => hull([...ring(5, 0), ...ring(5, 1), [0, 0, 1 + pyrH(5)], [0, 0, -pyrH(5)]])),
      N('J17', '正四角双錐反柱', 'Gyroelongated square bipyramid (J17)', () => hull([...ring(4, 0, Math.PI / 4), ...ring(4, antiH(4)), [0, 0, antiH(4) + pyrH(4)], [0, 0, -pyrH(4)]])),
      N('J18', '正三角台塔柱', 'Elongated triangular cupola (J18)', () => hull([...ring(6, -1, Math.PI / 6), ...cupolaPts(3)])),
      N('J19', '正四角台塔柱', 'Elongated square cupola (J19)', () => hull([...ring(8, -1, Math.PI / 8), ...cupolaPts(4)])),
      N('J20', '正五角台塔柱', 'Elongated pentagonal cupola (J20)', () => hull([...ring(10, -1, Math.PI / 10), ...cupolaPts(5)])),
      N('J21', '正五角円塔柱', 'Elongated pentagonal rotunda (J21)', () => {
        const r = rotundaPoints();
        return hull([...r, ...r.filter((v) => Math.abs(v[2]) < 1e-6).map((v) => [v[0], v[1], -1])]);
      }),
      N('J22', '正三角台塔反柱', 'Gyroelongated triangular cupola (J22)', () => hull([...ring(6, -antiH(6), Math.PI / 6 + Math.PI / 6), ...cupolaPts(3)])),
      N('J23', '正四角台塔反柱', 'Gyroelongated square cupola (J23)', () => hull([...ring(8, -antiH(8), Math.PI / 8 + Math.PI / 8), ...cupolaPts(4)])),
      N('J26', 'ねじれ双三角柱', 'Gyrobifastigium (J26)', () => {
        const h = Math.sqrt(3) / 2;
        return hull([[0.5, 0.5, 0], [0.5, -0.5, 0], [-0.5, 0.5, 0], [-0.5, -0.5, 0], [0.5, 0, h], [-0.5, 0, h], [0, 0.5, -h], [0, -0.5, -h]]);
      }),
      N('J27', '正三角双台塔', 'Triangular orthobicupola (J27)', () => hull([...cupolaPts(3), ...cupolaPts(3, 0, -1, false, false)])),
      N('J28', '正四角双台塔', 'Square orthobicupola (J28)', () => hull([...cupolaPts(4), ...cupolaPts(4, 0, -1, false, false)])),
      N('J29', 'ねじれ正四角双台塔', 'Square gyrobicupola (J29)', () => hull([...cupolaPts(4), ...cupolaPts(4, 0, -1, true, false)])),
      N('J30', '正五角双台塔', 'Pentagonal orthobicupola (J30)', () => hull([...cupolaPts(5), ...cupolaPts(5, 0, -1, false, false)])),
      N('J31', 'ねじれ正五角双台塔', 'Pentagonal gyrobicupola (J31)', () => hull([...cupolaPts(5), ...cupolaPts(5, 0, -1, true, false)])),
      N('J34', '正五角双円塔', 'Pentagonal orthobirotunda (J34)', () => {
        const r = rotundaPoints();
        return hull([...r, ...r.map((v) => [v[0], v[1], -v[2]])]);
      }),
      N('J35', '正三角双台塔柱', 'Elongated triangular orthobicupola (J35)', () => hull([...cupolaPts(3, 0.5), ...cupolaPts(3, -0.5, -1)])),
      N('J37', 'ねじれ正四角双台塔柱', 'Elongated square gyrobicupola (J37)', () => hull([...cupolaPts(4, 0.5), ...cupolaPts(4, -0.5, -1, true)])),
      N('J38', '正五角双台塔柱', 'Elongated pentagonal orthobicupola (J38)', () => hull([...cupolaPts(5, 0.5), ...cupolaPts(5, -0.5, -1)])),
    ],
  },
  {
    id: 'stellation', ja: '星型多面体', en: 'Stellations',
    items: [
      N('stO', '星型八面体', 'Stella octangula', () => normalize(stellaOctangula()), { nonconvex: true }),
      N('stD', '小星型十二面体', 'Small stellated dodecahedron', () => normalize(stellateNeighbors(dodecahedron())), { nonconvex: true }),
      N('gD12', '大十二面体', 'Great dodecahedron', () => normalize(greatDodecahedron()), { nonconvex: true }),
      N('gsD', '大星型十二面体', 'Great stellated dodecahedron', () => normalize(greatStellatedDodecahedron()), { nonconvex: true }),
      N('stI', '星型二十面体（角錐化）', 'Spiked icosahedron', () => normalize(kis(icosahedron(), 1.0)), { nonconvex: true }),
      N('stkC', '星型立方体（角錐化）', 'Spiked cube', () => normalize(kis(fromNotation('C'), 0.9)), { nonconvex: true }),
    ],
  },
  {
    id: 'geodesic', ja: 'ジオデシック', en: 'Geodesic',
    items: [
      N('GS', 'ジオデシック球 nV', 'Geodesic sphere', (n) => normalize(geodesicSphere(n)), { param: 'f', def: 3, min: 1, max: 8 }),
      N('GD', 'ジオデシックドーム nV', 'Geodesic dome', (n) => normalize(geodesicDome(n)), { param: 'f', def: 4, min: 2, max: 8 }),
      N('GB', 'ゴールドバーグ多面体', 'Goldberg polyhedron', (n) => normalize(polarDual(geodesicSphere(n))), { param: 'f', def: 3, min: 1, max: 6 }),
    ],
  },
];

export const ALL_ITEMS = CATEGORIES.flatMap((c) => c.items.map((it) => ({ ...it, category: c })));
export const findItem = (id) => ALL_ITEMS.find((it) => it.id === id);
