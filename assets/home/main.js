/* main.js — 首页装配：注册表加载 → App 列表 → 筛选/排序 → 主屏/列表渲染 → 交互绑定。
 * 数据源只有 registry.json（见 assets/registry.js）；本文件不硬编码任何页面。 */

import { init as initSheets, openSheet, openActionSheet, openContextMenu, showToast, closeTop } from "./sheets.js";
import { createState, loadSettings, saveSettings, clearSettings, loadDockExtras, saveDockExtras, readLocationState, writeLocationState, SORTS } from "./state.js";
import { SYSTEM_APPS, appsFromPages, labelOf, iconMarkup, iconStyle, tileHTML } from "./apps.js";
import { renderSpringboard, renderDots, setDotActive, bindPaging, bindTiles, handleGridKey, bindPullDown } from "./springboard.js";
import { renderListView } from "./listview.js";
import { createSpotlight } from "./spotlight.js";
import { openSettings } from "./settings.js";
import { icons } from "./icons.js";
import { debounce, clockTime, copyText, absoluteUrl, formatDate, statusLabel, statusClass, escapeHtml } from "./format.js";

const $ = function (id) { return document.getElementById(id); };
const mqMobile = window.matchMedia("(max-width: 767px)");
const mqPC = window.matchMedia("(min-width: 1024px)");
const mqDark = window.matchMedia("(prefers-color-scheme: dark)");
const MOBILE_PAGE_ROWS = 6;   // 移动端主屏：4 列 × 6 行

const els = {
  app: $("ios-app"),
  chrome: $("ios-chrome"),
  content: $("ios-content"),
  gridCard: $("grid-card"),
  gridList: $("grid-list"),
  dots: $("page-dots"),
  more: $("more-box"),
  moreBtn: $("more-btn"),
  moreInfo: $("more-info"),
  empty: $("empty"),
  count: $("result-count"),
  search: $("search"),
  searchbar: $("searchbar"),
  searchClear: $("search-clear"),
  searchOpen: $("search-open"),
  sortBtn: $("sort-btn"),
  sortBtnLabel: $("sort-btn-label"),
  sortSelect: $("sort"),
  viewToggle: $("view-toggle"),
  categoryBar: $("category-bar"),
  categorySlot: $("category-slot"),
  controls: $("controls"),
  controlsSlot: $("controls-slot"),
  searchSlot: $("searchbar-slot"),
  sidebarApps: $("sidebar-apps"),
  dock: $("dock"),
  title: $("site-title"),
  subtitle: $("site-subtitle"),
  navbarTitle: $("navbar-title"),
  brandTitle: $("sidebar-brand-title"),
  brandSub: $("sidebar-brand-sub"),
  themeMeta: $("theme-color-meta"),
  themeBtn: $("btn-theme"),
  settingsBtn: $("btn-settings"),
  clock: $("statusbar-time"),
  spotlight: $("spotlight"),
  spotInput: $("spotlight-input"),
  spotClear: $("spotlight-clear"),
  spotBody: $("spotlight-body"),
  spotCancel: $("spotlight-cancel"),
  sheetHost: $("sheet-host"),
  toast: $("toast"),
  footer: $("site-footer"),
};

let state = null;
let apps = { list: [], byId: {} };
let settings = null;
let dockExtras = [];
let paging = null;
let spotlight = null;
const origParent = new Map();

/* ------------------------------ App 列表 ------------------------------ */

function buildApps(data) {
  const list = appsFromPages(data.pages).concat(SYSTEM_APPS);
  const byId = {};
  list.forEach(function (a) { byId[a.id] = a; });
  apps = { list: list, byId: byId };
}

function matchesKeyword(app, kw) {
  if (!kw) return true;
  const hay = [app.title, app.mobileTitle, app.description, app.categoryName, (app.tags || []).join(" ")]
    .filter(Boolean).join(" ").toLowerCase();
  return kw.split(/\s+/).every(function (token) { return token && hay.indexOf(token) >= 0; });
}

