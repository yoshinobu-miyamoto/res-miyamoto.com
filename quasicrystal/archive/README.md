# QUASICRYSTAL — 掲載資料の出典

2026年2月24日（14:17 JST）送信のメールに添付した保存版を、2026年10月16日に本人がアップロードしたものを採用した。
メール本文・宛先・やり取りは公開対象に含めない。

## 原本（送信時のまま、変更なし）

| 公開パス | 添付時のファイル名 | SHA-256 |
|---|---|---|
| `archive/QUASICRYSTAL-3D-Demo-2026-02-24.html` | QUASICRYSTAL 3D Demo.html | `37c1c4b764a3f43534afb782b4fcaa3b4539366064bd531b24932a43c28c97a5` |
| `docs/quasicrystal-manual-2026-02-24.pdf` | QUASICRYSTAL 取扱説明書.pdf | `94a677cc8b010d7ae522c660f468a25e292a0f58be6b43aee84baa4378965e3a` |
| `docs/quasicrystal-technical-2026-02-24.pdf` | QUASICRYSTAL技術文書.pdf | `686e984589a077ba284d02cd5e9b884f218c2b59b0392a07c95124d5adccbdf2` |

- PDF は Google ドキュメントから印刷したもの（作成日時: 取扱説明書 2026-02-24 13:54 JST、技術文書 同 13:57 JST）。
  元の Google ドキュメントはその後編集されていない。
- 紹介画像 `QuasiCrystal_Web_Apps_img.png`（2D/3D アプリを並べた画面）は掲載せず、
  `quasicrystal-thumb.webp` は公開版アプリの実画面から作成した。
- 改訂版の PDF はない。資料と現行アプリの差（デモの終了はタイトル文字の再タップ）は紹介ページに注記した。

## 公開版アプリ `app/index.html` での変更点（原本との差分）

幾何生成と操作のコードは原本のまま。変更は掲載に必要な次の点だけ。

1. Tailwind CSS: CDN（cdn.tailwindcss.com）をやめ、ページ内のクラスから書き出した静的 CSS `app/tailwind.css`（Tailwind v3.4.19）を読み込む。
2. Three.js: CDN の three@0.150.1 を、同じ版をサイト内に置いた `app/vendor/`（three.module.min.js, OrbitControls.min.js, MIT License）に切り替え。
   多面体スタジオ（r160）とは照明の既定が異なるため共用しない。
3. タイトル・説明・favicon を追加し、右上に紹介ページ（About）とトップページ（Home）へのリンクを追加（デモ中は他の UI と同様に隠れる）。
   幅 400px 以下ではタイトル文字と重ならないよう、サブタイトルの下に置く。
4. 操作パネルに最大高さとスクロールを設定（横向きのスマートフォンでパネル上部が画面外に出て操作できなかったため）。縦向き・PC の見た目は変わらない。

差分は `diff archive/QUASICRYSTAL-3D-Demo-2026-02-24.html app/index.html` で確認できる。
