/* apps.js — App 模型（注册表页面 + 系统 App）、命名映射、图标与行/块模板。
 * 约定：PC（≥768px）显示「资源管理器」，移动端（<768px）显示「文件管理」。
 * 系统 App 与移动端别名写在代码里，registry.json 不新增字段（见根 README）。 */

import { icons } from "./icons.js";
import { escapeHtml, formatDate, statusLabel, statusClass } from "./format.js";

export const FILE_MANAGER_URL = "examples/file-manager/index.html";
export const PC_LABEL = "资源管理器";
export const MOBILE_LABEL = "文件管理";

/** 移动端改名映射：url → 移动端显示名（注册表 title 为 PC 名）。 */
export const MOBILE_ALIASES = {
  [FILE_MANAGER_URL]: MOBILE_LABEL,
};

/** 首页内置的系统 App（资源管理器是真实页面，设置是首页浮层）。 */
export const SYSTEM_APPS = [
  {
    id: "sys-files",
    kind: "system",
    pageKind: "files",
    title: PC_LABEL,
    mobileTitle: MOBILE_LABEL,
    url: FILE_MANAGER_URL,
    iconKey: "folder",
    g1: "var(--g-file-1)",
    g2: "var(--g-file-2)",
    description: "浏览站点目录树，预览源码、文档与资源文件。",
    categoryName: "工具",
    status: "stable",
    pinned: true,
  },
  {
    id: "sys-settings",
    kind: "system",
    pageKind: "settings",
    title: "设置",
    mobileTitle: "设置",
    url: "#settings",
    iconKey: "gear2",
    g1: "var(--g-settings-1)",
    g2: "var(--g-settings-2)",
    description: "外观（自动/浅色/深色）、视图、图标大小与每页数量。",
    categoryName: "系统",
    status: "stable",
  },
];

/** 分类 → 图标渐变（CSS 变量） */
export function gradFor(category) {
  const key = /^(model|tool|experiment|game)$/.test(category || "") ? category : "default";
  return { g1: "var(--g-" + key + "-1)", g2: "var(--g-" + key + "-2)" };
}

/** 注册表页面 → App 模型 */
export function appFromPage(p) {
  const url = String(p.url || "").replace(/^\.\//, "");
  const grad = gradFor(p.category);
  return {
    kind: "page",
    id: url,
    url: url,
    title: p.title || "未命名页面",
    mobileTitle: MOBILE_ALIASES[url] || "",
    description: p.description || "",
    category: p.category || "",
    categoryName: p.categoryName || "未分类",
    emoji: p.emoji || "📄",
    tags: Array.isArray(p.tags) ? p.tags : [],
    status: p.status || "stable",
    pinned: p.pinned === true,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    g1: grad.g1,
    g2: grad.g2,
  };
}

/** 注册表页面列表 → App 列表 */
export function appsFromPages(pages) {
  return (pages || []).map(appFromPage);
}

export function systemApp(id) {
  return SYSTEM_APPS.filter(function (a) { return a.id === id; })[0] || null;
}

/** 当前视口下的显示名（移动端改名生效） */
export function labelOf(app, isMobile) {
  if (!app) return "";
  if (isMobile && app.mobileTitle) return app.mobileTitle;
  return app.title || "";
}

/** 图标渐变内联样式 */
export function iconStyle(app) {
  return "--g1:" + (app.g1 || "var(--g-default-1)") + ";--g2:" + (app.g2 || "var(--g-default-2)");
}

/** 图标内容：SVG（系统 App）或 emoji */
export function iconMarkup(app) {
  if (app.iconKey && icons[app.iconKey]) return icons[app.iconKey];
  return escapeHtml(app.emoji || "📄");
}

/** 无障碍标签 */
export function ariaLabelOf(app, isMobile) {
  var parts = [labelOf(app, isMobile)];
  if (app.categoryName) parts.push(app.categoryName);
  if (app.status) parts.push(statusLabel(app.status));
  if (app.pinned) parts.push("已置顶");
  return parts.join("，");
}

/** 图标块（Springboard 图块）HTML */
export function tileHTML(app, opts) {
  opts = opts || {};
  const isMobile = !!opts.isMobile;
  const label = labelOf(app, isMobile);
  const showStatus = opts.showStatus !== false && !!app.status;
  const cls = "ios-tile" + (opts.extraClass ? " " + opts.extraClass : "");
  return (
    '<a class="' + cls + '" href="' + escapeHtml(app.url) + '" data-app="' + escapeHtml(app.id) +
    '" data-index="' + (opts.index == null ? "" : opts.index) + '"' +
    ' title="' + escapeHtml(app.description || label) + '"' +
    ' aria-label="' + escapeHtml(ariaLabelOf(app, isMobile)) + '">' +
    (showStatus ? '<span class="ios-tile-badge ' + statusClass(app.status) + '" aria-hidden="true"></span>' : "") +
    (app.pinned ? '<span class="ios-tile-pin" aria-hidden="true">📌</span>' : "") +
    '<span class="ios-tile-icon" style="' + iconStyle(app) + '" aria-hidden="true">' + iconMarkup(app) + "</span>" +
    '<span class="ios-tile-label">' + escapeHtml(label) + "</span>" +
    "</a>"
  );
}

/** 列表行 HTML（分组列表 / Spotlight 共用） */
export function rowHTML(app, opts) {
  opts = opts || {};
  const isMobile = !!opts.isMobile;
  const label = labelOf(app, isMobile);
  const showDesc = opts.showDesc !== false && app.description;
  const showDate = !!opts.showDate && app.updatedAt;
  const showTags = !!opts.showTags && app.tags && app.tags.length;
  const sub = opts.sub || "";
  return (
    '<a class="ios-row" href="' + escapeHtml(app.url) + '" data-app="' + escapeHtml(app.id) + '"' +
    ' title="' + escapeHtml(app.description || label) + '">' +
    '<span class="ios-row-icon" style="' + iconStyle(app) + '" aria-hidden="true">' + iconMarkup(app) + "</span>" +
    '<span class="ios-row-main">' +
    '<span class="ios-row-title">' + escapeHtml(label) + (app.pinned ? " 📌" : "") + "</span>" +
    (showDesc ? '<span class="ios-row-desc">' + escapeHtml(app.description) + "</span>" : "") +
    (sub ? '<span class="ios-row-desc">' + escapeHtml(sub) + "</span>" : "") +
    (showTags
      ? '<span class="ios-row-tags">' + app.tags.slice(0, 5).map(function (t) {
          return '<span class="ios-tag">#' + escapeHtml(t) + "</span>";
        }).join("") + "</span>"
      : "") +
    "</span>" +
    '<span class="ios-row-side">' +
    (showDate ? '<span class="ios-row-date">' + escapeHtml(formatDate(app.updatedAt).slice(0, 10)) + "</span>" : "") +
    (app.status ? '<span class="ios-status-dot ' + statusClass(app.status) + '" title="' + escapeHtml(statusLabel(app.status)) + '"></span>' : "") +
    '<span class="ios-chev">' + icons.chevron + "</span>" +
    "</span>" +
    "</a>"
  );
}
