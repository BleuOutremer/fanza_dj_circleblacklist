/* 設定ページ：非表示サークルの編集＋非表示ジャンルの設定 */
(() => {
  "use strict";

  const CIRCLES_KEY = "blockedCircles"; // { [makerId]: name }
  const GENRES_KEY = "blockedGenres";   // string[] 非表示カテゴリ
  const SEEN_KEY = "seenGenres";        // string[] これまで見かけたカテゴリ
  const DEFAULT_GENRES = []; // 未設定時はすべて表示

  // 既定で設定画面に出すカテゴリ。実際に見かけたカテゴリ（seenGenres）や
  // 現在の設定値と統合して表示するので、ここに無いものも自動で並ぶ。
  const KNOWN_GENRES = ["コミック", "CG", "動画", "ボイス", "ボイコミ", "ゲーム"];

  const tableEl = document.getElementById("table");
  const tbodyEl = document.getElementById("tbody");
  const emptyEl = document.getElementById("empty");
  const countEl = document.getElementById("count");
  const nameInput = document.getElementById("add-name");
  const idInput = document.getElementById("add-id");
  const addBtn = document.getElementById("add-btn");
  const addError = document.getElementById("add-error");
  const clearBtn = document.getElementById("clear-btn");
  const genreListEl = document.getElementById("genre-list");
  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const importFile = document.getElementById("import-file");
  const backupMsg = document.getElementById("backup-msg");

  const getLocal = (keys) =>
    new Promise((r) => chrome.storage.local.get(keys, r));
  const setLocal = (obj) =>
    new Promise((r) => chrome.storage.local.set(obj, r));

  function showError(msg) { addError.textContent = msg; addError.hidden = false; }
  function clearError() { addError.hidden = true; }

  // ---- ジャンル（カテゴリ） ----
  async function loadGenreState() {
    const res = await getLocal([GENRES_KEY, SEEN_KEY]);
    let blocked = res[GENRES_KEY];
    if (!Array.isArray(blocked)) {
      blocked = DEFAULT_GENRES.slice();
      await setLocal({ [GENRES_KEY]: blocked });
    }
    const seen = Array.isArray(res[SEEN_KEY]) ? res[SEEN_KEY] : [];
    return { blocked, seen };
  }

  /** 表示するカテゴリ一覧＝既定＋見かけた＋現在の非表示設定 の和集合。 */
  function allCategories(blocked, seen) {
    return [...new Set([...KNOWN_GENRES, ...seen, ...blocked])]
      .filter((g) => typeof g === "string" && g)
      .sort((a, b) => a.localeCompare(b, "ja"));
  }

  function renderGenres(blocked, seen) {
    const blockedSet = new Set(blocked);
    genreListEl.textContent = "";
    for (const g of allCategories(blocked, seen)) {
      const label = document.createElement("label");
      label.className = "genre-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      // チェック＝表示する。外すと非表示。
      cb.checked = !blockedSet.has(g);
      cb.addEventListener("change", async () => {
        const cur = (await getLocal(GENRES_KEY))[GENRES_KEY] || [];
        const set = new Set(cur);
        if (cb.checked) set.delete(g); else set.add(g); // チェック=表示なので外すと非表示
        await setLocal({ [GENRES_KEY]: [...set] });
      });
      const span = document.createElement("span");
      span.textContent = g;
      label.appendChild(cb);
      label.appendChild(span);
      genreListEl.appendChild(label);
    }
  }

  async function refreshGenres() {
    const { blocked, seen } = await loadGenreState();
    renderGenres(blocked, seen);
  }

  // ---- サークル ----
  async function getCircles() {
    return (await getLocal(CIRCLES_KEY))[CIRCLES_KEY] || {};
  }
  async function setCircles(map) {
    await setLocal({ [CIRCLES_KEY]: map });
  }

  async function renderCircles() {
    const map = await getCircles();
    const ids = Object.keys(map).sort((a, b) =>
      (map[a] || "").toString().localeCompare((map[b] || "").toString(), "ja"));

    tbodyEl.textContent = "";
    countEl.textContent = `${ids.length}件`;
    tableEl.hidden = ids.length === 0;
    emptyEl.hidden = ids.length !== 0;

    for (const id of ids) {
      const tr = document.createElement("tr");

      // 名前（編集可）
      const nameTd = document.createElement("td");
      const nameInputEl = document.createElement("input");
      nameInputEl.className = "name-input";
      nameInputEl.value = map[id] || "";
      nameInputEl.placeholder = "(名称未設定)";
      const save = async () => {
        const cur = await getCircles();
        if (!(id in cur)) return;
        cur[id] = nameInputEl.value.trim();
        await setCircles(cur);
      };
      nameInputEl.addEventListener("blur", save);
      nameInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") nameInputEl.blur();
      });
      nameTd.appendChild(nameInputEl);

      // maker ID
      const idTd = document.createElement("td");
      idTd.className = "id-cell";
      idTd.textContent = id;

      // 操作
      const actTd = document.createElement("td");
      actTd.className = "actions";
      const del = document.createElement("button");
      del.className = "mini";
      del.textContent = "解除";
      del.addEventListener("click", async () => {
        const cur = await getCircles();
        delete cur[id];
        await setCircles(cur);
        renderCircles();
      });
      actTd.appendChild(del);

      tr.appendChild(nameTd);
      tr.appendChild(idTd);
      tr.appendChild(actTd);
      tbodyEl.appendChild(tr);
    }
  }

  async function addFromInputs() {
    clearError();
    const id = idInput.value.trim();
    const name = nameInput.value.trim();
    if (!/^\d+$/.test(id)) {
      showError("maker ID は数字で入力してください。");
      return;
    }
    const map = await getCircles();
    map[id] = name || map[id] || "";
    await setCircles(map);
    nameInput.value = "";
    idInput.value = "";
    renderCircles();
  }

  addBtn.addEventListener("click", addFromInputs);
  idInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addFromInputs(); });

  clearBtn.addEventListener("click", async () => {
    const map = await getCircles();
    if (Object.keys(map).length === 0) return;
    if (!confirm("非表示サークルをすべて解除します。よろしいですか？")) return;
    await setCircles({});
    renderCircles();
  });

  // ---- エクスポート / インポート ----
  const EXPORT_APP = "fanza-doujin-circle-filter";

  function showMsg(text, ok) {
    backupMsg.textContent = text;
    backupMsg.className = ok ? "msg ok" : "msg error";
    backupMsg.hidden = false;
  }

  async function doExport() {
    const res = await getLocal([CIRCLES_KEY, GENRES_KEY]);
    const data = {
      app: EXPORT_APP,
      version: 1,
      exportedAt: new Date().toISOString(),
      [CIRCLES_KEY]: res[CIRCLES_KEY] || {},
      [GENRES_KEY]: Array.isArray(res[GENRES_KEY]) ? res[GENRES_KEY] : DEFAULT_GENRES,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const stamp = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");
    const a = document.createElement("a");
    a.href = url;
    a.download = `circlefilter-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    const n = Object.keys(data[CIRCLES_KEY]).length;
    showMsg(`エクスポートしました（サークル${n}件）。`, true);
  }

  async function doImport(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      showMsg("読み込みに失敗しました。JSONファイルが壊れている可能性があります。", false);
      return;
    }
    const inCircles = data && typeof data[CIRCLES_KEY] === "object" && data[CIRCLES_KEY]
      ? data[CIRCLES_KEY] : null;
    const inGenres = data && Array.isArray(data[GENRES_KEY]) ? data[GENRES_KEY] : null;
    if (!inCircles && !inGenres) {
      showMsg("この拡張機能のバックアップファイルではないようです。", false);
      return;
    }

    // 既存設定に追加（マージ）する。
    const cur = await getLocal([CIRCLES_KEY, GENRES_KEY]);
    let added = 0;
    if (inCircles) {
      const map = cur[CIRCLES_KEY] || {};
      for (const id of Object.keys(inCircles)) {
        if (!/^\d+$/.test(id)) continue; // maker ID は数字のみ
        if (!(id in map)) added++;
        map[id] = typeof inCircles[id] === "string" ? inCircles[id] : (map[id] || "");
      }
      await setLocal({ [CIRCLES_KEY]: map });
    }
    if (inGenres) {
      const set = new Set(cur[GENRES_KEY] || []);
      for (const g of inGenres) if (typeof g === "string") set.add(g);
      await setLocal({ [GENRES_KEY]: [...set] });
    }

    renderCircles();
    refreshGenres();
    showMsg(`インポートしました（サークル${added}件を追加）。`, true);
  }

  exportBtn.addEventListener("click", doExport);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    const file = importFile.files && importFile.files[0];
    if (file) doImport(file);
    importFile.value = ""; // 同じファイルを再選択できるようにリセット
  });

  // 他タブ（ポップアップ等）での変更を反映
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CIRCLES_KEY]) renderCircles();
    // 非表示設定の変更、または新カテゴリの発見時にチェックボックスを更新。
    if (changes[GENRES_KEY] || changes[SEEN_KEY]) refreshGenres();
  });

  // 初期描画
  (async () => {
    await refreshGenres();
    renderCircles();
  })();
})();
