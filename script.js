// ============================================================
// 同人テキストエディタ - JavaScript
// ============================================================


// ============================================================
// データ定義：投稿サイトとデフォルトタグ
// ============================================================
const DEFAULT_SITES = [
  {
    id: 'pixiv',
    name: 'pixiv',
    tags: [
      { label: '改ページ', tag: '[newpage]' },
      { label: 'chapter',  tag: '[chapter:タイトル]' },
      { label: 'ルビ',     tag: '[[rb:漢字>よみ]]' },
      { label: '太字',     tag: '[b:テキスト]' },
    ]
  },
  {
    id: 'kakuyomu',
    name: 'カクヨム',
    tags: [
      { label: '改ページ', tag: '《《改ページ》》' },
      { label: 'ルビ',     tag: '《《漢字|よみ》》' },
      { label: '傍点',     tag: '《《《テキスト》》》' },
    ]
  },
  {
    id: 'hameln',
    name: 'ハーメルン',
    tags: [
      { label: '改ページ', tag: '[newpage]' },
      { label: 'chapter',  tag: '[chapter]タイトル[/chapter]' },
      { label: 'ルビ',     tag: '[ruby=よみ]漢字[/ruby]' },
      { label: '太字',     tag: '[b]テキスト[/b]' },
    ]
  },
  {
    id: 'ncode',
    name: '小説家になろう',
    tags: [
      { label: '改ページ', tag: '[改ページ]' },
      { label: 'ルビ',     tag: '｜漢字《よみ》' },
      { label: '太字',     tag: '[bold]テキスト[/bold]' },
    ]
  },
];

// エクスポート時のテキスト変換ルール（正規表現で一括置換）
const CONVERTERS = {
  pixiv:    text => text, // pixiv形式がそのままマスター
  kakuyomu: text => text
    .replace(/\[newpage\]/g, '《《改ページ》》')
    .replace(/\[rb:([^>]+)>([^\]]+)\]/g, '《《$1|$2》》'),
  hameln:   text => text
    .replace(/\[newpage\]/g, '[newpage]')
    .replace(/\[rb:([^>]+)>([^\]]+)\]/g, '[ruby=$2]$1[/ruby]'),
  ncode:    text => text
    .replace(/\[newpage\]/g, '[改ページ]')
    .replace(/\[rb:([^>]+)>([^\]]+)\]/g, '｜$1《$2》'),
};


// ============================================================
// アプリの状態（グローバル変数）
// ============================================================
let sites = [];           // サイト一覧（タグ込み）
let currentSiteId = 'pixiv'; // 現在選択中のサイト
let previewOpen = false;  // 縦書きプレビューの開閉状態
let autoSaveTimer = null; // 自動保存用タイマー
let previewTimer = null;  // プレビュー更新用タイマー


// ============================================================
// 初期化（ページ読み込み時に呼ばれる）
// ============================================================
function init() {
  loadFromStorage();   // 保存データを読み込む
  renderSiteTabs();    // サイトタブを描画
  renderTagButtons();  // タグボタンを描画
  updateCounts();      // 文字数カウントを更新
  setupAutoSave();     // 自動保存のイベントを設定
  setupEditorEvents(); // エディタのイベントを設定
  setupModalClose();   // モーダル外クリックで閉じる設定
  setupKeyboard();     // キーボードショートカットを設定
}


// ============================================================
// ローカルストレージ（保存・読み込み）
// ============================================================

/**
 * ストレージからデータを読み込む
 * 初回起動時はDEFAULT_SITESをそのまま使う
 */
function loadFromStorage() {
  try {
    const saved = localStorage.getItem('doujin_editor_v1');
    if (saved) {
      const data = JSON.parse(saved);
      document.getElementById('editor').value    = data.text   || '';
      document.getElementById('workTitle').value = data.title  || '';
      currentSiteId = data.siteId || 'pixiv';
      // ユーザーがカスタムタグを追加していれば、それも復元する
      sites = data.sites || JSON.parse(JSON.stringify(DEFAULT_SITES));
    } else {
      // 初回起動：DEFAULT_SITESをディープコピーして使う
      // （直接代入するとDEFAULT_SITESが変更されてしまうため）
      sites = JSON.parse(JSON.stringify(DEFAULT_SITES));
    }
  } catch (e) {
    // 読み込みエラー時はデフォルトに戻す
    sites = JSON.parse(JSON.stringify(DEFAULT_SITES));
  }
}

