/* render.js — 资源管理器界面渲染（全部字符串模板 + escapeHtml，无框架）。 */

import { icons } from "../../../assets/home/icons.js";
import { escapeHtml, formatSize, relativeTime, formatDate } from "../../../assets/home/format.js";
import { appTitle, dirLabel, kindLabel, POSITIONS } from "./label.js";
import { nameOf, parentOf, siteUrl, SORTS } from "./api.js";

const el = {
  brand: document.getElementById("fm-brand-title"),
  title: document.getElementById("fm-title"),
  subtitle: document.getElementById("fm-subtitle"),
  navTitle: document.getElementById("fm-nav-title"),
  crumb: document.getElementById("fm-crumb"),
  positions: document.getElementById("fm-positions"),
  favorites: document.getElementById("fm-favorites"),
  favHint: document.getElementById("fm-fav-hint"),
  recent: document.getElementById("fm-recent"),
  list: document.getElementById("fm-list"),
  grid: document.getElementById("fm-grid"),
  empty: document.getElementById("fm-empty"),
  loading: document.getElementById("fm-loading"),
  count: document.getElementById("fm-count"),
  foot: document.getElementById("fm-foot"),
  tabs: document.getElementById("fm-tabbar"),
  search: document.getElementById("fm-search"),
  searchClear: document.getElementById("fm-search-clear"),
  btnUp: document.getElementById("fm-btn-up"),
  btnSort: document.getElementById("fm-btn-sort"),
  btnView: document.getElementById("fm-btn-view"),
  btnRefresh: document.getElementById("fm-btn-refresh"),
  btnTheme: document.getElementById("fm-btn-theme"),
  btnPositions: document.getElementById("fm-btn-positions"),
  home: document.getElementById("fm-home"),
  searchIcon: document.querySelector("#fm-searchbar .ios-search-icon"),
  noticeSlot: null,
};

function iconHTML(key) { return icons[key] || icons.file; }

/* ------------------------------ 静态图标 & 标题 ------------------------------ */

export function renderChrome(state) {
  el.home.innerHTML = icons.arrowLeft;
  el.btnPositions.innerHTML = icons.folder;
  el.btnSort.innerHTML = icons.sort;
  el.btnView.innerHTML = state.view === "list" ? icons.grid : icons.list;
  el.btnRefresh.innerHTML = icons.refresh;
  const themeKey = state.theme === "light" ? "sun" : state.theme === "dark" ? "moon" : "contrast";
  const themeName = ({ auto: "自动", light: "浅色", dark: "深色" })[state.theme] || "自动";
  el.btnTheme.innerHTML = iconHTML(themeKey);
  el.btnTheme.setAttribute("aria-label", "深浅色：" + themeName);
  el.btnTheme.title = "深浅色：" + themeName;
  el.searchIcon.innerHTML = icons.search;
  el.searchClear.innerHTML = icons.x;
  document.getElementById("fm-sidebar-close").innerHTML = icons.x;
  document.getElementById("fm-sidebar-close").hidden = !!state.wide;
  const tabIcons = { browse: "folder", recent: "clock", search: "search", home: "home" };
  el.tabs.querySelectorAll(".fm-tab").forEach(function (tab) {
    const key = tab.getAttribute("data-tab");
    const holder = tab.querySelector(".fm-tab-ico");
    if (holder) holder.innerHTML = iconHTML(tabIcons[key]);
    tab.classList.toggle("active", key === state.tab);
    if (tab.tagName === "BUTTON") tab.setAttribute("aria-pressed", key === state.tab ? "true" : "false");
  });

  const narrow = state.isNarrow;
  const title = appTitle(narrow);
  document.title = (state.path ? nameOf(state.path) + " · " : "") + title;
  el.brand.textContent = title;
  el.title.textContent = title;
  el.navTitle.textContent = state.path ? nameOf(state.path) : title;
  el.btnPositions.hidden = !!state.wide;
  el.subtitle.textContent = stateStatusText(state);
}