function filterApps() {
  const kw = (state.keyword || "").trim().toLowerCase();
  const cat = state.category;
  return apps.list.filter(function (app) {
    if (cat !== "all" && app.category !== cat) return false;
    return matchesKeyword(app, kw);
  });
}

function sortApps(list, sort) {
  const arr = list.slice();
  const byTime = function (key) {
    return function (a, b) {
      const x = String(a[key] || ""), y = String(b[key] || "");
      if (x === y) return String(a.title).localeCompare(String(b.title), "zh");
      return x < y ? 1 : -1;
    };
  };
  if (sort === "title-asc") return arr.sort(function (a, b) { return String(a.title).localeCompare(String(b.title), "zh"); });
  if (sort === "updated-desc") return arr.sort(byTime("updatedAt"));
  if (sort === "created-desc") return arr.sort(byTime("createdAt"));
  // pinned-desc：置顶优先，其次最近更新
  return arr.sort(function (a, b) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return byTime("updatedAt")(a, b);
  });
}

/* ------------------------------ 渲染 ------------------------------ */

function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  settings = saveSettings({ theme: mode });
  const dark = mode === "dark" || (mode === "auto" && mqDark.matches);
  if (els.themeMeta) els.themeMeta.setAttribute("content", dark ? "#000000" : "#f2f2f7");
  if (els.themeBtn) {
    els.themeBtn.innerHTML = mode === "light" ? icons.sun : mode === "dark" ? icons.moon : icons.contrast;
    els.themeBtn.setAttribute("aria-label", "主题：" + ({ auto: "自动", light: "浅色", dark: "深色" })[mode]);
  }
}

function applyIconSize(size) {
  document.body.classList.toggle("big-icons", size === "big");
}

function renderChrome(data) {
  const site = data.site || {};
  const title = site.title || "AI 编程模型实验室";
  const sub = site.subtitle || "";
  [els.title, els.brandTitle, els.navbarTitle].forEach(function (el) { if (el) el.textContent = title; });
  [els.subtitle, els.brandSub].forEach(function (el) { if (el) el.textContent = sub; });
  document.title = title;
  if (els.search) els.search.setAttribute("placeholder", "搜索页面标题 / 描述 / 标签（共 " + apps.list.filter(function (a) { return a.kind === "page"; }).length + " 个）");
}

function renderCategories() {
  const cats = [{ id: "all", name: "全部" }].concat(state.data.categories || []);
  els.categoryBar.innerHTML = cats.map(function (c) {
    return '<button class="ios-chip' + (c.id === state.category ? " active" : "") +
      '" type="button" data-cat="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + "</button>";
  }).join("");
}

function renderSidebarApps() {
  els.sidebarApps.innerHTML = SYSTEM_APPS.map(function (app) {
    return '<a class="ios-row" href="' + escapeHtml(app.url) + '" data-app="' + escapeHtml(app.id) + '">' +
      '<span class="ios-row-icon" style="' + iconStyle(app) + '" aria-hidden="true">' + iconMarkup(app) + "</span>" +
      '<span class="ios-row-main"><span class="ios-row-title">' + escapeHtml(labelOf(app, state.isMobile)) + "</span></span>" +
      "</a>";
  }).join("");
}

function renderDock() {
  const pinned = apps.list.filter(function (a) { return a.kind === "page" && a.pinned; });
  const extras = dockExtras.map(function (url) { return apps.byId[url]; }).filter(function (a) {
    return a && !a.pinned;
  });
  const sys = SYSTEM_APPS.slice();
  const html = sys.map(function (a) {
    return tileHTML(a, { isMobile: state.isMobile, showStatus: false });
  }).join("") +
    (pinned.length || extras.length ? '<span class="ios-dock-sep" aria-hidden="true"></span>' : "") +
    pinned.concat(extras).map(function (a) {
      return tileHTML(a, { isMobile: state.isMobile, showStatus: false });
    }).join("") +
    '<button class="ios-dock-toggle" id="dock-toggle" type="button">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg>' +
    '<span class="ios-dock-toggle-text">收起 Dock</span></button>';
  els.dock.innerHTML = html;
  applyDock();
}