/**
 * データをストレージに保存する
 * @param {boolean} silent - trueのとき「保存済み」表示を出さない（自動保存時に使う）
 */
function saveToStorage(silent) {
  try {
    const data = {
      text:    document.getElementById('editor').value,
      title:   document.getElementById('workTitle').value,
      siteId:  currentSiteId,
      sites:   sites,
      savedAt: new Date().toISOString() // 保存日時（デバッグ用）
    };
    localStorage.setItem('doujin_editor_v1', JSON.stringify(data));

    if (!silent) {
      // 手動保存（Ctrl+S）のとき：一時的にステータス表示を変える
      const el = document.getElementById('saveStatus');
      el.textContent = '✓ 保存済み';
      el.style.color = 'var(--accent)';
      setTimeout(() => {
        el.textContent = '● 自動保存中';
        el.style.color = '';
      }, 1500);
    }
  } catch (e) {
    // ストレージ容量超過などのエラーは無視
  }
}

/**
 * 自動保存のセットアップ
 * 入力後1秒間操作がなければ自動保存する（デバウンス処理）
 */
function setupAutoSave() {
  document.getElementById('editor').addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveToStorage(true), 1000);
  });
  document.getElementById('workTitle').addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveToStorage(true), 800);
  });
}


// ============================================================
// エディタイベント
// ============================================================
function setupEditorEvents() {
  document.getElementById('editor').addEventListener('input', () => {
    updateCounts();
    // プレビューが開いているときはリアルタイムで更新
    if (previewOpen) schedulePreviewUpdate();
  });
}


// ============================================================
// 文字数カウント・ステータスバー更新
// ============================================================
function updateCounts() {
  const text  = document.getElementById('editor').value;
  const len   = text.length;
  const lines = text === '' ? 0 : text.split('\n').length;
  const pages = Math.ceil(len / 400) || 0; // 400字詰め換算

  // 右上バッジを更新
  const badge = document.getElementById('charCount');
  badge.textContent = len.toLocaleString() + ' 文字';

  // 節目の文字数に達したらバッジを光らせる
  const milestones = [1000, 3000, 5000, 10000, 20000, 30000, 50000];
  badge.classList.toggle('milestone', milestones.includes(len));

  // ステータスバーを更新
  document.getElementById('sb-chars').textContent = '文字数：' + len.toLocaleString();
  document.getElementById('sb-lines').textContent = '行数：'   + lines.toLocaleString();
  document.getElementById('sb-pages').textContent = '約 ' + pages + ' ページ（400字換算）';
}


// ============================================================
// サイトタブ・タグボタンの描画
// ============================================================

/** サイト切り替えタブを描画する */
function renderSiteTabs() {
  const wrap = document.getElementById('siteTabs');
  wrap.innerHTML = ''; // 一度クリアしてから再描画

  sites.forEach(site => {
    const btn = document.createElement('button');
    btn.className = 'site-tab' + (site.id === currentSiteId ? ' active' : '');
    btn.textContent = site.name;
    btn.onclick = () => {
      currentSiteId = site.id;
      document.getElementById('sb-site').textContent = site.name;
      renderSiteTabs();   // タブを再描画（activeクラスを更新するため）
      renderTagButtons(); // タグボタンを再描画
    };
    wrap.appendChild(btn);
  });
}

/** 現在のサイトのタグボタンを描画する */
function renderTagButtons() {
  const wrap = document.getElementById('tagButtons');
  wrap.innerHTML = '';

  const site = sites.find(s => s.id === currentSiteId);
  if (!site) return;

  site.tags.forEach(({ label, tag }) => {
    const btn = document.createElement('button');
    btn.className   = 'tag-btn';
    btn.textContent = label;
    btn.title       = tag; // ホバー時にタグ内容をツールチップ表示
    btn.onclick     = () => insertTag(tag);
    wrap.appendChild(btn);
  });
}


// ============================================================
// タグ挿入
// ============================================================

/**
 * カーソル位置にタグを挿入する
 * テキストが選択中の場合は選択範囲を置き換える
 */