function stateStatusText(state) {
  if (state.loading) return "正在读取目录清单…";
  if (!state.ok) return "无法读取清单：" + state.reason;
  if (state.tab === "search") return "搜索「" + state.keyword + "」";
  if (state.tab === "recent") return "最近打开与最近更改";
  if (state.isFile && state.meta) {
    return kindLabel(state.meta) + " · " + (state.size != null ? formatSize(state.size) : "大小未知") + " · " + state.path;
  }
  const dir = state.dir;
  const label = dir === "" ? "站点根目录" : dir;
  return label + " · " + state.shown + " 项" + (state.total > state.shown ? "（共 " + state.total + "）" : "");
}

export function renderSubtitle(state) {
  el.subtitle.textContent = stateStatusText(state);
}

/* ------------------------------ 侧栏 ------------------------------ */

function sideRow(path, label, iconKey, active, isFile) {
  const href = isFile ? siteUrl(path) : "#/" + path.split("/").map(encodeURIComponent).join("/");
  return '<a class="ios-row' + (active ? " active" : "") + '" href="' + escapeHtml(href) +
    '" data-path="' + escapeHtml(path) + '"' + (isFile ? ' data-file="1"' : "") +
    (active ? ' aria-current="location"' : "") + '>' +
    '<span class="ios-row-icon" style="--g1:var(--g-file-1);--g2:var(--g-file-2)">' + iconHTML(iconKey) + "</span>" +
    '<span class="ios-row-main"><span class="ios-row-title ios-truncate">' + escapeHtml(label) + "</span></span>" +
    "</a>";
}

export function renderSidebar(state) {
  const rows = POSITIONS.map(function (pos) {
    const active = pos.file ? state.path === pos.path : state.dir === pos.path;
    return sideRow(pos.path, pos.label, pos.icon, active, !!pos.file);
  });
  el.positions.innerHTML = rows.join("");

  const favs = state.favorites;
  el.favorites.innerHTML = favs.length
    ? favs.map(function (p) {
        const e = state.index.get(p);
        const label = e ? e.name : nameOf(p);
        const key = e ? e.meta.icon : "file";
        return sideRow(p, label, key, state.path === p, true);
      }).join("")
    : '<div class="ios-cell fm-side-empty"><span class="fm-cell-label">暂无收藏</span></div>';
  el.favHint.hidden = favs.length > 0;

  const rec = state.recent;
  el.recent.innerHTML = rec.length
    ? rec.slice(0, 10).map(function (p) {
        const e = state.index.get(p);
        return sideRow(p, e ? e.name : nameOf(p), e ? e.meta.icon : "file", state.path === p, true);
      }).join("")
    : '<div class="ios-cell fm-side-empty"><span class="fm-cell-label">还没有打开过文件</span></div>';
}

/* ------------------------------ 面包屑 ------------------------------ */

export function renderCrumb(state) {
  const parts = state.dir === "" ? [] : state.dir.split("/");
  const html = ['<button class="fm-crumb-item" type="button" data-crumb="" >' + iconHTML("home") + "<span>站点根目录</span></button>"];
  let acc = "";
  parts.forEach(function (seg, i) {
    acc = acc ? acc + "/" + seg : seg;
    html.push('<span class="fm-crumb-sep" aria-hidden="true">' + iconHTML("chevron") + "</span>");
    html.push('<button class="fm-crumb-item' + (i === parts.length - 1 ? " current" : "") +
      '" type="button" data-crumb="' + escapeHtml(acc) + '"><span>' +
      escapeHtml(dirLabel(seg)) + "</span></button>");
  });
  el.crumb.innerHTML = html.join("");
  el.crumb.hidden = state.tab !== "browse";
  el.btnUp.disabled = state.dir === "" || state.tab !== "browse";
  el.btnUp.innerHTML = iconHTML("arrowLeft") + "<span>上级</span>";
}

/* ------------------------------ 行 / 图块 ------------------------------ */

