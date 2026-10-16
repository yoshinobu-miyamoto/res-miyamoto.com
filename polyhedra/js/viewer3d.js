// viewer3d.js — three.js による多面体表示（慣性回転・折りたたみアニメーション・面のハイライト）
import * as THREE from '../vendor/three.module.min.js';

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class Viewer3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', '多面体の3D表示。ドラッグで回転、ホイールで拡大縮小');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    this.baseDist = 4.4;
    this.zoom = 1;
    this.camera.position.set(0, 0, this.baseDist);

    // 照明はカメラに固定（模型を回すと陰影が変わる）
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x30302c, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(-2.5, 3.2, 4);
    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.45);
    fill.position.set(3, -1, 2);
    const rim = new THREE.DirectionalLight(0xffe2b0, 0.6);
    rim.position.set(1, 2, -4);
    this.scene.add(key, fill, rim);

    this.model = new THREE.Group();   // 回転
    this.inner = new THREE.Group();   // 展開時の中心合わせ
    this.model.add(this.inner);
    this.scene.add(this.model);
    this.model.quaternion.setFromEuler(new THREE.Euler(0.42, -0.6, 0.08));

    this.opts = { faces: true, edges: true, vertices: false, opacity: 1, edgeWidth: 0.012, vertexSize: 0.025, edgeColor: '#c4a265', autoRotate: true };
    this.fold = 0;
    this.highlight = -1;
    this.onHover = null;
    this.angularVel = new THREE.Vector3();
    this.dirty = true;

    this._initControls();
    this._resize();
    new ResizeObserver(() => this._resize()).observe(container);
    this._tick = this._tick.bind(this);
    this._last = performance.now();
    requestAnimationFrame(this._tick);
  }

  // ---------- モデル ----------
  setModel(P, an, colors, fold) {
    this.P = P; this.an = an; this.foldInfo = fold;
    this._disposeModel();
    const nF = P.faces.length;
    let nTri = 0, nCorner = 0;
    for (const f of P.faces) { nTri += f.length - 2; nCorner += f.length; }
    this.triFace = new Int32Array(nTri);
    const pos = new Float32Array(nTri * 9);
    const nrm = new Float32Array(nTri * 9);
    const col = new Float32Array(nTri * 9);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo = geo;

    this.matFront = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 38, specular: 0x2a2a2a, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.matBack = new THREE.MeshPhongMaterial({ color: 0xece6da, flatShading: true, shininess: 4, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.meshFront = new THREE.Mesh(geo, this.matFront);
    this.meshBack = new THREE.Mesh(geo, this.matBack);
    this.inner.add(this.meshBack, this.meshFront);

    // ハイライト用
    this.hlGeo = new THREE.BufferGeometry();
    this.hlGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 9), 3));
    this.hlMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.hlMesh = new THREE.Mesh(this.hlGeo, this.hlMat);
    this.hlMesh.visible = false;
    this.inner.add(this.hlMesh);

    // 辺（円柱）と頂点（球）— 面ごとに持つので展開時も各面に追従する
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    const sph = new THREE.SphereGeometry(1, 18, 12);
    this.matEdge = new THREE.MeshPhongMaterial({ color: this.opts.edgeColor, shininess: 70, specular: 0x555555 });
    this.matVert = new THREE.MeshPhongMaterial({ color: this.opts.edgeColor, shininess: 90, specular: 0x777777 });
    this.edgeMesh = new THREE.InstancedMesh(cyl, this.matEdge, nCorner);
    this.vertMesh = new THREE.InstancedMesh(sph, this.matVert, nCorner);
    this.edgeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.vertMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.edgeMesh.frustumCulled = this.vertMesh.frustumCulled = false;
    this.inner.add(this.edgeMesh, this.vertMesh);

    this.faceMatrices = Array.from({ length: nF }, () => new THREE.Matrix4());
    this.setColors(colors);
    this._updateGeometry();
    this._applyOpts();
    this.dirty = true;
  }

  setFoldInfo(fold) { this.foldInfo = fold; this._updateGeometry(); }

  setColors(colors) {
    if (!this.geo) return;
    const col = this.geo.getAttribute('color');
    const c = new THREE.Color();
    let t = 0;
    this.P.faces.forEach((f, fi) => {
      c.set(colors[fi]);
      for (let k = 0; k < f.length - 2; k++) {
        for (let j = 0; j < 3; j++) col.setXYZ(t * 3 + j, c.r, c.g, c.b);
        this.triFace[t] = fi;
        t++;
      }
    });
    col.needsUpdate = true;
    this.dirty = true;
  }

  setOptions(o) { Object.assign(this.opts, o); this._applyOpts(); this._updateGeometry(); }

  _applyOpts() {
    if (!this.meshFront) return;
    const o = this.opts;
    this.meshFront.visible = this.meshBack.visible = o.faces;
    const transparent = o.opacity < 0.999;
    for (const m of [this.matFront, this.matBack]) {
      m.transparent = transparent; m.opacity = o.opacity; m.depthWrite = !transparent; m.needsUpdate = true;
    }
    this.edgeMesh.visible = o.edges;
    this.vertMesh.visible = o.vertices;
    this.matEdge.color.set(o.edgeColor);
    this.matVert.color.set(o.edgeColor);
    this.dirty = true;
  }

  // 頂点座標だけを差し替える（4次元回転など）
  updateVertices(vertices) {
    if (!this.P) return;
    this.P.vertices = vertices;
    this._updateGeometry();
  }

  setFold(t) {
    this.fold = Math.max(0, Math.min(1, t));
    if (this.fold === 0) this.orientLock = false;
    this._updateGeometry();
  }

  // 展開につれて、根の面（展開図の台紙）を正面に向ける
  _orientTarget() {
    if (!this.foldInfo || !this.an) return null;
    const root = this.foldInfo.order[0];
    const n = this.an.normals[root];
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(n[0], n[1], n[2]), new THREE.Vector3(0, 0, 1));
  }

  setHighlight(f) {
    const key = Array.isArray(f) ? f.join(',') : String(f);
    if (key === this._hlKey) return;
    this._hlKey = key;
    this.highlight = f;
    this._updateHighlight();
    this.dirty = true;
  }

  _computeFaceMatrices() {
    const P = this.P, F = this.foldInfo;
    const t = this.fold;
    const M = this.faceMatrices;
    for (const m of M) m.identity();
    if (!F || t <= 0) return;
    const R = new THREE.Matrix4(), T1 = new THREE.Matrix4(), T2 = new THREE.Matrix4();
    const ax = new THREE.Vector3();
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    for (const f of F.order) {
      const h = F.hinges[f];
      if (!h) { M[f].identity(); continue; }
      ax.set(h.axis[0], h.axis[1], h.axis[2]);
      T1.makeTranslation(h.origin[0], h.origin[1], h.origin[2]);
      R.makeRotationAxis(ax, h.angle * ease);
      T2.makeTranslation(-h.origin[0], -h.origin[1], -h.origin[2]);
      M[f].copy(M[h.parent]).multiply(T1).multiply(R).multiply(T2);
    }
    void P;
  }

  _updateGeometry() {
    if (!this.geo) return;
    this._computeFaceMatrices();
    const P = this.P, M = this.faceMatrices;
    const pos = this.geo.getAttribute('position');
    const nrm = this.geo.getAttribute('normal');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    const world = P.faces.map((f, fi) => f.map((vi) => new THREE.Vector3(...P.vertices[vi]).applyMatrix4(M[fi])));
    this.worldFaces = world;
    let t = 0;
    // 展開中は全体の中心を原点に寄せる
    const box = new THREE.Box3();
    world.forEach((pts) => pts.forEach((p) => box.expandByPoint(p)));
    const center = this.fold > 0 ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    this.inner.position.copy(center).multiplyScalar(-1);
    let rmax = 0;
    world.forEach((pts) => {
      for (const p of pts) rmax = Math.max(rmax, p.distanceTo(center));
      for (let k = 1; k + 1 < pts.length; k++) {
        a.copy(pts[0]); b.copy(pts[k]); c.copy(pts[k + 1]);
        n.subVectors(b, a).cross(tmpV.subVectors(c, a)).normalize();
        pos.setXYZ(t * 3, a.x, a.y, a.z); pos.setXYZ(t * 3 + 1, b.x, b.y, b.z); pos.setXYZ(t * 3 + 2, c.x, c.y, c.z);
        for (let j = 0; j < 3; j++) nrm.setXYZ(t * 3 + j, n.x, n.y, n.z);
        t++;
      }
    });
    pos.needsUpdate = true; nrm.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.extent = rmax;

    // 辺・頂点
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    // 4次元の投影は大きさが変わるので、見かけの太さが一定になるよう全体の大きさに比例させる
    const ks = this.fitAll ? Math.max(0.02, this.extent || 1) : 1;
    const er = this.opts.edgeWidth * ks, vr = this.opts.vertexSize * ks;
    let i = 0;
    const seen = new Set();
    const showAll = this.fold > 0;
    world.forEach((pts, fi) => {
      const face = P.faces[fi];
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k], r = pts[(k + 1) % pts.length];
        const key = Math.min(face[k], face[(k + 1) % face.length]) + ',' + Math.max(face[k], face[(k + 1) % face.length]);
        const dup = !showAll && seen.has(key);
        seen.add(key);
        dir.subVectors(r, p);
        const L = dir.length();
        mid.addVectors(p, r).multiplyScalar(0.5);
        q.setFromUnitVectors(UP, dir.normalize());
        s.set(dup ? 0 : er, dup ? 0 : L, dup ? 0 : er);
        m.compose(mid, q, s);
        this.edgeMesh.setMatrixAt(i, m);
        const vkey = 'v' + face[k];
        const vdup = !showAll && seen.has(vkey);
        seen.add(vkey);
        s.setScalar(vdup ? 0 : vr);
        m.compose(p, tmpQ.identity(), s);
        this.vertMesh.setMatrixAt(i, m);
        i++;
      }
    });
    this.edgeMesh.instanceMatrix.needsUpdate = true;
    this.vertMesh.instanceMatrix.needsUpdate = true;
    this.edgeMesh.computeBoundingSphere?.();
    this.vertMesh.computeBoundingSphere?.();
    this._updateHighlight();
    this.dirty = true;
  }

  _updateHighlight() {
    if (!this.hlMesh) return;
    const list = (Array.isArray(this.highlight) ? this.highlight : [this.highlight]).filter((f) => f >= 0 && this.worldFaces && this.worldFaces[f]);
    if (!list.length) { this.hlMesh.visible = false; return; }
    let need = 0;
    for (const f of list) need += (this.worldFaces[f].length - 2) * 9;
    let attr = this.hlGeo.getAttribute('position');
    if (attr.array.length < need) {
      attr = new THREE.BufferAttribute(new Float32Array(need), 3);
      this.hlGeo.setAttribute('position', attr);
    }
    let t = 0;
    for (const f of list) {
      const pts = this.worldFaces[f];
      for (let k = 1; k + 1 < pts.length; k++) {
        for (const p of [pts[0], pts[k], pts[k + 1]]) attr.setXYZ(t++, p.x, p.y, p.z);
      }
    }
    this.hlGeo.setDrawRange(0, t);
    attr.needsUpdate = true;
    this.hlGeo.computeBoundingSphere();
    this.hlMesh.visible = true;
  }

  _disposeModel() {
    for (const o of [...this.inner.children]) {
      this.inner.remove(o);
      o.geometry?.dispose();
      o.material?.dispose?.();
    }
  }

  // ---------- 操作 ----------
  _initControls() {
    const el = this.canvas;
    el.style.touchAction = 'none';
    const pointers = new Map();
    let lastX = 0, lastY = 0, lastT = 0, pinch0 = 0, zoom0 = 1, moved = false;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); moved = false;
      this.angularVel.set(0, 0, 0);
      this.dragging = true;
      if (this.fold > 0) this.orientLock = true;
      if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        pinch0 = Math.hypot(p.x - q.x, p.y - q.y); zoom0 = this.zoom;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) { this._hover(e); return; }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (pinch0 > 0) this.setZoom(zoom0 * (d / pinch0));
        return;
      }
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const k = 3.2 / Math.min(el.clientWidth, el.clientHeight);
      this._rotate(dy * k, dx * k);
      // 慣性用の角速度（rad/ms）
      this.angularVel.set((dy * k) / dt, (dx * k) / dt, 0);
      lastX = e.clientX; lastY = e.clientY; lastT = now;
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        this.dragging = false;
        if (performance.now() - lastT > 80) this.angularVel.set(0, 0, 0);
        if (!moved) this._hover(e, true);
      }
      pinch0 = 0;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => { if (!this.dragging && this.onHover) this.onHover(-1); });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0012));
    }, { passive: false });
    el.addEventListener('dblclick', () => this.resetView());
  }

  setZoom(z) { this.zoom = Math.max(0.35, Math.min(4, z)); this.dirty = true; }

  // 初めの向きを指定する（オイラー角 [x, y, z]）
  setOrientation(e) {
    this.model.quaternion.setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    this.angularVel.set(0, 0, 0);
    this.dirty = true;
  }

  resetView() {
    this.model.quaternion.setFromEuler(new THREE.Euler(0.42, -0.6, 0.08));
    this.zoom = 1; this.angularVel.set(0, 0, 0); this.dirty = true;
  }

  _rotate(ax, ay) {
    tmpQ.setFromAxisAngle(tmpV.set(1, 0, 0), ax);
    this.model.quaternion.premultiply(tmpQ);
    tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), ay);
    this.model.quaternion.premultiply(tmpQ);
    this.dirty = true;
  }

  _hover(e, click = false) {
    if (!this.meshFront || !this.onHover) return;
    const r = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, this.camera);
    const hit = this.opts.faces ? rc.intersectObjects([this.meshFront, this.meshBack], false)[0] : null;
    const f = hit ? this.triFace[hit.faceIndex] : -1;
    this.onHover(f, click);
  }

  _resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  _tick(now) {
    const dt = Math.min(50, now - this._last);
    this._last = now;
    if (!this.dragging) {
      const v = this.angularVel;
      if (v.lengthSq() > 1e-12) {
        this._rotate(v.x * dt, v.y * dt);
        v.multiplyScalar(Math.pow(0.9975, dt));
        if (v.lengthSq() < 1e-10) v.set(0, 0, 0);
      } else if (this.fold > 0.01 && !this.orientLock) {
        const q = this._orientTarget();
        if (q && this.model.quaternion.angleTo(q) > 1e-4) {
          this.model.quaternion.slerp(q, 1 - Math.pow(1 - 0.006 * this.fold, dt));
          this.dirty = true;
        }
      } else if (this.opts.autoRotate && !this.reduceMotion && this.fold <= 0.01) {
        this._rotate(0, 0.00022 * dt);
      }
    }
    // 展開時は全体が収まるよう距離を調整
    const ext = this.fitAll ? Math.max(0.02, this.extent || 1) : Math.max(1, (this.extent || 1) * 0.92);
    const aspectFit = Math.min(1, this.camera.aspect * 1.08);
    const target = (this.baseDist * ext) / this.zoom / aspectFit;
    const z = this.camera.position.z;
    if (Math.abs(z - target) > 1e-4) {
      this.camera.position.z = z + (target - z) * Math.min(1, dt * 0.012);
      this.dirty = true;
    }
    if (this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
    requestAnimationFrame(this._tick);
  }

  screenshot(scale = 2) {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h, false);
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');
    this.renderer.setPixelRatio(pr);
    this._resize();
    return url;
  }
}