/** Dock 收起状态 → body 类 + 按钮文案/aria（内容区预留高度由 --dock-space 跟着变） */
function applyDock() {
  const hidden = !!state.dockHidden;
  document.body.classList.toggle("dock-hidden", hidden);
  const btn = els.dock.querySelector("#dock-toggle");
  if (!btn) return;
  btn.setAttribute("aria-label", hidden ? "展开 Dock 常驻栏" : "收起 Dock 常驻栏");
  btn.setAttribute("aria-expanded", hidden ? "false" : "true");
  const text = btn.querySelector(".ios-dock-toggle-text");
  if (text) text.textContent = hidden ? "显示 Dock" : "收起 Dock";
}

function toggleDock() {
  const hidden = !state.dockHidden;
  settings = saveSettings({ dock: hidden ? "hide" : "show" });
  state.set({ dockHidden: hidden });
  applyDock();
  showToast(hidden ? "Dock 已收起，点细棒展开（键盘 D）" : "Dock 已展开（键盘 D）");
}

function renderViewToggle() {
  if (!state.allowToggle) { els.viewToggle.classList.add("hidden"); return; }
  els.viewToggle.classList.remove("hidden");
  els.viewToggle.querySelectorAll(".ios-seg-btn").forEach(function (b) {
    const on = b.getAttribute("data-view") === state.view;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  positionThumb(els.viewToggle);
}

function positionThumb(seg) {
  const active = seg && seg.querySelector(".ios-seg-btn.active");
  const thumb = seg && seg.querySelector(".ios-seg-thumb");
  if (!active || !thumb || !active.offsetWidth) return;
  const r = active.getBoundingClientRect(), pr = seg.getBoundingClientRect();
  thumb.style.width = r.width + "px";
  thumb.style.transform = "translateX(" + (r.left - pr.left - 2) + "px)";
  seg.dataset.thumb = "ready";
}

function renderCount(shown, total) {
  if (!total) { els.count.textContent = "0 个结果"; return; }
  els.count.textContent = shown >= total ? total + " 个结果" : "显示 " + shown + " / " + total;
}

function onPageIndex(i) {
  state.page = i;
  setDotActive(els.dots, i);
}

function renderAll() {
  const sorted = sortApps(filterApps(), state.sort);
  const total = sorted.length;
  const cap = state.perPage > 0 ? state.perPage : total;
  const capped = sorted.slice(0, cap);
  const paged = state.view === "card" && state.isMobile;
  const rendered = paged ? capped : capped.slice(0, state.limit);
  const hasMore = rendered.length < capped.length;

  els.empty.classList.toggle("hidden", total > 0);

  if (state.view === "card") {
    els.gridCard.classList.remove("hidden");
    els.gridList.classList.add("hidden");
    const res = renderSpringboard(els.gridCard, rendered, {
      paged: paged,
      pageSize: state.pageSize,
      isMobile: state.isMobile,
      hasMore: hasMore,
      moreCount: total - rendered.length,
    });
    if (paged && !paging) paging = bindPaging(els.gridCard, onPageIndex);
    renderDots(els.dots, paged ? res.pages.length : 0, state.page, function (i) { if (paging) paging.goTo(i); });
    els.more.classList.add("hidden");
  } else {
    els.gridCard.classList.add("hidden");
    els.gridList.classList.remove("hidden");
    els.dots.classList.add("hidden");
    renderListView(els.gridList, rendered, { isMobile: state.isMobile });
    els.more.classList.toggle("hidden", !hasMore);
    els.moreInfo.textContent = hasMore ? "已显示 " + rendered.length + " / " + capped.length : "";
  }

  renderCount(rendered.length, total);
  renderViewToggle();
  els.sortBtnLabel.textContent = SORTS[state.sort] || state.sort;
  els.sortSelect.value = state.sort;
  els.searchClear.hidden = !state.keyword;
  writeLocationState(state);
  if (spotlight && spotlight.isOpen()) spotlight.render();
}

/* ------------------------------ 详情浮层 ------------------------------ */

function detailBody(app) {
  const rows = [];
  const cell = function (label, value) {
    rows.push('<div class="ios-cell"><span class="ios-cell-label">' + escapeHtml(label) + "</span>" +
      '<span class="ios-cell-value">' + (value || "") + "</span></div>");
  };
  cell("分类", escapeHtml(app.categoryName || "未分类"));
  if (app.status) cell("状态", '<span class="ios-status-dot ' + statusClass(app.status) + '"></span>' + escapeHtml(statusLabel(app.status)));
  if (app.tags && app.tags.length) {
    cell("标签", app.tags.slice(0, 8).map(function (t) { return '<span class="ios-tag">#' + escapeHtml(t) + "</span>"; }).join(" "));
  }
  if (app.createdAt) cell("创建", escapeHtml(formatDate(app.createdAt)));
  if (app.updatedAt) cell("更新", escapeHtml(formatDate(app.updatedAt)));
  cell("路径", '<span class="ios-mono">' + escapeHtml(app.url) + "</span>");
  return '<div class="ios-detail-head">' +
    '<span class="ios-detail-icon" style="' + iconStyle(app) + '" aria-hidden="true">' + iconMarkup(app) + "</span>" +
    '<span class="ios-detail-title">' + escapeHtml(labelOf(app, state.isMobile)) + "</span>" +
    '<span class="ios-detail-desc">' + escapeHtml(app.description || "（无描述）") + "</span>" +
    (app.pinned ? '<span class="ios-badge">📌 已置顶</span>' : "") +
    "</div>" +
    '<div class="ios-section"><div class="ios-section-header">信息</div><div class="ios-list">' + rows.join("") + "</div></div>";
}

function openDetail(app) {
  const sheet = openSheet({
    title: labelOf(app, state.isMobile),
    label: app.title + " 详情",
    bodyHTML: detailBody(app),
    footerHTML:
      '<button class="ios-btn ios-btn-filled" type="button" data-open>' + (app.kind === "system" && app.pageKind === "settings" ? "打开设置" : "打开") + "</button>" +
      '<button class="ios-btn" type="button" data-newwin>新窗口打开</button>' +
      (app.kind === "page" ? '<button class="ios-btn" type="button" data-copy>复制链接</button>' : ""),
  });
  sheet.el.addEventListener("click", function (e) {
    if (e.target.closest("[data-open]")) { sheet.close(); openApp(app); }
    if (e.target.closest("[data-newwin]")) openNewWindow(app);
    if (e.target.closest("[data-copy]")) copyLink(app);
  });
}

function openApp(app) {
  if (app.kind === "system" && app.pageKind === "settings") { openSettingsPanel(); return; }
  window.location.assign(absoluteUrl(app.url));
}
function openNewWindow(app) {
  const w = window.open(absoluteUrl(app.url), "_blank", "noopener");
  if (!w) showToast("弹窗被拦截，请允许打开新窗口");
}
async function copyLink(app) {
  const ok = await copyText(absoluteUrl(app.url));
  showToast(ok ? "已复制链接" : "复制失败，请手动复制", ok ? "check" : "warning");
}

function toggleDockExtra(app) {
  const i = dockExtras.indexOf(app.id);
  if (i >= 0) dockExtras.splice(i, 1); else dockExtras.push(app.id);
  saveDockExtras(dockExtras);
  renderDock();
  showToast(i >= 0 ? "已从 Dock 移除" : "已添加到 Dock", i >= 0 ? "x" : "check");
}

function inDock(app) { return dockExtras.indexOf(app.id) >= 0; }

function openTileMenu(app, x, y) {
  const items = [
    { label: "打开", value: "open", icon: app.kind === "system" && app.pageKind === "settings" ? "gear2" : "open" },
    { label: "详情", value: "info", icon: "info" },
  ];
  if (app.kind === "page") {
    items.push({ label: "在新窗口打开", value: "newwin", icon: "open" });
    items.push({ label: "复制链接", value: "copy", icon: "copy" });
    items.push({ sep: true });
    items.push({ label: inDock(app) ? "从 Dock 移除" : "添加到 Dock", value: "dock", icon: inDock(app) ? "x" : "plus" });
  }
  openContextMenu({
    x: x, y: y,
    label: labelOf(app, state.isMobile) + " 操作",
    items: items,
    onSelect: function (value) {
      if (value === "open") openApp(app);
      else if (value === "info") openDetail(app);
      else if (value === "newwin") openNewWindow(app);
      else if (value === "copy") copyLink(app);
      else if (value === "dock") toggleDockExtra(app);
    },
  });
}

function openSettingsPanel() {
  openSettings({
    getSettings: function () { return settings; },
    getState: function () { return state; },
    registryUrl: window.Registry ? window.Registry.url : "registry.json",
    count: apps.list.filter(function (a) { return a.kind === "page"; }).length,
    onTheme: function (v) { applyTheme(v); showToast("主题已切换"); },
    onView: function (v) { setView(v); },
    onIconSize: function (v) { settings = saveSettings({ iconSize: v }); applyIconSize(v); renderAll(); },
    onPerPage: function (v) {
      const n = Number(v) > 0 ? Number(v) : 0;
      settings = saveSettings({ perPage: n });
      state.set({ perPage: n, limit: n > 0 ? n : Number.MAX_SAFE_INTEGER });
    },
    onSort: function (v) { state.set({ sort: v, limit: state.perPage > 0 ? state.perPage : Number.MAX_SAFE_INTEGER }); },
    onDock: function (show) {
      settings = saveSettings({ dock: show ? "show" : "hide" });
      state.set({ dockHidden: !show });
      applyDock();
    },
    onReset: function () {
      clearSettings();
      settings = loadSettings();
      applyTheme(settings.theme);
      applyIconSize(settings.iconSize);
      state.set({ perPage: settings.perPage, sort: settings.sort, iconSize: settings.iconSize, dockHidden: settings.dock === "hide" });
      applyDock();
    },
    onOpenSettings: function () { /* 预留：设置浮层打开回调 */ },
  });
}

/* ------------------------------ 交互绑定 ------------------------------ */

function setView(view) {
  const v = (view === "list" && state.allowToggle) ? "list" : "card";
  settings = saveSettings({ view: v });
  state.set({ view: v, page: 0, limit: state.perPage > 0 ? state.perPage : Number.MAX_SAFE_INTEGER });
}

function setKeyword(kw) {
  if (els.search.value !== kw) els.search.value = kw;
  if (els.spotInput.value !== kw) els.spotInput.value = kw;
  state.set({ keyword: kw, page: 0, limit: state.perPage > 0 ? state.perPage : Number.MAX_SAFE_INTEGER });
}

function relocate() {
  const pc = mqPC.matches;
  [[els.searchbar, els.searchSlot], [els.controls, els.controlsSlot], [els.categoryBar, els.categorySlot]]
    .forEach(function (pair) {
      const node = pair[0], slot = pair[1];
      if (!node || !slot) return;
      const target = pc ? slot : origParent.get(node);
      if (target && node.parentElement !== target) target.appendChild(node);
    });
  if (pc) positionThumb(els.viewToggle);
}

function bindChrome() {
  els.categoryBar.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-cat]");
    if (!btn) return;
    state.set({ category: btn.getAttribute("data-cat"), page: 0, limit: state.perPage > 0 ? state.perPage : Number.MAX_SAFE_INTEGER });
  });

  els.viewToggle.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-view]");
    if (btn) setView(btn.getAttribute("data-view"));
  });

  els.sortBtn.addEventListener("click", function () {
    openActionSheet({
      title: "排序方式",
      items: Object.keys(SORTS).map(function (k) { return { label: SORTS[k], value: k, checked: state.sort === k }; }),
    }).then(function (v) {
      if (v) state.set({ sort: v, page: 0, limit: state.perPage > 0 ? state.perPage : Number.MAX_SAFE_INTEGER });
    });
  });

  els.sortSelect.addEventListener("change", function () {
    state.set({ sort: els.sortSelect.value, page: 0, limit: state.perPage > 0 ? state.perPage : Number.MAX_SAFE_INTEGER });
  });

  const pushKeyword = debounce(function (v) { setKeyword(v); }, 150);
  els.search.addEventListener("input", function () { pushKeyword(els.search.value); });
  els.searchClear.addEventListener("click", function () { setKeyword(""); els.search.focus(); });
  els.searchOpen.addEventListener("click", function () { if (spotlight) spotlight.open(); });

  els.themeBtn.addEventListener("click", function () {
    const order = ["auto", "light", "dark"];
    const next = order[(order.indexOf(settings.theme) + 1) % order.length];
    applyTheme(next);
    showToast("主题：" + ({ auto: "自动", light: "浅色", dark: "深色" })[next]);
  });

  els.settingsBtn.addEventListener("click", openSettingsPanel);

  els.moreBtn.addEventListener("click", function () {
    state.set({ limit: state.limit + (state.perPage > 0 ? state.perPage : 24) });
  });

  // 滚动 → 导航条内联标题
  const onScroll = function () {
    document.body.classList.toggle("scrolled", (document.scrollingElement || document.body).scrollTop > 8);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  els.gridCard.addEventListener("scroll", function (e) {
    const page = e.target.closest(".ios-page");
    if (page) document.body.classList.toggle("scrolled", page.scrollTop > 8);
  }, { passive: true, capture: true });

  // 移动端下拉 → Spotlight
  bindPullDown(els.gridCard, function () { if (spotlight) spotlight.open(); });

  // 图块/行交互
  const tileHandlers = {
    byId: function (id) { return apps.byId[id]; },
    onOpen: function (app, el, ev) {
      if (app.kind === "system") { ev.preventDefault(); openApp(app); }
    },
    onContext: function (app, el, x, y) { openTileMenu(app, x, y); },
    onLoadMore: function () {
      state.set({ limit: state.limit + (state.perPage > 0 ? state.perPage : 24) });
    },
  };
  bindTiles(els.gridCard, tileHandlers);
  bindTiles(els.gridList, tileHandlers);
  bindTiles(els.dock, tileHandlers);
  els.dock.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#dock-toggle")) toggleDock();
  });
  bindTiles(els.sidebarApps, tileHandlers);

  // 键盘：网格方向键 + 快捷键
  document.addEventListener("keydown", function (e) {
    const tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select";
    if (e.key === "Escape") { if (closeTop()) return; if (spotlight && spotlight.isOpen()) spotlight.close(); return; }
    if (typing) return;
    if (e.key === "/") {
      e.preventDefault();
      if (state.isMobile) { if (spotlight) spotlight.open(); }
      else els.search.focus();
      return;
    }
    if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      setView(state.view === "card" ? "list" : "card");
      showToast(state.view === "card" ? "图标视图" : "列表视图");
      return;
    }
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      els.themeBtn.click();
      return;
    }
    if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      toggleDock();
      return;
    }
    if (state.view === "card" && ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].indexOf(e.key) >= 0) {
      const handled = handleGridKey(els.gridCard, e, { paged: state.isMobile, paging: paging });
      if (handled) e.preventDefault();
    }
  });

  // 视口变化
  const onViewportChange = debounce(function () {
    state.set({
      isMobile: mqMobile.matches,
      pageSize: state.isMobile ? 4 * MOBILE_PAGE_ROWS : 9999,
      page: 0,
      limit: state.perPage > 0 ? state.perPage : Number.MAX_SAFE_INTEGER,
    });
    relocate();
    positionThumb(els.viewToggle);
  }, 140);
  mqMobile.addEventListener("change", onViewportChange);
  mqPC.addEventListener("change", onViewportChange);
  window.addEventListener("resize", onViewportChange);
  mqDark.addEventListener("change", function () { if (settings.theme === "auto") applyTheme("auto"); });
}