function rowSub(e) {
  if (e.t === "d") {
    const n = e.n == null ? null : e.n;
    return n == null ? "文件夹" : n + " 项";
  }
  const size = e.s == null ? "大小未知" : formatSize(e.s);
  const time = relativeTime(e.m) || formatDate(e.m);
  return size + (time ? " · " + time : "");
}

export function entryRow(e, opts) {
  opts = opts || {};
  const isDir = e.t === "d";
  const href = isDir ? "#/" + e.p.split("/").map(encodeURIComponent).join("/") : siteUrl(e.p);
  const showPath = opts.showPath && e.dir;
  const fav = opts.favorites && opts.favorites.indexOf(e.p) >= 0;
  return '<a class="ios-row fm-row" href="' + escapeHtml(href) + '" data-path="' + escapeHtml(e.p) +
    '" data-dir="' + (isDir ? 1 : 0) + '" title="' + escapeHtml(e.p) + '">' +
    '<span class="ios-row-icon" style="--g1:' + e.meta.g1 + ";--g2:" + e.meta.g2 + '">' + iconHTML(e.meta.icon) + "</span>" +
    '<span class="ios-row-main">' +
    '<span class="ios-row-title' + (isDir ? "" : "") + '">' + escapeHtml(e.name) + (fav ? ' <span class="fm-star" aria-label="已收藏">★</span>' : "") + "</span>" +
    (showPath ? '<span class="ios-row-desc ios-truncate">' + escapeHtml(e.dir) + "</span>" : "") +
    (opts.showSub === false ? "" : '<span class="ios-row-sub">' + escapeHtml(rowSub(e)) + "</span>") +
    "</span>" +
    '<span class="ios-row-side">' +
    (e.s == null || isDir ? "" : '<span class="fm-size">' + escapeHtml(formatSize(e.s)) + "</span>") +
    '<span class="ios-chev">' + (isDir ? iconHTML("chevron") : iconHTML("open")) + "</span>" +
    "</span>" +
    "</a>";
}

export function entryTile(e, opts) {
  opts = opts || {};
  const isDir = e.t === "d";
  const href = isDir ? "#/" + e.p.split("/").map(encodeURIComponent).join("/") : siteUrl(e.p);
  return '<a class="ios-tile fm-tile" href="' + escapeHtml(href) + '" data-path="' + escapeHtml(e.p) +
    '" data-dir="' + (isDir ? 1 : 0) + '" title="' + escapeHtml(e.p) + '">' +
    '<span class="ios-tile-icon" style="--g1:' + e.meta.g1 + ";--g2:" + e.meta.g2 + '">' + iconHTML(e.meta.icon) + "</span>" +
    '<span class="ios-tile-label">' + escapeHtml(e.name) + "</span>" +
    "</a>";
}

function section(title, entries, opts, emptyText) {
  if (!entries.length) return emptyText ? '<div class="ios-section"><div class="ios-list">' + emptyText + "</div></div>" : "";
  return '<div class="ios-section">' +
    '<div class="ios-section-header"><span>' + escapeHtml(title) + "</span><span>" + entries.length + "</span></div>" +
    '<div class="ios-list">' + entries.map(function (e) { return entryRow(e, opts); }).join("") + "</div>" +
    "</div>";
}

/* ------------------------------ 主内容 ------------------------------ */

export function renderMain(state) {
  const opts = { showPath: state.tab === "search", favorites: state.favorites };
  const groups = groupSections(state);
  el.list.innerHTML = groups.length
    ? groups.map(function (g) { return section(g.title, g.entries, opts, ""); }).join("")
    : "";
  el.grid.innerHTML = state.entries.map(function (e) { return entryTile(e, opts); }).join("");

  const isList = state.view === "list";
  el.list.classList.toggle("hidden", !isList);
  el.grid.classList.toggle("hidden", isList);
  el.loading.classList.toggle("hidden", !state.loading);

  const empty = !state.loading && !state.entries.length;
  el.empty.classList.toggle("hidden", !empty);
  if (empty) el.empty.innerHTML = emptyHTML(state);

  renderSubtitle(state);
  el.count.textContent = state.countText;
}

