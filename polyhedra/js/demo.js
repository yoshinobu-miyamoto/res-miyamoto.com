// demo.js — 自己紹介（デモ・モード）
// 見栄えのする代表例を、回転・展開・4次元回転で順に見せる。
// クリック・キー・タップ・ホイールで終了し、もとの表示に戻る。

const SCENES = [
  {
    id: 'tI', ja: '切頂二十面体', en: 'Truncated icosahedron',
    note: '正五角形12枚と正六角形20枚。展開すると、1枚の型紙になります。',
    steps: [['wait', 2600], ['fold', 0, 1, 3600], ['wait', 2200], ['fold', 1, 0, 3000], ['wait', 600]],
  },
  {
    id: 'GD', param: 4, ja: 'ジオデシックドーム 4V', en: 'Geodesic dome',
    view: [-1.22, 0, 0], // ドームの軸を縦にして、斜め上から見る
    note: '建築でおなじみの構造。合同な三角形の種類ごとに色を分けています。',
    steps: [['wait', 2400], ['fold', 0, 1, 4200], ['wait', 2200], ['fold', 1, 0, 3200], ['wait', 600]],
  },
  {
    id: 'gsD', ja: '大星型十二面体', en: 'Great stellated dodecahedron',
    note: 'ケプラー＝ポアンソの星型正多面体。60枚の黄金三角形でできています。',
    steps: [['wait', 3000], ['fold', 0, 1, 3800], ['wait', 2000], ['fold', 1, 0, 3200], ['wait', 600]],
  },
  {
    id: '8C', ja: '正八胞体（テッセラクト）', en: 'Tesseract — the 4D cube',
    note: '四次元の立方体。4次元で回したあと、8つの立方体が三次元の十字形に開きます。',
    steps: [['spin4', true], ['wait', 6500], ['spin4', false], ['rot4zero'], ['wait', 900], ['fold', 0, 1, 3800], ['wait', 2600], ['fold', 1, 0, 3200], ['wait', 600]],
  },
  {
    id: '24C', ja: '正二十四胞体', en: '24-cell',
    note: '三次元に対応するもののない、四次元だけの正多胞体。24個の正八面体が開きます。',
    steps: [['wait', 2600], ['fold', 0, 1, 4200], ['wait', 2600], ['fold', 1, 0, 3400], ['wait', 600]],
  },
  {
    id: '120C', ja: '正百二十胞体', en: '120-cell',
    note: '120個の正十二面体でできた四次元の正多胞体。シュレーゲル図で、内側まで透けて見えます。',
    steps: [['wait', 1800], ['spin4', true], ['wait', 9000], ['spin4', false], ['rot4zero'], ['wait', 1200]],
  },
];

const INTRO_MS = 4200;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * api: {
 *   load(id, param) -> Promise   形を読み込み、準備ができたら解決
 *   setFold(t)                   展開の度合い
 *   setSpin4(on)                 4次元の自動回転
 *   rot4Zero()                   4次元回転を 0° に
 *   enter() / leave()            画面の切り替え（パネルを隠す・戻す）
 * }
 */
export class Demo {
  constructor(api, el) {
    this.api = api;
    this.el = el; // オーバーレイ要素
    this.running = false;
    this.token = 0;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    const token = ++this.token;
    this.api.enter();
    this.el.hidden = false;
    this.el.classList.remove('show-scene');
    try {
      for (let loop = 0; this.alive(token); loop++) {
        await this.intro(token);
        for (let i = 0; i < SCENES.length && this.alive(token); i++) {
          await this.scene(SCENES[i], i, token);
        }
      }
    } catch (e) {
      if (this.alive(token)) console.error(e);
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.token++;
    this.api.setSpin4(false);
    this.el.hidden = true;
    this.el.classList.remove('show-scene', 'show-intro');
    this.api.leave();
  }

  alive(token) { return this.running && token === this.token; }

  wait(ms, token) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        if (!this.alive(token) || performance.now() - t0 >= ms) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  animateFold(from, to, ms, token) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = (now) => {
        if (!this.alive(token)) { resolve(); return; }
        const k = Math.min(1, (now - t0) / ms);
        this.api.setFold(from + (to - from) * ease(k));
        if (k < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  async intro(token) {
    this.el.classList.remove('show-scene');
    this.el.classList.add('show-intro');
    this.setProgress(0);
    await this.wait(INTRO_MS, token);
    this.el.classList.remove('show-intro');
  }

  async scene(sc, i, token) {
    this.api.setFold(0);
    await this.api.load(sc.id, sc.param, sc.view);
    if (!this.alive(token)) return;
    this.el.querySelector('.demo-ja').textContent = sc.ja;
    this.el.querySelector('.demo-en').textContent = sc.en;
    this.el.querySelector('.demo-note').textContent = sc.note;
    this.el.querySelector('.demo-count').textContent = `${i + 1} / ${SCENES.length}`;
    this.setProgress((i + 1) / SCENES.length);
    this.el.classList.add('show-scene');
    for (const [kind, a, b, c] of sc.steps) {
      if (!this.alive(token)) return;
      if (kind === 'wait') await this.wait(a, token);
      else if (kind === 'fold') await this.animateFold(a, b, c, token);
      else if (kind === 'spin4') this.api.setSpin4(a);
      else if (kind === 'rot4zero') this.api.rot4Zero();
    }
    this.el.classList.remove('show-scene');
    await this.wait(500, token);
  }

  setProgress(k) {
    const bar = this.el.querySelector('.demo-progress span');
    if (bar) bar.style.width = `${Math.round(k * 100)}%`;
  }
}

export const DEMO_SCENES = SCENES;
