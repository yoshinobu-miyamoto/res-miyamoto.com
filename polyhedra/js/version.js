// version.js — 版番号と改版履歴（日英の両方を持つ）
// 版番号は「主.副.修正」: 名称や基本構成の変更で主、機能の追加で副、修正で修正の番号を上げる。
// 日付は日本時間の公開日。

export const APP_NAME = 'Hyperfolder';
export const VERSION = '2.4.0';
export const RELEASED = '2026-10-17';

export const HISTORY = [
  {
    v: '2.4.0', date: '2026-10-17',
    title: { ja: '英語表示', en: 'English interface' },
    items: {
      ja: [
        'ヘッダーの「EN／日本語」ボタンで、アプリの表示を日本語と英語で切り替えられるようにした（設定はこのブラウザに保存。URL に ?lang=en も使える）',
        '面の種類、胞の名前、四次元の投影と模型、デモの字幕、型紙の凡例とフッター、棒模型の部材表も英語に対応',
        '概要と改版履歴、詳細技術解説の英語版を追加し、各ページから言語を切り替えられるようにした',
      ],
      en: [
        'An EN / 日本語 button in the header switches the app between Japanese and English (remembered in this browser; ?lang=en in the URL also works)',
        'Face types, cell names, 4D projections and models, demo captions, the net legend and footer, and the strut list are translated too',
        'English editions of the overview and the technical notes, with a language switch on every page',
      ],
    },
  },
  {
    v: '2.3.0', date: '2026-10-17',
    title: { ja: '版番号と解説文書', en: 'Version number and documentation' },
    items: {
      ja: [
        'ヘッダーに版番号を表示し、概要と改版履歴のページへのリンクにした',
        '詳細技術解説（計算の仕組み、多面体に関する数学史年表、参考文献、類似アプリ・サイト）を追加',
        '印刷する型紙のフッターに版番号を入れた',
      ],
      en: [
        'Version number in the header, linking to the overview and release history',
        'Technical notes: how it works, a timeline of polyhedra in mathematics, references, related apps and sites',
        'Version number printed in the footer of paper-model sheets',
      ],
    },
  },
  {
    v: '2.2.0', date: '2026-10-17',
    title: { ja: 'スマホ向けの操作画面', en: 'Phone layout' },
    items: {
      ja: [
        '立体表示の下に、タブ（形・4D・表示・型紙・書出・情報）つきの操作パネルを置いた',
        'スライダーを「− 値 ＋」のステッパーに、展開のスライダーを「閉・半・開」のボタンにした',
      ],
      en: [
        'Control sheet with tabs (Shape, 4D, Display, Paper, Export, Info) under the 3D view',
        'Sliders replaced by − value + steppers; the unfold slider by Closed / Half / Open buttons',
      ],
    },
  },
  {
    v: '2.1.1', date: '2026-10-17',
    title: { ja: 'トップページからデモを開く', en: 'Open the demo from the top page' },
    items: {
      ja: ['トップページのカードに「デモを見る」ボタンを追加', 'デモ中は URL を #demo のままにし、再読み込みしてもデモが続くようにした'],
      en: ['“Watch the demo” button on the top-page card', 'The URL stays #demo during the demo, so a reload continues it'],
    },
  },
  {
    v: '2.1.0', date: '2026-10-17',
    title: { ja: 'デモ・モード（自己紹介）', en: 'Demo mode' },
    items: {
      ja: [
        'タイトル画面と6つの代表例（切頂二十面体、ジオデシックドーム、大星型十二面体、テッセラクト、正二十四胞体、正百二十胞体）を自動で見せる',
        'ボタン、90秒の無操作、URL の #demo で開始。クリックやキーで終了し、元の表示に戻る',
        '型紙パネルの切り替えで表示の状態が壊れる不具合を修正',
      ],
      en: [
        'Title card and six showcase scenes played automatically',
        'Starts from the button, after 90 s idle, or with #demo; any click or key ends it and restores the view',
        'Fixed: the net-view toggle no longer breaks the view state',
      ],
    },
  },
  {
    v: '2.0.0', date: '2026-10-17',
    title: { ja: '名称を Hyperfolder に変更', en: 'Renamed to Hyperfolder' },
    items: {
      ja: ['「Polyhedra Studio」から「Hyperfolder — Between the Dimensions（次元のあいだを旅する）」へ', 'トップページの紹介に『フラットランド』へのオマージュを添えた'],
      en: ['From “Polyhedra Studio” to “Hyperfolder — Between the Dimensions”', 'Flatland homage added to the top-page introduction'],
    },
  },
  {
    v: '1.3.0', date: '2026-10-15',
    title: { ja: '展開図の選び方を画面と印刷で分ける', en: 'Separate nets for screen and print' },
    items: {
      ja: ['画面表示と3D展開は対称性を優先した展開図、印刷・SVG・DXF は用紙の使用率を優先した割付にした'],
      en: ['Symmetric nets on screen and in the unfold animation; paper-efficient layouts for print, SVG and DXF'],
    },
  },
  {
    v: '1.2.0', date: '2026-10-15',
    title: { ja: 'ライブラリのメニュー', en: 'Library menu' },
    items: {
      ja: ['カテゴリの行頭に開閉マーカーを付け、閉じたときは中身を一行で予告するようにした'],
      en: ['Disclosure markers on categories, with a one-line preview when collapsed'],
    },
  },
  {
    v: '1.1.0', date: '2026-10-15',
    title: { ja: '四次元ポリトープ', en: '4D polytopes' },
    items: {
      ja: ['正多胞体6種を含む20種の四次元ポリトープ、シュレーゲル図などの3次元投影、4次元回転、胞の3D展開、模型（立体パズル・外形・胞・部材表）'],
      en: ['20 polytopes including the six regular ones; Schlegel diagrams and other projections, 4D rotation, 3D nets of cells, and paper models'],
    },
  },
  {
    v: '1.0.0', date: '2026-10-15',
    title: { ja: '初版（Polyhedra Studio）', en: 'First release (Polyhedra Studio)' },
    items: {
      ja: ['多面体76種の3D表示、コンウェイ表記による形の生成、のりしろ・番号・山谷折り付きの型紙（印刷・SVG・DXF・OBJ）'],
      en: ['3D view of 76 polyhedra, Conway notation, and paper-model nets with glue tabs, edge numbers and fold lines'],
    },
  },
];
