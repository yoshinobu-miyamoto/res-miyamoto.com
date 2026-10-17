// mode4d.js — 四次元ポリトープの表示と模型
import {
  buildPolytope, viewSetup, project, unfoldCells, foldTransforms, affApply,
  mat4mul, matVec, planeRotation, I4, shapeSignature, dot4, sub4, unit4, len4, mul4,
} from './four.js';
import { convexHull, normalize } from './geom.js';
import { analyze, PALETTES } from './analysis.js';
import { unfoldBest, unfoldSymmetric, decorate } from './unfold.js';
import { printableArea } from './netview.js';
import { L as tr } from './i18n.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const PROJECTIONS = {
  schlegel: { ja: 'シュレーゲル図（胞を手前に・透視）', en: 'Schlegel diagram (cell first, perspective)' },
  'persp-vertex': { ja: '透視投影（頂点を手前に）', en: 'Perspective (vertex first)' },
  'ortho-cell': { ja: '平行投影（胞を手前に）', en: 'Parallel (cell first)' },
  'ortho-vertex': { ja: '平行投影（頂点を手前に）', en: 'Parallel (vertex first)' },
};

export const MODELS = {
  puzzle: { ja: '投影した胞（立体パズル）', en: 'Projected cells (3D puzzle)' },
  hull: { ja: '投影の外形', en: 'Projection hull' },
  cells: { ja: '胞の実形', en: 'True cells' },
  struts: { ja: '棒模型の部材表', en: 'Strut list' },
};

// 平面 (a, b) 内で a を b へ向けて ang だけ回す回転
function rotToward(a, b, ang) {
  const c0 = Math.max(-1, Math.min(1, dot4(a, b)));
  let e2 = sub4(b, mul4(a, c0));
  const l = len4(e2);
  const M = I4();
  if (l < 1e-12) return M;
  e2 = mul4(e2, 1 / l);
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    M[i * 4 + j] += (c - 1) * (a[i] * a[j] + e2[i] * e2[j]) + s * (e2[i] * a[j] - a[i] * e2[j]);
  }
  return M;
}

export class Mode4D {
  constructor(viewer) {
    this.viewer = viewer;
    this.T = null;
    this.fold = 0;
    this.rot = { xw: 0, yw: 0, zw: 0 };
    this.opts = { projection: 'schlegel', frontType: 0, dist: 0.4, shrink: 0.12, model: 'puzzle', palette: 'stella', colorMode: 'class' };
    this.spin4 = false;
    this._raf = null;
  }

  load(item, param) {
    const V = item.verts(param);
    this.item = item;
    this.T = buildPolytope(V);
    this.fold = 0;
    // 標準のシュレーゲル図にならい、いちばん大きな胞を手前に置く
    let ft = 0;
    this.T.types.forEach((t, i) => { if (t.rep.verts.length > this.T.types[ft].rep.verts.length) ft = i; });
    this.opts.frontType = ft;
    this._setup();
    this._buildMesh();
  }

  setOptions(o) {
    const needSetup = ['projection', 'frontType', 'dist'].some((k) => k in o && o[k] !== this.opts[k]);
    Object.assign(this.opts, o);
    if (!this.T) return;
    if (needSetup) this._setup();
    if ('palette' in o || 'colorMode' in o) this._buildMesh();
    else this.update();
  }

  setRotation(r) { Object.assign(this.rot, r); this.update(); }
  setFold(t) { this.fold = Math.max(0, Math.min(1, t)); this.update(); }

