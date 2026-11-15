/* main.js — 资源管理器（移动端「文件管理」）装配：清单加载 → 索引 → 渲染 → 交互。
 * 只读：本文件不做任何写操作（站点是纯静态托管，服务器只允许 GET/HEAD）。 */

import { init as initSheets, showToast } from "../../../assets/home/sheets.js";
import { appTitle } from "./label.js";
import {
  loadManifest, treeFromRegistry, buildIndex, sortEntries, searchAll, recentFiles,
  ageDays, parentOf, nameOf, SORTS, SORT_DEFAULT,
} from "./api.js";
import {
  createState, loadPrefs, savePrefs, loadRecent, pushRecent, clearRecent,
  loadFavorites, toggleFavorite, isFavorite, readThemeMode, saveThemeMode,
} from "./state.js";
import { renderChrome, renderSidebar, renderCrumb, renderMain, renderNotices, renderFoot, setNoticeSlot } from "./render.js";
import { bindAll } from "./input.js";
import { openPreview } from "./preview.js";

const mqNarrow = window.matchMedia("(max-width: 767px)");
const STALE_DAYS = 7;
const DIR_CAP = 500;

const emptyIndex = {
  byPath: new Map(), children: new Map(), files: [], dirs: [],
  get: function () { return undefined; },
  childrenOf: function () { return []; },
};

const state = createState({
  index: emptyIndex,
  entries: [],
  openedEntries: [],
  totalEntries: 0,
  total: 0,
  shown: 0,
  countText: "",
  path: "",
  dir: "",
  meta: null,
  keyword: "",
  loading: true,
  ok: false,
  reason: "",
  fallback: false,
  generated: "",
  truncated: false,
  notice: { fallback: false, stale: false, truncated: false },
  favorites: [],
  recent: [],
  theme: "auto",
  isNarrow: mqNarrow.matches,
  wide: window.innerWidth >= 1024,
  isFile: false,
  size: null,
  view: "list",
  sort: SORT_DEFAULT,
  groupDirs: true,
  tab: "browse",
  dismissed: {},
});

