/* 非表示サークルの管理ポップアップ */
(() => {
  "use strict";

  const STORAGE_KEY = "blockedCircles";

  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("empty");
  const countEl = document.getElementById("count");
  const nameInput = document.getElementById("add-name");
  const idInput = document.getElementById("add-id");
  const addBtn = document.getElementById("add-btn");
  const addError = document.getElementById("add-error");
  const clearBtn = document.getElementById("clear-btn");

  function getBlocked() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (res) => resolve(res[STORAGE_KEY] || {}));
    });
  }

  function setBlocked(blocked) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: blocked }, resolve);
    });
  }

  function showError(msg) {
    addError.textContent = msg;
    addError.hidden = false;
  }

  function clearError() {
    addError.hidden = true;
  }

  async function render() {
    const blocked = await getBlocked();
    const ids = Object.keys(blocked).sort((a, b) => {
      const na = (blocked[a] || "").toString();
      const nb = (blocked[b] || "").toString();
      return na.localeCompare(nb, "ja");
    });

    listEl.textContent = "";
    countEl.textContent = `${ids.length}件`;
    emptyEl.hidden = ids.length !== 0;

    for (const id of ids) {
      const name = blocked[id];
      const li = document.createElement("li");

      const info = document.createElement("div");
      info.className = "item-info";
      const nameEl = document.createElement("div");
      nameEl.className = name ? "item-name" : "item-name unknown";
      nameEl.textContent = name || "(名称未取得)";
      const idEl = document.createElement("div");
      idEl.className = "item-id";
      idEl.textContent = `maker ID: ${id}`;
      info.appendChild(nameEl);
      info.appendChild(idEl);

      const btn = document.createElement("button");
      btn.className = "unblock";
      btn.textContent = "解除";
      btn.addEventListener("click", async () => {
        const cur = await getBlocked();
        delete cur[id];
        await setBlocked(cur);
        render();
      });

      li.appendChild(info);
      li.appendChild(btn);
      listEl.appendChild(li);
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
    const blocked = await getBlocked();
    blocked[id] = name || blocked[id] || "";
    await setBlocked(blocked);
    nameInput.value = "";
    idInput.value = "";
    render();
  }

  addBtn.addEventListener("click", addFromInputs);
  idInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addFromInputs();
  });

  document.getElementById("options-btn").addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL("options.html"));
  });

  clearBtn.addEventListener("click", async () => {
    const blocked = await getBlocked();
    if (Object.keys(blocked).length === 0) return;
    if (!confirm("非表示リストをすべて解除します。よろしいですか？")) return;
    await setBlocked({});
    render();
  });

  render();
})();
