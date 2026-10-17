// mobile.js — スマホ向けの操作画面
// 立体表示の下に、タブ（親メニュー）つきの操作パネルを置く。
// 各ブロックを data-mtab の値でタブに振り分け、狭い画面のときだけパネルへ移す。
// スライダーは「− 値 ＋」のステッパーに置き換える（狭い画面のときだけ表示）。

import { L } from './i18n.js';

const MQ = '(max-width: 920px)';
const TAB_KEY = 'hyperfolder-mobile-tab';
export const TABS = [
  { id: 'shape', ja: '形', en: 'Shape', icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>' },
  { id: '4d', ja: '4D', en: '4D', icon: '<rect x="4" y="4" width="10" height="10"/><rect x="10" y="10" width="10" height="10"/><path d="M4 4l6 6M14 4l6 6M4 14l6 6M14 14l6 6"/>' },
  { id: 'view', ja: '表示', en: 'View', icon: '<circle cx="12" cy="12" r="3"/><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>' },
  { id: 'paper', ja: '型紙', en: 'Paper', icon: '<path d="M4 20l4-16h8l4 16z"/><path d="M8 4l4 16 4-16"/>' },
  { id: 'export', ja: '書出', en: 'Export', icon: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>' },
  { id: 'info', ja: '情報', en: 'Info', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>' },
];

export class MobileUI {
  constructor() {
    this.mq = window.matchMedia(MQ);
    this.blocks = [...document.querySelectorAll('[data-mtab]')];
    // 元の位置に目印を置き、パソコン表示に戻すときに使う
    this.homes = this.blocks.map((b) => {
      const mark = document.createComment('mtab-home');
      b.parentNode.insertBefore(mark, b);
      return mark;
    });
    let saved = null;
    try { saved = localStorage.getItem(TAB_KEY); } catch { /* 保存できない環境 */ }
    this.tab = TABS.some((t) => t.id === saved) ? saved : 'shape';
    this.has4d = false;
    this.build();
    this.enhanceSliders();
    this.apply();
    this.mq.addEventListener('change', () => this.apply());
  }

  build() {
    const sheet = document.createElement('section');
    sheet.id = 'msheet';
    sheet.setAttribute('aria-label', '操作パネル');
    sheet.innerHTML = `
      <nav class="mtabs" role="tablist" aria-label="操作の種類">
        ${TABS.map((t) => `<button type="button" role="tab" data-tab="${t.id}"><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg><span class="mt-l">${L(t.ja, t.en)}</span></button>`).join('')}
        <button type="button" class="msheet-size" id="msheet-size" aria-label="パネルを広げる" title="パネルを広げる／縮める">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>
        </button>
      </nav>
      <div class="msheet-body" id="msheet-body"></div>`;
    document.getElementById('app').appendChild(sheet);
    this.sheet = sheet;
    this.body = sheet.querySelector('#msheet-body');
    for (const b of sheet.querySelectorAll('[data-tab]')) {
      b.addEventListener('click', () => this.setTab(b.dataset.tab));
    }
    sheet.querySelector('#msheet-size').addEventListener('click', () => {
      document.body.classList.toggle('msheet-tall');
      this.relabel();
    });
  }

  // 言語を切り替えたときの表示
  relabel() {
    for (const b of this.sheet.querySelectorAll('[data-tab]')) {
      const t = TABS.find((x) => x.id === b.dataset.tab);
      b.querySelector('.mt-l').textContent = L(t.ja, t.en);
    }
    const tall = document.body.classList.contains('msheet-tall');
    this.sheet.querySelector('#msheet-size').setAttribute('aria-label', tall ? L('パネルを縮める', 'Shrink panel') : L('パネルを広げる', 'Enlarge panel'));
  }

  get mobile() { return this.mq.matches; }

  // 四次元のときだけ 4D タブを出す
  set4D(on) {
    this.has4d = on;
    if (on && this.mobile) this.setTab('4d');
    else if (!on && this.tab === '4d') this.setTab('shape');
    else this.refresh();
  }

  setTab(id) {
    this.tab = id;
    try { localStorage.setItem(TAB_KEY, id); } catch { /* 無視 */ }
    this.refresh();
    this.body.scrollTop = 0;
  }

  apply() {
    if (this.mobile) {
      document.body.classList.add('mobile-ui');
      const order = TABS.map((t) => t.id);
      const sorted = [...this.blocks].sort((a, b) =>
        order.indexOf(a.dataset.mtab) - order.indexOf(b.dataset.mtab) || (+a.dataset.morder || 0) - (+b.dataset.morder || 0));
      for (const b of sorted) {
        this.body.appendChild(b);
        if (b.tagName === 'DETAILS') b.open = true; // タブが見出しの代わり
      }
    } else {
      document.body.classList.remove('mobile-ui', 'msheet-tall');
      this.blocks.forEach((b, i) => this.homes[i].parentNode.insertBefore(b, this.homes[i]));
      for (const b of this.blocks) b.classList.remove('m-off');
    }
    this.refresh();
  }

  refresh() {
    if (!this.has4d && this.tab === '4d') this.tab = 'shape';
    for (const btn of this.sheet.querySelectorAll('[data-tab]')) {
      const on = btn.dataset.tab === this.tab;
      btn.setAttribute('aria-selected', String(on));
      btn.hidden = btn.dataset.tab === '4d' && !this.has4d;
    }
    if (!this.mobile) return;
    for (const b of this.blocks) b.classList.toggle('m-off', b.dataset.mtab !== this.tab);
  }

  // ---------- スライダー → ステッパー ----------
  enhanceSliders() {
    for (const r of document.querySelectorAll('input[type="range"]:not(#fold)')) {
      const st = document.createElement('span');
      st.className = 'stepper';
      st.innerHTML = '<button type="button" class="st-dn" aria-label="減らす">−</button><span class="st-val" aria-live="polite"></span><button type="button" class="st-up" aria-label="増やす">＋</button>';
      r.insertAdjacentElement('afterend', st);
      const out = document.getElementById(r.id + '-out');
      const val = st.querySelector('.st-val');
      const show = () => { val.textContent = out && out.textContent.trim() ? out.textContent : r.value; };
      const step = parseFloat(r.step) || 1;
      const min = parseFloat(r.min), max = parseFloat(r.max);
      // 1回の操作で動く量: 指定があればそれ、なければ全体の約1/12
      const inc = r.dataset.mstep ? parseFloat(r.dataset.mstep) : Math.max(step, Math.round((max - min) / 12 / step) * step);
      const bump = (dir) => {
        let v = parseFloat(r.value) + dir * inc;
        v = Math.round(v / step) * step;
        v = Math.max(min, Math.min(max, v));
        r.value = String(+v.toFixed(6));
        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));
        show();
      };
      // 長押しで連続して変える
      for (const [sel, dir] of [['.st-dn', -1], ['.st-up', 1]]) {
        const b = st.querySelector(sel);
        let timer = null;
        const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; };
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          bump(dir);
          timer = setTimeout(() => { timer = setInterval(() => bump(dir), 90); }, 420);
        });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
        b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(dir); } });
      }
      r.addEventListener('input', show);
      if (out) new MutationObserver(show).observe(out, { childList: true, characterData: true, subtree: true });
      show();
    }
  }
}
