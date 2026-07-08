// ============================================================
// tech セクションのサイドバー・記事一覧の描画（vanilla JS。外部ライブラリ不使用）
//
// 前提: window.TECH_ARTICLES（配列）と window.TECH_ROOT（"./" または "../"）が
// このスクリプトより先に読み込み済みであること。
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  renderSidebar();
  renderArticleList();
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

// (a) サイドバー描画（全ページ共通）
function renderSidebar() {
  if (!Array.isArray(window.TECH_ARTICLES)) return;

  var sidebar = document.getElementById('tech-sidebar');
  if (!sidebar) return;

  var topLink = document.createElement('a');
  topLink.className = 'tech-sidebar-top';
  topLink.setAttribute('href', window.TECH_ROOT + 'index.html');
  topLink.textContent = '技術メモ トップ';
  sidebar.appendChild(topLink);

  var isWide = window.matchMedia('(min-width: 900px)').matches;
  var grouped = groupByCategory(window.TECH_ARTICLES);

  grouped.order.forEach(function (category) {
    var details = document.createElement('details');
    details.className = 'tech-cat';

    var summary = document.createElement('summary');
    summary.textContent = category;
    details.appendChild(summary);

    var ul = document.createElement('ul');
    var categoryHasCurrent = false;

    grouped.map[category].forEach(function (article) {
      var li = document.createElement('li');
      var isCurrent = location.pathname.endsWith('/articles/' + article.slug + '.html');
      if (isCurrent) {
        li.className = 'is-current';
        categoryHasCurrent = true;
      }

      var a = document.createElement('a');
      a.setAttribute('href', window.TECH_ROOT + 'articles/' + article.slug + '.html');
      a.textContent = article.title;
      li.appendChild(a);
      ul.appendChild(li);
    });

    details.appendChild(ul);

    if (isWide || categoryHasCurrent) {
      details.setAttribute('open', '');
    }

    sidebar.appendChild(details);
  });
}

// (b) 記事一覧描画（tech/index.html のみ）
function renderArticleList() {
  if (!Array.isArray(window.TECH_ARTICLES)) return;

  var list = document.getElementById('tech-article-list');
  if (!list) return;

  var grouped = groupByCategory(window.TECH_ARTICLES);

  grouped.order.forEach(function (category) {
    var section = document.createElement('section');
    section.className = 'tech-cat-block';

    var h2 = document.createElement('h2');
    h2.textContent = category;
    section.appendChild(h2);

    grouped.map[category].forEach(function (article) {
      var card = document.createElement('a');
      card.className = 'tech-card';
      card.setAttribute('href', 'articles/' + article.slug + '.html');

      var title = document.createElement('span');
      title.className = 'tech-card-title';
      title.textContent = article.title;
      card.appendChild(title);

      var date = document.createElement('span');
      date.className = 'tech-card-date';
      date.textContent = article.date;
      card.appendChild(date);

      var desc = document.createElement('span');
      desc.className = 'tech-card-desc';
      desc.textContent = article.description;
      card.appendChild(desc);

      section.appendChild(card);
    });

    list.appendChild(section);
  });
}