function startClock() {
  const tick = function () { if (els.clock) els.clock.textContent = clockTime(); };
  tick();
  setInterval(tick, 15000);
}

/* ------------------------------ 启动 ------------------------------ */

function boot(data) {
  initSheets(els.sheetHost, els.toast);
  buildApps(data);
  settings = loadSettings();
  dockExtras = loadDockExtras();

  const views = data.views || {};
  const allowToggle = views.allowToggle !== false;
  const fromUrl = readLocationState();
  const perPage = settings.perPage > 0 ? settings.perPage : (Number(views.perPage) > 0 ? Number(views.perPage) : 24);

  state = createState({
    data: data,
    view: (fromUrl.view || settings.view || views.default || "card") === "list" && allowToggle ? "list" : "card",
    allowToggle: allowToggle,
    category: fromUrl.category || "all",
    keyword: fromUrl.keyword || "",
    sort: fromUrl.sort || settings.sort,
    perPage: perPage,
    limit: perPage > 0 ? perPage : Number.MAX_SAFE_INTEGER,
    page: 0,
    isMobile: mqMobile.matches,
    pageSize: mqMobile.matches ? 4 * MOBILE_PAGE_ROWS : 9999,
    dockHidden: settings.dock === "hide",
  });

  state.subscribe(function (changed) {
    const keys = Object.keys(changed);
    if (keys.length === 1 && keys[0] === "dockHidden") { applyDock(); return; }
    if (changed.perPage || changed.limit) { /* 渲染由 renderAll 统一处理 */ }
    renderAll();
  });

  applyTheme(settings.theme);
  applyIconSize(settings.iconSize);

  [els.searchbar, els.controls, els.categoryBar].forEach(function (n) { origParent.set(n, n.parentElement); });

  renderChrome(data);
  renderCategories();
  renderSidebarApps();
  renderDock();
  spotlight = createSpotlight({
    els: { root: els.spotlight, input: els.spotInput, clear: els.spotClear, body: els.spotBody, cancel: els.spotCancel },
    isMobile: true,
    getKeyword: function () { return state.keyword; },
    getResults: function (kw) {
      const list = sortApps(apps.list.filter(function (app) { return matchesKeyword(app, (kw || "").trim().toLowerCase()); }), state.sort);
      return list;
    },
    byId: function (id) { return apps.byId[id]; },
    onQuery: function (v) { setKeyword(v); },
    onOpen: function (app, el, ev) { if (app.kind === "system") { ev.preventDefault(); openApp(app); } },
  });

  bindChrome();
  relocate();
  startClock();
  renderAll();

  // 侧栏分类里的高亮随状态刷新
  state.subscribe(function (changed) {
    if (changed.category) renderCategories();
  });
}

function start() {
  if (!window.Registry || !window.Registry.load) {
    document.body.insertAdjacentHTML("afterbegin",
      '<div class="ios-notice">' + icons.warning + "<span>注册表加载器缺失（assets/registry.js），请检查文件。</span></div>");
    return;
  }
  window.Registry.load().then(function (d) { boot(d || {}); }).catch(function (err) {
    document.body.insertAdjacentHTML("afterbegin",
      '<div class="ios-notice">' + icons.warning + "<span>首页初始化失败：" + escapeHtml(err && err.message ? err.message : String(err)) + "</span></div>");
  });
}

start();
