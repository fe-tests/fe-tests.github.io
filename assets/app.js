/* app.js — 门户首页渲染逻辑：注册表加载 → 分类筛选 → 搜索 → 排序 → 卡片/列表切换。 */
(function () {
  "use strict";

  const state = {
    data: null,
    view: "card",
    category: "all",
    keyword: "",
    sort: "pinned-desc"
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    gridCard: document.querySelector(".view-card"),
    gridList: document.querySelector(".view-list"),
    categoryBar: $("category-bar"),
    grid: $("grid"),
    search: $("search"),
    sort: $("sort"),
    count: $("result-count"),
    empty: $("empty"),
    title: $("site-title"),
    subtitle: $("site-subtitle")
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function statusClass(status) {
    return "status-" + (status || "stable");
  }

  function statusLabel(status) {
    return ({ stable: "稳定", experimental: "实验", alpha: "开发中" })[status] || "稳定";
  }

  function getStatusBadge(status) {
    return '<span class="card-status ' + statusClass(status) + '">' + escapeHtml(statusLabel(status)) + '</span>';
  }

  function renderCategoryBar() {
    const cats = [{ id: "all", name: "全部" }].concat(state.data.categories || []);
    els.categoryBar.innerHTML = cats.map(function (c) {
      const active = c.id === state.category ? " active" : "";
      return '<button class="chip' + active + '" data-cat="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</button>';
    }).join("");
    els.categoryBar.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.category = btn.getAttribute("data-cat");
        renderCategoryBar();
        render();
      });
    });
  }

  function renderCard() {
    els.gridList.classList.add("hidden");
    els.gridCard.classList.remove("hidden");
    els.gridCard.innerHTML = state.filtered.map(function (p) {
      const tags = (p.tags || []).slice(0, 5).map(function (t) {
        return '<span class="tag">#' + escapeHtml(t) + '</span>';
      }).join("");
      const pinnedDot = p.pinned ? '<span class="pinned-dot" title="已置顶">📌</span>' : "";
      return '<a class="card" href="' + escapeHtml(p.url) + '" title="' + escapeHtml(p.description || "") + '">' +
        pinnedDot + getStatusBadge(p.status) +
        '<div class="card-top"><span class="card-emoji">' + escapeHtml(p.emoji || "📄") + '</span>' +
        '<h3 class="card-title">' + escapeHtml(p.title) + '</h3>' +
        '<span class="card-badge">' + escapeHtml(p.categoryName) + '</span></div>' +
        '<p class="card-desc">' + escapeHtml(p.description || "") + '</p>' +
        '<div class="card-tags">' + (tags || "") + '</div>' +
        '</a>';
    }).join("");
  }

  function renderList() {
    els.gridCard.classList.add("hidden");
    els.gridList.classList.remove("hidden");
    els.gridList.innerHTML = state.filtered.map(function (p) {
      return '<a class="row" href="' + escapeHtml(p.url) + '">' +
        '<span class="row-emoji">' + escapeHtml(p.emoji || "📄") + '</span>' +
        '<span class="row-title">' + escapeHtml(p.title) + ' ' + (p.pinned ? "📌" : "") + '</span>' +
        '<span class="row-desc">' + escapeHtml(p.description || "") + '</span>' +
        '<span class="row-status ' + statusClass(p.status) + '">' + escapeHtml(statusLabel(p.status)) + '</span>' +
        '</a>';
    }).join("");
  }

  function applyFilters() {
    let list = state.data.pages.slice();

    if (state.category !== "all") {
      list = list.filter(function (p) { return p.category === state.category; });
    }
    if (state.keyword) {
      const k = state.keyword.toLowerCase();
      list = list.filter(function (p) {
        return (p.title + " " + (p.description || "") + " " + (p.tags || []).join(" ")).toLowerCase().indexOf(k) !== -1;
      });
    }

    // 排序
    const sortFns = {
      "pinned-desc": (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || compareStr(b.updatedAt, a.updatedAt),
      "updated-desc": (a, b) => compareStr(b.updatedAt, a.updatedAt),
      "created-desc": (a, b) => compareStr(b.createdAt, a.createdAt),
      "title-asc": (a, b) => compareStr(a.title, b.title)
    };
    list.sort(sortFns[state.sort] || sortFns["pinned-desc"]);

    state.filtered = list;
  }

  function compareStr(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  function setView(v) {
    state.view = v;
    document.querySelectorAll(".toggle-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === v);
    });
    render();
  }

  function render() {
    applyFilters();
    els.empty.classList.toggle("hidden", state.filtered.length !== 0);
    els.count.textContent = state.filtered.length + " 个结果";
    if (state.view === "list") renderList(); else renderCard();
  }

  function init() {
    // 从站点配置读取标题
    if (els.title) els.title.textContent = (state.data.site && state.data.site.title) || els.title.textContent;
    if (els.subtitle && state.data.site && state.data.site.subtitle) els.subtitle.textContent = state.data.site.subtitle;

    // 视图切换按钮
    document.querySelectorAll(".toggle-btn").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
    });
    // 搜索（防抖）
    let t;
    els.search.addEventListener("input", function () {
      clearTimeout(t); t = setTimeout(function () { state.keyword = els.search.value.trim(); render(); }, 150);
    });
    // 排序
    els.sort.addEventListener("change", function () { state.sort = els.sort.value; render(); });

    setView(state.data.views.default === "list" ? "list" : "card");
    renderCategoryBar();
    render();
  }

  function boot() {
    // 始终从 registry.json 获取最新配置，不使用本地缓存。
    Registry.load().then(function (d) {
      state.data = d; init();
    });
  }

  boot();
})();
