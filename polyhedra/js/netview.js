// netview.js — 展開図の用紙割付・SVG/DXF 出力
import { minRect } from './unfold.js';

export const PAPERS = {
  A4: { ja: 'A4', w: 210, h: 297 },
  A3: { ja: 'A3', w: 297, h: 420 },
  B4: { ja: 'B4', w: 257, h: 364 },
  B5: { ja: 'B5', w: 182, h: 257 },
  Letter: { ja: 'レター', w: 215.9, h: 279.4 },
};

export const PAGE_MARGIN = 10; // mm
export const FOOTER_H = 11; // mm

export function printableArea(paperKey, landscape) {
  const p = PAPERS[paperKey] || PAPERS.A4;
  const W = landscape ? p.h : p.w, H = landscape ? p.w : p.h;
  return { W, H, w: W - 2 * PAGE_MARGIN, h: H - 2 * PAGE_MARGIN - FOOTER_H };
}

const rot = (p, c, s) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];

// ピースを mm 単位に変換し、最小外接長方形の向きに回転させる
function preparePiece(pc, scale) {
  const all = [];
  for (const f of pc.faces) all.push(...f.pts);
  for (const t of pc.tabs) all.push(...t.poly);
  const r = minRect(all);
  // 横長に置く
  let ang = -r.angle;
  if (r.h > r.w) ang += Math.PI / 2;
  const c = Math.cos(ang), s = Math.sin(ang);
  const T = (p) => { const q = rot(p, c, s); return [q[0] * scale, q[1] * scale]; };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of all) {
    const q = T(p);
    x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
  }
  // SVG は y 下向き。外側から見た向きを保つため y を反転
  const tf = (p) => { const q = T(p); return [q[0] - x0, y1 - q[1]]; };
  return { tf, w: x1 - x0, h: y1 - y0 };
}

// 棚詰め（高さ降順、First-Fit）
export function layoutPages(dec, { scale, paper = 'A4', landscape = false, gap = 3 }) {
  const area = printableArea(paper, landscape);
  const items = dec.map((pc, i) => ({ i, ...preparePiece(pc, scale) }));
  // 用紙に合わせて縦横を選ぶ
  for (const it of items) {
    if (it.w > area.w && it.h <= area.w && it.w <= area.h) {
      const { tf } = it;
      const H = it.h;
      it.tf = (p) => { const q = tf(p); return [H - q[1], q[0]]; };
      [it.w, it.h] = [it.h, it.w];
    }
    it.oversize = it.w > area.w + 1e-6 || it.h > area.h + 1e-6;
  }
  items.sort((a, b) => b.h - a.h);
  const pages = [];
  for (const it of items) {
    let placed = false;
    for (const pg of pages) {
      for (const sh of pg.shelves) {
        if (sh.x + it.w <= area.w + 1e-6 && it.h <= sh.h + 1e-6) {
          pg.items.push({ ...it, x: sh.x, y: sh.y });
          sh.x += it.w + gap; placed = true; break;
        }
      }
      if (placed) break;
      const ny = pg.shelves.length ? pg.shelves[pg.shelves.length - 1].y + pg.shelves[pg.shelves.length - 1].h + gap : 0;
      if (ny + it.h <= area.h + 1e-6 && it.w <= area.w + 1e-6) {
        pg.shelves.push({ y: ny, h: it.h, x: it.w + gap });
        pg.items.push({ ...it, x: 0, y: ny });
        placed = true; break;
      }
    }
    if (!placed) {
      pages.push({ shelves: [{ y: 0, h: it.h, x: it.w + gap }], items: [{ ...it, x: 0, y: 0 }] });
    }
  }
  // 各ページで中央寄せ
  for (const pg of pages) {
    let mw = 0, mh = 0;
    for (const it of pg.items) { mw = Math.max(mw, it.x + it.w); mh = Math.max(mh, it.y + it.h); }
    pg.ox = PAGE_MARGIN + Math.max(0, (area.w - mw) / 2);
    pg.oy = PAGE_MARGIN + Math.max(0, (area.h - mh) / 2);
  }
  return { pages, area };
}