function groupSections(state) {
  if (state.tab === "recent") {
    const opened = state.openedEntries || [];
    const changed = state.entries;
    const out = [];
    if (opened.length) out.push({ title: "最近打开", entries: opened });
    out.push({ title: "最近更改", entries: changed });
    return out;
  }
  const dirs = state.entries.filter(function (e) { return e.t === "d"; });
  const files = state.entries.filter(function (e) { return e.t === "f"; });
  if (state.tab === "search") {
    const out = [];
    if (dirs.length) out.push({ title: "文件夹", entries: dirs });
    if (files.length) out.push({ title: "文件", entries: files });
    return out;
  }
  const title = state.dir === "" ? "站点根目录" : dirLabel(nameOf(state.dir));
  const out = [{ title: title, entries: state.entries }];
  return out;
}

function emptyHTML(state) {
  if (state.tab === "search") {
    return '<div class="ios-empty-icon" aria-hidden="true">🔍</div><p>没有匹配「' +
      escapeHtml(state.keyword) + "」的文件或文件夹。</p>" +
      '<p class="ios-caption">搜索范围：整站清单内所有可见文件（已跳过 .git、node_modules 等）。</p>';
  }
  if (state.tab === "recent") {
    return '<div class="ios-empty-icon" aria-hidden="true">🕒</div><p>还没有记录。</p>' +
      '<p class="ios-caption">打开过文件后，这里会列出最近打开与最近更改。</p>';
  }
  return '<div class="ios-empty-icon" aria-hidden="true">📂</div><p>这个文件夹是空的。</p>' +
    '<p class="ios-caption">清单里已跳过点文件、node_modules 与构建产物。</p>';
}

/* ------------------------------ 提示条 ------------------------------ */

export function setNoticeSlot(node) {
  el.noticeSlot = node;
}

export function renderNotices(state) {
  if (!el.noticeSlot) return;
  const items = [];
  if (state.notice.fallback) {
    items.push(notionHTML("warning",
      "读不到 <code>data/files.json</code>（" + escapeHtml(state.reason || "文件缺失") +
      "），已按注册表回退：只显示页面目录，看不到全部源码文件。<br>本地执行 " +
      "<code>node tools/build-fs-manifest.js</code> 生成清单后刷新。", "fallback"));
  }
  if (state.notice.stale) {
    items.push(notionHTML("info",
      "目录清单已 " + state.notice.stale + " 天未更新（生成于 " + escapeHtml(state.generated || "未知") +
      "）。本地执行 <code>node tools/build-fs-manifest.js</code> 可刷新。", "stale"));
  }
  if (state.notice.truncated) {
    items.push(notionHTML("info", "目录清单被截断（条目 / 体积上限），只显示前一部分文件。", "truncated"));
  }
  el.noticeSlot.innerHTML = items.join("");
}

function notionHTML(tone, text, id) {
  return '<div class="ios-notice' + (tone === "info" ? " ios-notice-info" : "") + '" data-notice="' + id + '">' +
    iconHTML(tone === "warning" ? "warning" : "info") +
    "<span>" + text + "</span>" +
    '<button class="ios-icon-btn fm-notice-close" type="button" data-dismiss="' + id + '" aria-label="关闭提示">' + icons.x + "</button></div>";
}

export function renderFoot(state) {
  const bits = [];
  bits.push("清单条目 " + state.totalEntries);
  if (state.generated) bits.push("生成于 " + escapeHtml(state.generated));
  if (state.fallback) bits.push("回退模式（注册表）");
  bits.push('排序：' + escapeHtml(SORTS[state.sort] || state.sort));
  el.foot.innerHTML = '<span class="ios-caption">' + bits.join(" · ") + "</span>" +
    ' <a class="ios-caption" href="../file-manager/README.md">页面说明</a>' +
    ' <a class="ios-caption" href="/">返回门户</a>';
}

function emptyTextCell(text) { return '<div class="ios-cell fm-side-empty"><span class="fm-cell-label">' + escapeHtml(text) + "</span></div>"; }

export { el, iconHTML, emptyTextCell, parentOf };
