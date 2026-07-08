/* FANZA同人 サークル非表示 — content script
 *
 * 商品カードからサークルの maker ID とジャンルを取り出し、
 *   - 非表示リストに含まれるサークル
 *   - 非表示ジャンル（例: ボイス）
 * のカードを display:none で消す。併せて各カードのサークル名の横に
 * 「非表示」ボタンを注入する。
 *
 * 対応レイアウト（同人）:
 *   - 一覧 / キーワード検索: li.productList__item
 *   - ランキング:            li.rank-rankListItem
 */
(() => {
  "use strict";

  const CIRCLES_KEY = "blockedCircles"; // { [makerId: string]: name: string }
  const GENRES_KEY = "blockedGenres";   // string[]  非表示カテゴリ 例: ["ボイス"]
  const SEEN_KEY = "seenGenres";        // string[]  これまで見かけたカテゴリ（設定画面用）
  const DEFAULT_GENRES = [];             // 未設定時はすべて表示（非表示カテゴリなし）

  // 非表示単位となるカードのセレクタ一覧。レイアウトが増えたらここに追加する。
  const CARD_SELECTORS = [
    "li.productList__item",
    "li.rank-rankListItem",
  ];
  const CARD_SELECTOR = CARD_SELECTORS.join(",");
  const GENRE_SELECTOR = ".c_icon_genre";

  const MAKER_HREF_RE = /article=maker\/id=(\d+)/;

  // メモリ上の設定。storage 読み込み後に反映される。
  let blocked = {};        // サークル非表示リスト
  let blockedGenres = [];  // 非表示ジャンル
  let seenGenres = new Set(); // これまでに見かけたカテゴリ（設定画面に列挙するため収集）

  /** カードから { id, name, nameLink, authorBox } を取り出す。取れなければ null。 */
  function extractCircle(card) {
    const links = card.querySelectorAll('a[href*="article=maker"]');
    let id = null;
    let name = "";
    let nameLink = null;
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      const m = href.match(MAKER_HREF_RE);
      if (m) id = m[1];
      const t = (a.textContent || "").trim();
      if (t && !name) {
        name = t;
        nameLink = a;
      }
    }
    if (!id) return null;
    // ボタン注入先はサークル名リンクの親要素（レイアウトに依存しない）。
    // 一覧では .tileListTtl__txt--author、ランキングでは p.rank-circle。
    const authorBox = (nameLink && nameLink.parentElement) ||
      card.querySelector(".tileListTtl__txt--author");
    return { id, name, nameLink, authorBox };
  }

  /** カードのジャンル名（例: "ボイス"、"ゲーム・一部AI"）を返す。無ければ ""。 */
  function extractGenre(card) {
    const el = card.querySelector(GENRE_SELECTOR);
    return el ? (el.textContent || "").trim() : "";
  }

  /** ジャンル名が非表示対象か（部分一致：「ゲーム・一部AI」も「ゲーム」で一致）。 */
  function isGenreBlocked(genre) {
    if (!genre) return false;
    return blockedGenres.some((g) => g && genre.indexOf(g) !== -1);
  }

  /** バッジ表記から基本カテゴリを取り出す（「ゲーム・一部AI」→「ゲーム」）。 */
  function baseGenre(genre) {
    return genre ? genre.split("・")[0].trim() : "";
  }

  /** 見かけたカテゴリを収集し、新規があれば storage に保存（設定画面用）。 */
  function recordGenre(genre) {
    const base = baseGenre(genre);
    if (base && !seenGenres.has(base)) {
      seenGenres.add(base);
      chrome.storage.local.set({ [SEEN_KEY]: [...seenGenres] });
    }
  }

  /** 1枚のカードを処理：ジャンル記録＋ボタン注入＋非表示判定。 */
  function processCard(card) {
    if (card.dataset.cfProcessed === "1") {
      // 既処理でも、非表示状態は最新の設定に合わせて更新する。
      applyVisibility(card);
      return;
    }

    const genre = extractGenre(card);
    if (genre) {
      card.dataset.cfGenre = genre;
      recordGenre(genre);
    }

    const info = extractCircle(card);
    if (info) {
      card.dataset.cfMakerId = info.id;
      if (info.name) card.dataset.cfMakerName = info.name;
      injectButton(card, info);
    }

    card.dataset.cfProcessed = "1";
    applyVisibility(card);
  }

  /** サークル名の近くに「非表示」ボタンを注入。 */
  function injectButton(card, info) {
    if (!info.authorBox || !info.authorBox.parentNode) return;
    if (card.querySelector(".cf-hide-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cf-hide-btn";
    btn.textContent = "🚫 非表示";
    btn.title = `「${info.name || "このサークル"}」の商品を非表示にする`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addBlocked(info.id, info.name);
    });
    // サークル名ボックスは overflow:hidden の1行省略表示のため、ボックス内に
    // 入れると長い名前でボタンが切れる。直後の兄弟として挿入して常に表示する。
    info.authorBox.parentNode.insertBefore(btn, info.authorBox.nextSibling);
  }

  /** カードの表示/非表示を現在の設定に合わせて設定。 */
  function applyVisibility(card) {
    const id = card.dataset.cfMakerId;
    const genre = card.dataset.cfGenre;
    const hideByCircle = id && Object.prototype.hasOwnProperty.call(blocked, id);
    const hideByGenre = isGenreBlocked(genre);
    if (hideByCircle || hideByGenre) {
      card.classList.add("cf-hidden");
    } else {
      card.classList.remove("cf-hidden");
    }
  }

  /** ページ内の全カードを処理。 */
  function scan() {
    const cards = document.querySelectorAll(CARD_SELECTOR);
    for (const card of cards) processCard(card);
  }

  /** 全カードの表示状態のみ更新（ボタン注入・記録は済んでいる前提）。 */
  function refreshVisibility() {
    document.querySelectorAll(CARD_SELECTOR).forEach(applyVisibility);
  }

  /** サークルを非表示リストへ追加し保存。 */
  function addBlocked(id, name) {
    blocked[id] = name || blocked[id] || "";
    chrome.storage.local.set({ [CIRCLES_KEY]: blocked });
    // 保存後の onChanged でも反映されるが、即時反映しておく。
    document.querySelectorAll(`[data-cf-maker-id="${id}"]`)
      .forEach((c) => c.classList.add("cf-hidden"));
  }

  // ---- storage 読み込みと監視 ----
  chrome.storage.local.get([CIRCLES_KEY, GENRES_KEY, SEEN_KEY], (res) => {
    blocked = res[CIRCLES_KEY] || {};
    blockedGenres = Array.isArray(res[GENRES_KEY]) ? res[GENRES_KEY] : DEFAULT_GENRES;
    seenGenres = new Set(Array.isArray(res[SEEN_KEY]) ? res[SEEN_KEY] : []);
    scan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let changed = false;
    if (changes[CIRCLES_KEY]) {
      blocked = changes[CIRCLES_KEY].newValue || {};
      changed = true;
    }
    if (changes[GENRES_KEY]) {
      blockedGenres = Array.isArray(changes[GENRES_KEY].newValue)
        ? changes[GENRES_KEY].newValue : [];
      changed = true;
    }
    if (changed) refreshVisibility();
  });

  // ---- 動的読み込み（ページ送り・ランキングの遅延描画）への追従 ----
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) { scan(); break; }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