function insertTag(tag) {
  const ta    = document.getElementById('editor');
  const start = ta.selectionStart; // カーソル開始位置
  const end   = ta.selectionEnd;   // カーソル終了位置
  const val   = ta.value;

  // カーソル位置に挿入
  ta.value = val.slice(0, start) + tag + val.slice(end);

  // カーソルをタグの直後に移動
  ta.selectionStart = ta.selectionEnd = start + tag.length;
  ta.focus();

  updateCounts();
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveToStorage(true), 800);
}


// ============================================================
// カスタムタグ追加モーダル
// ============================================================
function openCustomTagModal() {
  // サイト選択肢を現在のsitesから生成
  const sel = document.getElementById('ctSite');
  sel.innerHTML = '';
  sites.forEach(s => {
    const opt = document.createElement('option');
    opt.value       = s.id;
    opt.textContent = s.name;
    if (s.id === currentSiteId) opt.selected = true;
    sel.appendChild(opt);
  });
  document.getElementById('ctLabel').value = '';
  document.getElementById('ctTag').value   = '';
  document.getElementById('customTagModal').classList.add('open');
}

function closeCustomTagModal() {
  document.getElementById('customTagModal').classList.remove('open');
}

function addCustomTag() {
  const siteId = document.getElementById('ctSite').value;
  const label  = document.getElementById('ctLabel').value.trim();
  const tag    = document.getElementById('ctTag').value;

  if (!label || !tag) return; // 入力が空なら何もしない

  const site = sites.find(s => s.id === siteId);
  if (site) {
    site.tags.push({ label, tag });
    renderTagButtons();
    saveToStorage(true);
  }
  closeCustomTagModal();
}


// ============================================================
// エクスポートモーダル
// ============================================================
function openExportModal() {
  const tabsWrap     = document.getElementById('exportTabs');
  const contentsWrap = document.getElementById('exportContents');
  tabsWrap.innerHTML     = '';
  contentsWrap.innerHTML = '';

  const text = document.getElementById('editor').value;

  sites.forEach((site, i) => {
    // タブボタンを作成
    const tab = document.createElement('button');
    tab.className    = 'export-tab' + (i === 0 ? ' active' : '');
    tab.textContent  = site.name;
    tab.onclick      = () => {
      document.querySelectorAll('.export-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.export-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('export-content-' + i).classList.add('active');
    };
    tabsWrap.appendChild(tab);

    // テキストをそのサイトの記法に変換
    const converter = CONVERTERS[site.id] || (t => t);
    const converted = converter(text);

    // プレビューエリアを作成
    const div = document.createElement('div');
    div.className = 'export-content' + (i === 0 ? ' active' : '');
    div.id        = 'export-content-' + i;
    div.dataset.text = converted; // コピー用にdata属性に保存
    div.innerHTML = `
      <div class="export-preview">${escHtml(converted)}</div>
      <div style="font-size:11px;color:var(--text-muted)">${converted.length.toLocaleString()} 文字</div>
    `;
    contentsWrap.appendChild(div);
  });

  document.getElementById('exportModal').classList.add('open');
}

function closeExportModal() {
  document.getElementById('exportModal').classList.remove('open');
}

/** 現在表示中のエクスポート内容をクリップボードにコピー */
function copyExport() {
  const active = document.querySelector('.export-content.active');
  if (!active) return;

  navigator.clipboard.writeText(active.dataset.text).then(() => {
    const btn = document.querySelector('#exportModal .modal-btn.ok');
    btn.textContent = 'コピーしました！';
    setTimeout(() => btn.textContent = 'クリップボードにコピー', 1800);
  });
}

/** HTML特殊文字をエスケープする（XSS対策） */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


// ============================================================
// 縦書きプレビュー（Canvas描画）
// ============================================================
function togglePreview() {
  previewOpen = !previewOpen;
  document.getElementById('previewPanel').classList.toggle('open', previewOpen);
  document.getElementById('previewToggleBtn').classList.toggle('accent', previewOpen);
  if (previewOpen) renderPreviewCanvas();
}

/** プレビュー更新をデバウンス（連続入力中は描画を間引く） */
function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreviewCanvas, 300);
}