  setSpin(on, onTick) {
    this.spin4 = on;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (!on) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(50, now - last); last = now;
      if (this.fold < 0.01) {
        this.rot.xw = wrap(this.rot.xw + dt * 0.00035);
        this.rot.zw = wrap(this.rot.zw + dt * 0.00021);
        this.update();
        onTick && onTick(this.rot);
      }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _setup() {
    const T = this.T;
    const mode = this.opts.projection;
    const setup = viewSetup(T, mode === 'persp-vertex' || mode === 'ortho-vertex' ? 'ortho-cell' : mode, this.opts.frontType, this.opts.dist);
    this.front = setup.front;
    this.Bcell = setup.B;
    const frontCell = T.cells[this.front];
    // 頂点を手前にする場合は、手前の胞の頂点へ向ける回転を前置する
    this.vertexTilt = null;
    if (mode === 'persp-vertex' || mode === 'ortho-vertex') {
      const v = unit4(T.V[frontCell.verts[0]]);
      const a = Math.acos(Math.max(-1, Math.min(1, dot4(v, frontCell.normal))));
      this.vertexTilt = { v, n: frontCell.normal, a };
    }
    if (mode === 'schlegel') this.d = setup.d;
    else if (mode === 'persp-vertex') this.d = T.R * (1.15 + this.opts.dist * 4);
    else this.d = Infinity;
    this.U = unfoldCells(T, this.front);
    // 表示の正規化（基準の向きで外接半径 1）
    const pts = this._project(0, { xw: 0, yw: 0, zw: 0 }, null);
    this.norm = 1 / Math.max(...pts.map((p) => Math.hypot(...p)));
  }

  // 基準回転 → 利用者の4次元回転 → 投影
  _matrix(t, rot) {
    const e = ease(t);
    let B = this.Bcell;
    if (this.vertexTilt) {
      const { v, n, a } = this.vertexTilt;
      B = mat4mul(B, rotToward(v, n, a * (1 - e)));
    }
    const k = 1 - e;
    const R = mat4mul(planeRotation(2, 3, rot.zw * k), mat4mul(planeRotation(1, 3, rot.yw * k), planeRotation(0, 3, rot.xw * k)));
    return mat4mul(R, B);
  }

  _project(t, rot, F) {
    const M = this._matrix(t, rot);
    const persp = Number.isFinite(this.d) ? 1 - ease(t) : 0;
    const T = this.T;
    // 4次元回転すると視点が立体に近づきすぎるので、回転量に応じて外接球の外まで下げる
    let d = this.d;
    if (Number.isFinite(d)) {
      const k = (1 - ease(t)) * Math.min(1, Math.hypot(rot.xw, rot.yw, rot.zw) / 0.35);
      const safe = Math.max(d, T.R * 1.8);
      d = d + (safe - d) * k;
    }
    if (!F) return T.V.map((p) => project(matVec(M, p), d, persp));
    return { M, persp, d };
  }

  // 現在の状態での、胞ごとの3D座標
  cellPoints(t = this.fold, rot = this.rot) {
    const T = this.T;
    const F = t > 0 ? foldTransforms(T, this.U, ease(t)) : null;
    const { M, persp, d } = this._project(t, rot, true);
    const s = this.norm;
    return T.cells.map((c, ci) => c.verts.map((vi) => {
      const p = F ? affApply(F[ci], T.V[vi]) : T.V[vi];
      const q = project(matVec(M, p), d, persp);
      return [q[0] * s, q[1] * s, q[2] * s];
    }));
  }

  _buildMesh() {
    const T = this.T;
    // 胞ごとに頂点を複製した擬似多面体
    this.cellVertStart = [];
    const faces = [];
    this.faceCell = [];
    let n = 0;
    T.cells.forEach((c, ci) => {
      this.cellVertStart.push(n);
      const local = new Map(c.verts.map((v, k) => [v, n + k]));
      for (const f of c.faces) { faces.push(f.map((v) => local.get(v))); this.faceCell.push(ci); }
      n += c.verts.length;
    });
    const verts = this._vertexArray();
    this.mesh = { vertices: verts, faces };
    const cols = PALETTES[this.opts.palette]?.colors || PALETTES.stella.colors;
    const sides = [...new Set(faces.map((f) => f.length))].sort((a, b) => a - b);
    this.colors = faces.map((f, i) => {
      if (this.opts.colorMode === 'single') return cols[0];
      if (this.opts.colorMode === 'sides') return cols[sides.indexOf(f.length) % cols.length];
      return cols[T.cells[this.faceCell[i]].type % cols.length];
    });
    this.viewer.setModel(this.mesh, { normals: [] }, this.colors, null);
  }

  _vertexArray() {
    const pts = this.cellPoints();
    const out = [];
    let cx = 0, cy = 0, cz = 0;
    if (this.fold > 0) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (const cp of pts) for (const p of cp) {
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]);
      }
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; cz = (z0 + z1) / 2;
    }
    const k = 1 - this.opts.shrink;
    for (const cp of pts) {
      let mx = 0, my = 0, mz = 0;
      for (const p of cp) { mx += p[0]; my += p[1]; mz += p[2]; }
      mx /= cp.length; my /= cp.length; mz /= cp.length;
      for (const p of cp) out.push([mx + (p[0] - mx) * k - cx, my + (p[1] - my) * k - cy, mz + (p[2] - mz) * k - cz]);
    }
    return out;
  }

  update() {
    if (!this.mesh) return;
    this.mesh.vertices = this._vertexArray();
    this.viewer.updateVertices(this.mesh.vertices);
  }

  // 面番号 → 胞の面すべて
  cellFaces(f) {
    const ci = this.faceCell[f];
    const out = [];
    this.faceCell.forEach((c, i) => { if (c === ci) out.push(i); });
    return out;
  }

  typeColor(t) {
    const cols = PALETTES[this.opts.palette]?.colors || PALETTES.stella.colors;
    return this.opts.colorMode === 'single' ? cols[0] : cols[t % cols.length];
  }

  // ---------- 模型 ----------
  // 標準投影（4次元回転 0°）での投影座標（模型の単位）
  _standardProjected() {
    const { M, persp } = this._project(0, { xw: 0, yw: 0, zw: 0 }, true);
    return this.T.V.map((p) => project(matVec(M, p), this.d, persp));
  }

  /**
   * 模型の部品を作る。戻り値 { dec, notes, warn, strutRows }
   * size: 'puzzle' / 'hull' / 'struts' は外形の最長辺 mm、'cells' は辺の長さ mm
   */
  buildModel(opt) {
    const T = this.T;
    let model = this.opts.model;
    let warn = '';
    if (model === 'puzzle' && this.opts.projection !== 'schlegel') {
      warn = tr('立体パズルはシュレーゲル図のときに作れます。胞の実形を表示しています', 'The 3D puzzle needs the Schlegel diagram; showing the true cells instead');
      model = 'cells';
    }
    const area = printableArea(opt.paper, opt.landscape);
    const groups = []; // { P (3D 多面体), count, color, label }
    let scale; // mm / 単位
    const proj = this._standardProjected();
    let diam = 0;
    for (let i = 0; i < proj.length; i++) for (let j = i + 1; j < proj.length; j++) {
      diam = Math.max(diam, Math.hypot(proj[i][0] - proj[j][0], proj[i][1] - proj[j][1], proj[i][2] - proj[j][2]));
    }
    this.diam = diam;
    if (model === 'cells') {
      scale = opt.sizeMM / T.edgeLen;
      T.types.forEach((ty, i) => {
        groups.push({ P: { vertices: ty.rep.shape.vertices, faces: ty.rep.shape.faces }, count: ty.count, color: this.typeColor(i), name: ty.name });
      });
    } else if (model === 'hull') {
      const H = convexHull(proj, 1e-7);
      scale = opt.sizeMM / diam;
      groups.push({ P: H, count: 1, color: this.typeColor(0), name: tr('投影の外形', 'Projection hull') });
    } else if (model === 'puzzle') {
      const cellsP = [];
      let emax = 0;
      T.cells.forEach((c, ci) => {
        const pts = c.verts.map((v) => proj[v]);
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) emax = Math.max(emax, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]));
        if (ci === this.front) return; // 手前の胞は全体の外殻になる
        let H;
        try { H = convexHull(pts, 1e-9); } catch { return; }
        cellsP.push({ H, sig: shapeSignature(H.vertices), type: c.type });
      });
      scale = opt.sizeMM / (diam || emax);
      const bySig = new Map();
      for (const c of cellsP) {
        const g = bySig.get(c.sig);
        if (g) g.count++;
        else bySig.set(c.sig, { P: c.H, count: 1, color: this.typeColor(c.type), name: T.types[c.type].name + tr('（投影）', ' (projected)'), vol: Math.abs(volume3(c.H)) });
      }
      groups.push(...[...bySig.values()].sort((a, b) => b.vol - a.vol));
    } else {
      return { strut: this._struts(proj, opt, diam), dec: [], warn };
    }

    const dec = [];      // 印刷用（面積効率）
    const dispDec = [];  // 画面表示用（対称性）
    groups.forEach((g, gi) => {
      const label = gi < 26 ? LETTERS[gi] : 'Z' + (gi - 25);
      g.label = label;
      const P = g.P;
      const an = analyze(P);
      const tabMM = opt.tabMode === 'none' ? 0 : opt.tabMM;
      const unf = unfoldBest(P, an, { maxW: area.w / scale, maxH: (area.h - 6) / scale, margin: (tabMM + 1) / scale, tabH: tabMM / scale });
      const d = decorate(P, an, unf, { tabH: tabMM / scale, tabMode: opt.tabMode });
      const sym = unfoldSymmetric(P, an, { tabH: tabMM / scale, tabMode: opt.tabMode });
      g.symmetry = sym.symmetry;
      const finish = (list, out, forceAngle) => list.forEach((pc, k) => {
        pc.caption = `${label}${list.length > 1 ? '-' + (k + 1) : ''}  ${g.name}  × ${g.count}`;
        pc.colors = P.faces.map(() => g.color);
        for (const lb of pc.labels) lb.text = label + lb.text;
        for (const t of pc.tabs) t.label = label + t.label;
        if (forceAngle !== undefined && k === 0) pc.forceAngle = forceAngle;
        out.push(pc);
      });
      finish(d, dec);
      finish(sym.dec, dispDec, sym.symmetry.mirror ? Math.PI / 2 - sym.symmetry.axis : undefined);
    });
    return { dec, dispDec, scale, groups, warn, model };
  }

  _struts(proj, opt, diam) {
    const T = this.T;
    const L = T.edges.map(([a, b]) => Math.hypot(proj[a][0] - proj[b][0], proj[a][1] - proj[b][1], proj[a][2] - proj[b][2]));
    const scale = opt.sizeMM / diam;
    const m = new Map();
    for (const l of L) {
      const mm = (l * scale).toFixed(1);
      m.set(mm, (m.get(mm) || 0) + 1);
    }
    const rows = [...m.entries()].map(([mm, n]) => ({ mm: +mm, n })).sort((a, b) => b.mm - a.mm);
    const deg = new Map();
    const cnt = T.V.map(() => 0);
    for (const [a, b] of T.edges) { cnt[a]++; cnt[b]++; }
    for (const c of cnt) deg.set(c, (deg.get(c) || 0) + 1);
    const total = L.reduce((s, l) => s + l * scale, 0);
    return { rows, nodes: [...deg.entries()].sort((a, b) => a[0] - b[0]), total, scale, edges: T.edges.length, V: T.V.length };
  }

  // 標準投影の面（2次元面）を OBJ 用の多面体として返す
  projectedOBJ() {
    const proj = this._standardProjected();
    return { vertices: proj, faces: this.T.faces2.map((f) => f.verts) };
  }

  infoHTML(fmt) {
    const T = this.T;
    const legend = T.types.map((t, i) => `<li><span class="sw" style="background:${this.typeColor(i)}"></span><span>${t.name}</span><span class="ct">× ${t.count}</span></li>`).join('');
    const dh = T.dihedrals.slice(0, 8).map((d) => `<span>${d.deg.toFixed(2)}° ×${d.count}</span>`).join('');
    return `
      <div class="info-grid five">
        <div><b>${T.V.length}</b><span>${tr('頂点', 'vertices')}</span></div>
        <div><b>${T.edges.length}</b><span>${tr('辺', 'edges')}</span></div>
        <div><b>${T.faces2.length}</b><span>${tr('面', 'faces')}</span></div>
        <div><b>${T.cells.length}</b><span>${tr('胞', 'cells')}</span></div>
        <div><b>${T.euler}</b><span>χ</span></div>
      </div>
      <p class="info-h">${tr('胞の種類', 'Cell types')}</p>
      <ul class="legend">${legend}</ul>
      <p class="info-h">${tr('胞どうしの角（胞二面角）', 'Dihedral angles between cells')}</p>
      <div class="tags">${dh}</div>
      <p class="info-h">${tr('シュレーフリ記号', 'Schläfli symbol')}</p>
      <div class="tags"><span>${this.item.schlafli || '—'}</span></div>`;
  }
}

function wrap(a) { return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a; }
function volume3(P) {
  let v = 0;
  for (const f of P.faces) {
    const a = P.vertices[f[0]];
    for (let i = 1; i + 1 < f.length; i++) {
      const b = P.vertices[f[i]], c = P.vertices[f[i + 1]];
      v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  }
  return v / 6;
}
void normalize;
