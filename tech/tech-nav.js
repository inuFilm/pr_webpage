// ============================================================
// tech セクションのサイドバー・記事一覧・記事間ナビの描画
// （vanilla JS。外部ライブラリ不使用）
//
// 前提: window.TECH_ARTICLES（配列）と window.TECH_ROOT（"./" または "../"）が
// このスクリプトより先に読み込み済みであること。
// ============================================================

// カテゴリの表示名。ここに無いカテゴリは slug をそのまま表示する。
var CATEGORY_LABELS = {
  'houdini-nodes': 'Houdini ノード早見',
  'houdini-solaris': 'Houdini Solaris / Karma',
  'houdini-modeling': 'Houdini モデリング',
  'houdini-animation': 'Houdini アニメーション',
  'houdini-character': 'Houdini キャラクター',
  'houdini': 'Houdini',
  'realtime-vfx': 'リアルタイム VFX',
  'unity': 'Unity',
  'blender': 'Blender'
};

function labelFor(category) {
  return CATEGORY_LABELS[category] || category;
}

function anchorFor(category) {
  return 'cat-' + String(category).replace(/[^A-Za-z0-9_-]/g, '_');
}

document.addEventListener('DOMContentLoaded', function () {
  if (!Array.isArray(window.TECH_ARTICLES)) return;
  var grouped = groupByCategory(window.TECH_ARTICLES);
  var current = findCurrent(window.TECH_ARTICLES);

  renderSidebar(grouped, current);
  renderArticleList(grouped);
  enhanceArticleMeta(current);
  renderPager(grouped, current);
});

// カテゴリ初出順に記事をグルーピングする
function groupByCategory(articles) {
  var order = [];
  var map = {};
  articles.forEach(function (article) {
    if (!map[article.category]) {
      map[article.category] = [];
      order.push(article.category);
    }
    map[article.category].push(article);
  });
  return { order: order, map: map };
}