/**
 * Canvasに縦書きテキストを描画する
 * CSSの writing-mode ではなく、Canvas APIで1文字ずつ手動配置している
 * 理由：Canvasはwriting-modeに対応していないため
 */
function renderPreviewCanvas() {
  const panel = document.getElementById('previewPanel');
  const text  = document.getElementById('editor').value
    .replace(/\[newpage\]/g, '\n―――――――\n'); // 改ページ記号を区切り線に変換

  const cv  = document.getElementById('previewCanvas');
  const W   = Math.min(panel.clientWidth - 32, 320);
  const H   = 460;
  cv.width  = W;
  cv.height = H;

  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  const fsPx = 14;
  const lh   = fsPx * 1.85; // 行の高さ
  const cw   = fsPx * 1.1;  // 列の幅
  const padT = 20, padB = 20, padL = 16, padR = 16;
  const areaH = H - padT - padB;
  const areaW = W - padL - padR;
  const rows    = Math.floor(areaH / lh);
  const maxCols = Math.floor(areaW / cw);

  ctx.font      = `${fsPx}px 'Hiragino Mincho ProN','Yu Mincho',serif`;
  ctx.fillStyle = '#222';

  const chars = text.split('');
  let ci = 0, col = 0;

  // 右から左へ列を埋めていく（縦書きの方向）
  while (ci < chars.length && col < maxCols) {
    const x = W - padR - col * cw - cw * 0.5;
    let row = 0;

    while (row < rows && ci < chars.length) {
      const ch = chars[ci];

      if (ch === '\n') {
        // 改行は列を終わらせる
        row = rows;
        ci++;
        continue;
      }

      const y = padT + row * lh + lh * 0.8;
      ctx.save();

      // 括弧類は横向きに描く（縦書きの慣習）
      if ('「」『』（）()【】〔〕'.includes(ch)) {
        ctx.translate(x, y - lh * 0.3);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(ch, -fsPx * 0.5, fsPx * 0.35);
      } else {
        ctx.fillText(ch, x - fsPx * 0.5, y);
      }

      ctx.restore();
      row++;
      ci++;
    }
    col++;
  }

  // まだ描画しきれていない文字がある場合
  if (ci < chars.length) {
    ctx.fillStyle  = '#aaa';
    ctx.font       = '11px sans-serif';
    ctx.textAlign  = 'center';
    ctx.fillText('（続きあり）', W / 2, H - 6);
    ctx.textAlign  = 'left';
  }
}


// ============================================================
// 印刷プレビュー
// ============================================================

/**
 * 印刷用HTMLを生成してwindow.print()を呼び出す
 * ブラウザの「PDFに保存」で入稿用PDFが作れる
 */
function openPrintPreview() {
  const text     = document.getElementById('editor').value;
  const title    = document.getElementById('workTitle').value || '無題';
  const sections = text.split('[newpage]');

  let html = `
    <style>
      @page { size: A6; margin: 15mm 13mm 15mm 15mm; }
      body  { font-family: 'Hiragino Mincho ProN','Yu Mincho',serif; }
      .page {
        width: 105mm; height: 148mm;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        font-size: 12pt;
        line-height: 1.85;
        overflow: hidden;
        page-break-after: always;
        padding: 15mm 13mm 15mm 15mm;
        box-sizing: border-box;
        word-break: break-all;
      }
    </style>
  `;

  sections.forEach(sec => {
    html += `<div class="page">${escHtml(sec.trim())}</div>`;
  });

  const area = document.getElementById('printArea');
  area.innerHTML = html;
  window.print();
  // 印刷ダイアログを閉じた後にHTMLをクリア
  setTimeout(() => { area.innerHTML = ''; }, 2000);
}


// ============================================================
// キーボードショートカット
// ============================================================
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    // Ctrl+S / Cmd+S：手動保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveToStorage(false);
    }
    // Ctrl+Shift+P / Cmd+Shift+P：プレビュー開閉
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      togglePreview();
    }
  });
}


// ============================================================
// モーダル外クリックで閉じる
// ============================================================
function setupModalClose() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      // overlay自体をクリックしたとき（モーダル内部ではなく外側）
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });
}


// ============================================================
// 起動
// ============================================================
init();