const f2 = (x) => (Math.round(x * 100) / 100).toString();
const ptsAttr = (pts) => pts.map((p) => f2(p[0]) + ',' + f2(p[1])).join(' ');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (x) => Math.round(x + (255 - x) * k);
  return '#' + [m(r), m(g), m(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * 1ページ分の SVG を生成
 * opt: { colors, colorFaces, labels, title, notation, edgeMM, pageNo, pageCount, interactive, paper, landscape }
 */
export function pageSVG(page, dec, layout, opt) {
  const { W, H } = printableArea(opt.paper, opt.landscape);
  const out = [];
  const lw = { cut: 0.28, fold: 0.22 };
  const attrs = opt.interactive
    ? `class="net-page" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"`
    : `width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"`;
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>`);
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<g font-family="'Noto Sans JP','Hiragino Sans','Yu Gothic',sans-serif">`);
  for (const it of page.items) {
    const pc = dec[it.i];
    const tf = (p) => { const q = it.tf(p); return [q[0] + it.x + page.ox, q[1] + it.y + page.oy]; };
    out.push(`<g data-piece="${it.i}">`);
    // のりしろ
    for (const t of pc.tabs) {
      out.push(`<polygon points="${ptsAttr(t.poly.map(tf))}" fill="#ecebe7" stroke="#222" stroke-width="${lw.cut}" stroke-linejoin="round"/>`);
    }
    // 面
    for (const f of pc.faces) {
      const fill = opt.colorFaces ? lighten(opt.colors[f.f], 0.18) : '#ffffff';
      out.push(`<polygon data-f="${f.f}" points="${ptsAttr(f.pts.map(tf))}" fill="${fill}" stroke="none"/>`);
    }
    // 折り線
    for (const fl of pc.folds) {
      const a = tf(fl.p), b = tf(fl.q);
      const dash = fl.mountain ? '2.4 0.9 0.5 0.9' : '1.4 1.0';
      const color = fl.mountain ? '#3a3a3a' : '#2f5f9e';
      out.push(`<line x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}" stroke="${color}" stroke-width="${lw.fold}" stroke-dasharray="${dash}"/>`);
    }
    // 切り取り線
    for (const [p, q] of pc.cuts) {
      const a = tf(p), b = tf(q);
      out.push(`<line x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}" stroke="#1d1d1d" stroke-width="${lw.cut}" stroke-linecap="round"/>`);
    }
    // 番号
    if (opt.labels) {
      for (const lb of pc.labels) {
        const a = tf(lb.p), b = tf(lb.q);
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L = Math.hypot(dx, dy);
        const fs = Math.max(1.6, Math.min(3.2, L * 0.2));
        // 面の内側（SVG で y 反転済みなので左右が逆）
        const nx = -dy / L, ny = dx / L;
        const off = fs * 0.85;
        const cx = (a[0] + b[0]) / 2 - nx * off, cy = (a[1] + b[1]) / 2 - ny * off;
        let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
        out.push(`<text x="${f2(cx)}" y="${f2(cy)}" font-size="${f2(fs)}" fill="#6b5a33" text-anchor="middle" dominant-baseline="central" transform="rotate(${f2(ang)} ${f2(cx)} ${f2(cy)})">${esc(lb.text)}</text>`);
      }
    }
    out.push('</g>');
  }
  // フッター: 名称・縮尺・凡例・校正用スケール
  const fy = H - PAGE_MARGIN - 3.2;
  const x0 = PAGE_MARGIN;
  out.push(`<g font-size="2.6" fill="#555">`);
  out.push(`<text x="${x0}" y="${f2(fy)}">${esc(opt.title)}${opt.notation ? '  ·  ' + esc(opt.notation) : ''}  ·  最長辺 ${f2(opt.edgeMM)} mm  ·  ${opt.pageNo} / ${opt.pageCount}</text>`);
  // 凡例
  const ly = fy - 4.4;
  const leg = [
    ['切り取り', '#1d1d1d', ''],
    ['山折り', '#3a3a3a', '2.4 0.9 0.5 0.9'],
    ['谷折り', '#2f5f9e', '1.4 1.0'],
  ];
  let lx = x0;
  for (const [name, col, dash] of leg) {
    out.push(`<line x1="${lx}" y1="${f2(ly)}" x2="${lx + 8}" y2="${f2(ly)}" stroke="${col}" stroke-width="0.28" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`);
    out.push(`<text x="${lx + 9.5}" y="${f2(ly + 0.9)}">${name}</text>`);
    lx += 26;
  }
  out.push(`<rect x="${lx}" y="${f2(ly - 1.6)}" width="6" height="3.2" fill="#ecebe7" stroke="#1d1d1d" stroke-width="0.2"/><text x="${lx + 7.5}" y="${f2(ly + 0.9)}">のりしろ</text>`);
  // 50mm 校正バー（印刷倍率の確認用）
  const bx = W - PAGE_MARGIN - 50;
  out.push(`<line x1="${bx}" y1="${f2(fy - 1)}" x2="${bx + 50}" y2="${f2(fy - 1)}" stroke="#555" stroke-width="0.3"/>`);
  out.push(`<line x1="${bx}" y1="${f2(fy - 2.6)}" x2="${bx}" y2="${f2(fy + 0.6)}" stroke="#555" stroke-width="0.3"/>`);
  out.push(`<line x1="${bx + 50}" y1="${f2(fy - 2.6)}" x2="${bx + 50}" y2="${f2(fy + 0.6)}" stroke="#555" stroke-width="0.3"/>`);
  out.push(`<text x="${bx + 25}" y="${f2(fy - 2.2)}" text-anchor="middle">50 mm（印刷倍率の確認用）</text>`);
  out.push('</g>');
  out.push('</g></svg>');
  return out.join('');
}

// DXF（R12 ASCII）: レイヤー CUT / MOUNTAIN / VALLEY / LABEL。単位 mm
export function toDXF(layout, dec, opt) {
  const { W, H } = printableArea(opt.paper, opt.landscape);
  const L = [];
  const push = (...a) => L.push(...a.map(String));
  push(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 4);
  for (const [name, color] of [['CUT', 7], ['MOUNTAIN', 1], ['VALLEY', 5], ['LABEL', 3]]) {
    push(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
  }
  push(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const line = (layer, a, b) => push(0, 'LINE', 8, layer, 10, a[0].toFixed(4), 20, a[1].toFixed(4), 30, 0, 11, b[0].toFixed(4), 21, b[1].toFixed(4), 31, 0);
  layout.pages.forEach((page, pi) => {
    const offX = pi * (W + 20);
    for (const it of page.items) {
      const pc = dec[it.i];
      const tf = (p) => { const q = it.tf(p); return [q[0] + it.x + page.ox + offX, H - (q[1] + it.y + page.oy)]; };
      for (const [p, q] of pc.cuts) line('CUT', tf(p), tf(q));
      for (const t of pc.tabs) {
        const P = t.poly.map(tf);
        line('CUT', P[1], P[2]); line('CUT', P[2], P[3]); line('CUT', P[3], P[0]);
      }
      for (const fl of pc.folds) line(fl.mountain ? 'MOUNTAIN' : 'VALLEY', tf(fl.p), tf(fl.q));
      if (opt.labels) {
        for (const lb of pc.labels) {
          const a = tf(lb.p), b = tf(lb.q);
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const len = Math.hypot(dx, dy);
          const fs = Math.max(1.6, Math.min(3.2, len * 0.2));
          const nx = -dy / len, ny = dx / len;
          const cx = (a[0] + b[0]) / 2 + nx * fs * 0.85, cy = (a[1] + b[1]) / 2 + ny * fs * 0.85;
          let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
          push(0, 'TEXT', 8, 'LABEL', 10, cx.toFixed(3), 20, cy.toFixed(3), 30, 0, 40, (fs * 0.8).toFixed(3), 1, lb.text, 50, ang.toFixed(2), 72, 1, 73, 2, 11, cx.toFixed(3), 21, cy.toFixed(3), 31, 0);
        }
      }
    }
  });
  push(0, 'ENDSEC', 0, 'EOF');
  return L.join('\n');
}

export function toOBJ(P, name) {
  const lines = [`# ${name} — RES Polyhedra Studio`, `o ${name.replace(/\s+/g, '_')}`];
  for (const v of P.vertices) lines.push(`v ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`);
  for (const f of P.faces) lines.push('f ' + f.map((i) => i + 1).join(' '));
  return lines.join('\n') + '\n';
}