// いま開いている記事を特定する（記事ページ以外では null）
function findCurrent(articles) {
  for (var i = 0; i < articles.length; i++) {
    if (location.pathname.endsWith('/articles/' + articles[i].slug + '.html')) {
      return articles[i];
    }
  }
  return null;
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ------------------------------------------------------------
// (a) サイドバー（全ページ共通）
// ------------------------------------------------------------
function renderSidebar(grouped, current) {
  var sidebar = document.getElementById('tech-sidebar');
  if (!sidebar) return;

  var topLink = el('a', 'tech-sidebar-top', '技術メモ トップ');
  topLink.setAttribute('href', window.TECH_ROOT + 'index.html');
  sidebar.appendChild(topLink);

  var search = el('input', 'tech-search');
  search.type = 'search';
  search.setAttribute('placeholder', '記事を絞り込む');
  search.setAttribute('aria-label', '記事を絞り込む');
  sidebar.appendChild(search);

  var empty = el('p', 'tech-sidebar-empty', '一致する記事がありません。');
  empty.hidden = true;

  var blocks = [];

  grouped.order.forEach(function (category) {
    var details = el('details', 'tech-cat');
    var summary = el('summary');
    summary.appendChild(el('span', 'tech-cat-name', labelFor(category)));
    summary.appendChild(el('span', 'tech-cat-count', String(grouped.map[category].length)));
    details.appendChild(summary);

    var ul = document.createElement('ul');
    var hasCurrent = false;

    grouped.map[category].forEach(function (article) {
      var li = document.createElement('li');
      if (current && current.slug === article.slug) {
        li.className = 'is-current';
        hasCurrent = true;
      }
      var a = el('a', null, article.title);
      a.setAttribute('href', window.TECH_ROOT + 'articles/' + article.slug + '.html');
      li.appendChild(a);
      ul.appendChild(li);
    });

    details.appendChild(ul);

    // 既定の開閉: 開いている記事のカテゴリだけ開く。
    // 記事ページ以外（＝一覧ページ）では、本文側に全記事が並ぶので閉じておく。
    if (hasCurrent) {
      details.setAttribute('open', '');
      details.classList.add('has-current');
    }

    sidebar.appendChild(details);
    blocks.push(details);
  });

  sidebar.appendChild(empty);
  setupSearch(search, blocks, empty);
}

// 絞り込み。入力があるあいだは一致したカテゴリだけを開く。
function setupSearch(input, blocks, empty) {
  function apply() {
    var q = input.value.trim().toLowerCase();
    var totalHits = 0;

    blocks.forEach(function (details) {
      var items = details.querySelectorAll('li');
      var hits = 0;

      Array.prototype.forEach.call(items, function (li) {
        var text = li.textContent.toLowerCase();
        var hit = !q || text.indexOf(q) !== -1;
        li.classList.toggle('is-hidden', !hit);
        if (hit) hits++;
      });

      totalHits += hits;
      details.hidden = q ? hits === 0 : false;

      if (q) {
        if (hits > 0) details.setAttribute('open', '');
      } else if (!details.classList.contains('has-current')) {
        details.removeAttribute('open');
      }

      var count = details.querySelector('.tech-cat-count');
      if (count) {
        count.textContent = q ? hits + ' / ' + items.length : String(items.length);
      }
    });

    empty.hidden = !(q && totalHits === 0);
  }

  input.addEventListener('input', apply);
  input.addEventListener('search', apply);
}

// ------------------------------------------------------------
// (b) 記事一覧（tech/index.html のみ）
// ------------------------------------------------------------
function renderArticleList(grouped) {
  var list = document.getElementById('tech-article-list');
  if (!list) return;

  // 先頭にカテゴリへのジャンプチップを並べる
  var chips = el('nav', 'tech-chips');
  chips.setAttribute('aria-label', 'カテゴリ');
  grouped.order.forEach(function (category) {
    var chip = el('a', 'tech-chip');
    chip.setAttribute('href', '#' + anchorFor(category));
    chip.appendChild(el('b', null, labelFor(category)));
    chip.appendChild(el('span', null, String(grouped.map[category].length)));
    chips.appendChild(chip);
  });
  list.appendChild(chips);

  grouped.order.forEach(function (category) {
    var section = el('section', 'tech-cat-block');
    section.id = anchorFor(category);

    var h2 = el('h2');
    h2.appendChild(el('span', null, labelFor(category)));
    h2.appendChild(el('span', 'tech-cat-count', String(grouped.map[category].length)));
    section.appendChild(h2);

    var cards = el('div', 'tech-cards');

    grouped.map[category].forEach(function (article) {
      var card = el('a', 'tech-card');
      card.setAttribute('href', 'articles/' + article.slug + '.html');
      card.appendChild(el('span', 'tech-card-title', article.title));
      card.appendChild(el('span', 'tech-card-date', article.date));
      card.appendChild(el('span', 'tech-card-desc', article.description));
      cards.appendChild(card);
    });

    section.appendChild(cards);
    list.appendChild(section);
  });
}

// ------------------------------------------------------------
// (c) 記事ページ: メタ行のカテゴリを表示名にして一覧へリンクする
// ------------------------------------------------------------
function enhanceArticleMeta(current) {
  if (!current) return;
  var meta = document.querySelector('.tech-article .tech-meta');
  if (!meta) return;

  meta.textContent = '';

  var catLink = el('a', null, labelFor(current.category));
  catLink.setAttribute('href', window.TECH_ROOT + 'index.html#' + anchorFor(current.category));
  meta.appendChild(catLink);
  meta.appendChild(document.createTextNode(' · ' + current.date));
}

// ------------------------------------------------------------
// (d) 記事ページ: 同じカテゴリ内の前後へのリンク
// ------------------------------------------------------------
function renderPager(grouped, current) {
  if (!current) return;
  var article = document.querySelector('.tech-article');
  if (!article) return;

  var siblings = grouped.map[current.category] || [];
  var index = -1;
  for (var i = 0; i < siblings.length; i++) {
    if (siblings[i].slug === current.slug) { index = i; break; }
  }
  if (index === -1 || siblings.length < 2) return;

  var pager = el('nav', 'tech-pager');
  pager.setAttribute('aria-label', '前後の記事');

  var pos = el('p', 'tech-pager-pos');
  pos.appendChild(el('span', null, labelFor(current.category)));
  pos.appendChild(document.createTextNode(' — ' + (index + 1) + ' / ' + siblings.length));
  pager.appendChild(pos);

  pager.appendChild(pagerLink(siblings[index - 1], 'prev'));
  pager.appendChild(pagerLink(siblings[index + 1], 'next'));

  article.parentNode.insertBefore(pager, article.nextSibling);
}

function pagerLink(article, dir) {
  var isNext = dir === 'next';
  if (!article) return el('span', 'tech-pager-empty');

  var a = el('a', isNext ? 'is-next' : 'is-prev');
  a.setAttribute('href', window.TECH_ROOT + 'articles/' + article.slug + '.html');
  a.appendChild(el('span', 'tech-pager-dir', isNext ? '次の記事 →' : '← 前の記事'));
  a.appendChild(el('span', 'tech-pager-title', article.title));
  return a;
}