/** 路径消毒：去掉前导斜杠 / 归一 ./.. 越界 */
function normalizePath(p) {
  let s = String(p == null ? "" : p).trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  s = s.replace(/^#\/?/, "");
  const out = [];
  s.split("/").forEach(function (seg) {
    if (!seg || seg === ".") return;
    if (seg === "..") { out.pop(); return; }
    out.push(seg);
  });
  return out.join("/");
}

function hashFor(path) {
  if (!path) return "#/";
  return "#/" + path.split("/").map(function (s) { return encodeURIComponent(s); }).join("/");
}

function parseHash() {
  const raw = String(location.hash || "").replace(/^#\/?/, "");
  try { return decodeURIComponent(raw); } catch (e) { return raw; }
}

/* ------------------------------ 计算 + 渲染 ------------------------------ */

function compute() {
  const idx = state.index;
  let entries = [], total = 0, countText = "", opened = [];

  if (state.tab === "search") {
    const found = searchAll(idx, state.keyword, 400);
    entries = sortEntries(found, state.sort, state.groupDirs);
    total = entries.length;
    countText = total ? total + " 条结果" : "无结果";
  } else if (state.tab === "recent") {
    opened = state.recent.map(function (p) { return idx.get(p); }).filter(Boolean);
    entries = recentFiles(idx, 60);
    total = entries.length;
    countText = "最近更改 " + entries.length + " 项" + (opened.length ? " · 最近打开 " + opened.length + " 项" : "");
  } else {
    const list = sortEntries(idx.childrenOf(state.dir), state.sort, state.groupDirs);
    total = list.length;
    entries = list.slice(0, DIR_CAP);
    countText = total ? (total > DIR_CAP ? "显示前 " + DIR_CAP + " / " + total : total + " 项") : "空目录";
  }

  state.entries = entries;
  state.openedEntries = opened;
  state.total = total;
  state.shown = entries.length;
  state.countText = countText;
}

function render() {
  compute();
  renderChrome(state);
  renderSidebar(state);
  renderCrumb(state);
  renderMain(state);
  renderNotices(state);
  renderFoot(state);
  document.getElementById("fm-search").value = state.keyword;
  document.getElementById("fm-search-clear").hidden = !state.keyword;
}

/* ------------------------------ 侧栏开合 ------------------------------ */

function openSidebar() {
  if (!state.isNarrow) return;
  document.body.classList.add("fm-sidebar-open");
  document.getElementById("fm-scrim").hidden = false;
}
function closeSidebar() {
  document.body.classList.remove("fm-sidebar-open");
  document.getElementById("fm-scrim").hidden = true;
}

/* ------------------------------ 动作 ------------------------------ */

function navigate(rawPath, opts) {
  opts = opts || {};
  const path = normalizePath(rawPath);
  const entry = state.index.get(path);
  let dir = path;
  let target = null;

  if (path === "") {
    dir = "";
  } else if (entry) {
    target = entry;
    dir = entry.t === "d" ? entry.p : parentOf(entry.p);
  } else {
    // 路径不存在：退到最近的存在的祖先目录
    let up = parentOf(path);
    while (up && !state.index.get(up)) up = parentOf(up);
    const hit = state.index.get(up);
    dir = hit ? (hit.t === "d" ? hit.p : parentOf(hit.p)) : "";
    showToast("清单里没有「" + path + "」" + (dir ? "，已回到 " + dir : ""));
  }

  if (state.dir === dir && state.tab === "browse" && opts.fromRoute) {
    render();
    return;
  }
  state.path = target ? target.p : (dir || "");
  state.isFile = !!(target && target.t === "f");
  state.meta = state.isFile ? target.meta : null;
  state.size = state.isFile ? target.s : null;
  state.dir = dir;
  state.tab = "browse";
  if (state.keyword) { state.keyword = ""; }
  closeSidebar();
  if (!opts.fromRoute) {
    try { history.pushState({ path: dir }, "", hashFor(dir)); } catch (e) { location.hash = hashFor(dir).slice(1); }
  }
  render();
  document.getElementById("fm-main").scrollTo ? document.getElementById("fm-main").scrollTo(0, 0) : (window.scrollTo(0, 0));
}

function openEntry(entry) {
  if (!entry) return;
  if (entry.t === "d") { navigate(entry.p); return; }
  openPreview({
    entry: entry,
    state: state,
    isFav: isFavorite,
    onOpened: function (p) {
      state.recent = pushRecent(p);
      renderSidebar(state);
      renderFoot(state);
    },
    onNavigate: navigate,
    onFavToggle: function (p) {
      const list = toggleFavorite(p);
      state.favorites = list;
      renderSidebar(state);
      return isFavorite(p);
    },
  });
}

const actions = {
  navigate: navigate,
  openEntry: openEntry,
  goUp: function () {
    if (state.tab !== "browse") { actions.setTab("browse"); return; }
    if (!state.dir) { showToast("已经在站点根目录"); return; }
    navigate(parentOf(state.dir));
  },
  setTab: function (name) {
    state.tab = name;
    if (name === "search") setTimeout(function () { document.getElementById("fm-search").focus(); }, 60);
    if (name === "browse") state.keyword = "";
    render();
  },
  setKeyword: function (v) {
    state.keyword = String(v || "");
    state.tab = state.keyword ? "search" : "browse";
    render();
  },
  setSort: function (v) {
    if (!SORTS[v]) return;
    const prefs = savePrefs({ sort: v });
    state.sort = prefs.sort;
    showToast("排序：" + SORTS[v]);
    render();
  },
  toggleView: function () {
    const next = state.view === "list" ? "grid" : "list";
    const prefs = savePrefs({ view: next });
    state.view = prefs.view;
    showToast(state.view === "list" ? "列表视图" : "图标视图");
    render();
  },
  toggleFavorite: function (p) {
    state.favorites = toggleFavorite(p);
    renderSidebar(state);
    return isFavorite(p);
  },
  cycleTheme: function () {
    const order = ["auto", "light", "dark"];
    const next = order[(order.indexOf(state.theme) + 1) % order.length];
    state.theme = saveThemeMode(next);
    document.documentElement.dataset.theme = state.theme;
    showToast("深浅色：" + ({ auto: "自动", light: "浅色", dark: "深色" })[state.theme]);
    render();
  },
  refresh: function () {
    state.loading = true;
    render();
    load(true);
  },
  openSidebar: openSidebar,
  closeSidebar: closeSidebar,
  focusSearch: function () {
    const input = document.getElementById("fm-search");
    if (state.tab !== "search") { state.tab = "search"; render(); }
    input.focus();
    input.select();
  },
  dismissNotice: function (id) {
    state.dismissed[id] = true;
    state.notice[id] = false;
    renderNotices(state);
  },
  onResize: function () {
    const narrow = mqNarrow.matches;
    const wide = window.innerWidth >= 1024;
    if (narrow === state.isNarrow && wide === state.wide) return;
    state.isNarrow = narrow;
    state.wide = wide;
    if (!narrow) closeSidebar();
    document.title = (state.path ? nameOf(state.path) + " · " : "") + appTitle(narrow);
    render();
  },
};

/* ------------------------------ 数据加载 ------------------------------ */

function applyMeta(data, fallback) {
  state.generated = String(data.generated || "");
  state.totalEntries = Number(data.count || (data.entries || []).length) || (data.entries || []).length;
  state.fallback = !!fallback;
  state.truncated = !!data.truncated;
  state.ok = true;
  state.reason = "";
  state.index = buildIndex(data.entries);
  state.notice.truncated = state.truncated && !state.dismissed.truncated;
  const age = fallback ? -1 : ageDays(state.generated);
  state.notice.stale = age >= STALE_DAYS && !state.dismissed.stale;
  state.notice.fallback = !!fallback && !state.dismissed.fallback;
}

function load(replacing) {
  state.loading = true;
  render();
  loadManifest().then(function (res) {
    if (res.ok) {
      applyMeta(res.data, false);
      return res.data;
    }
    state.reason = res.reason;
    return treeFromRegistry().then(function (data) {
      if (data) { applyMeta(data, true); return data; }
      state.ok = false;
      state.loading = false;
      state.notice.fallback = !state.dismissed.fallback;
      state.reason = res.reason;
      return null;
    });
  }).then(function () {
    state.loading = false;
    const initial = normalizePath(parseHash());
    navigate(initial, { fromRoute: true });
    try { history.replaceState({ path: state.dir }, "", hashFor(state.dir)); } catch (e) { /* 忽略 */ }
    if (replacing) showToast("已刷新目录清单", "check");
  }).catch(function (e) {
    state.loading = false;
    state.ok = false;
    state.reason = (e && e.message) ? e.message : String(e);
    render();
  });
}

/* ------------------------------ 启动 ------------------------------ */

function boot() {
  initSheets(document.getElementById("fm-sheet-host"), document.getElementById("fm-toast"));
  setNoticeSlot(document.getElementById("fm-notices"));

  const prefs = loadPrefs();
  state.view = prefs.view === "grid" ? "grid" : "list";
  state.sort = SORTS[prefs.sort] ? prefs.sort : SORT_DEFAULT;
  state.groupDirs = prefs.groupDirs !== false;
  state.tab = "browse";
  state.theme = readThemeMode();
  document.documentElement.dataset.theme = state.theme;
  state.favorites = loadFavorites();
  state.recent = loadRecent();

  bindAll({ state: state, actions: actions });
  mqNarrow.addEventListener("change", function (e) { state.isNarrow = e.matches; actions.onResize(); });
  window.addEventListener("beforeunload", function () { /* 只读页面无需保存 */ });

  render();
  load(false);
}

boot();
