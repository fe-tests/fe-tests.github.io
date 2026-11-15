/* listview.js — iOS 分组列表渲染（列表视图与 Spotlight 结果共用）。 */

import { rowHTML, labelOf } from "./apps.js";
import { escapeHtml } from "./format.js";

/** 按分类分组，保持传入顺序（= 当前排序结果顺序） */
export function groupByCategory(apps) {
  const order = [];
  const map = new Map();
  apps.forEach(function (app) {
    const key = app.categoryName || "未分类";
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(app);
  });
  return order.map(function (key) { return { name: key, apps: map.get(key) }; });
}

/** 分组列表：一个分类一个 section（列表视图） */
export function renderListView(root, apps, opts) {
  opts = opts || {};
  const groups = opts.grouped === false ? [{ name: "", apps: apps }] : groupByCategory(apps);
  root.innerHTML = groups.map(function (g) {
    const rows = g.apps.map(function (app) {
      return rowHTML(app, {
        isMobile: opts.isMobile,
        showDesc: true,
        showDate: true,
        showTags: opts.showTags !== false,
      });
    }).join("");
    const header = g.name
      ? '<div class="ios-section-header"><span>' + escapeHtml(g.name) + "</span><span>" + g.apps.length + "</span></div>"
      : "";
    return '<div class="ios-section">' + header + '<div class="ios-list">' + rows + "</div></div>";
  }).join("");
}

/** 扁平列表（Spotlight 结果） */
export function renderFlatList(root, apps, opts) {
  opts = opts || {};
  root.innerHTML = apps.map(function (app) {
    return rowHTML(app, {
      isMobile: opts.isMobile,
      showDesc: opts.showDesc !== false,
      showDate: !!opts.showDate,
      showTags: !!opts.showTags,
      sub: opts.sub,
    });
  }).join("");
}

/** 侧栏 App 行（系统 App，非链接跳 #） */
export function navRowHTML(app, opts) {
  opts = opts || {};
  const label = labelOf(app, opts.isMobile);
  return '<a class="ios-row" href="' + escapeHtml(app.url) + '" data-app="' + escapeHtml(app.id) + '">' +
    '<span class="ios-row-icon" style="--g1:' + (app.g1 || "var(--g-default-1)") + ";--g2:" + (app.g2 || "var(--g-default-2)") + '" aria-hidden="true">' +
    (app.iconKey ? "" : escapeHtml(app.emoji || "📄")) + "</span>" +
    '<span class="ios-row-main"><span class="ios-row-title">' + escapeHtml(label) + "</span></span>" +
    (opts.showChevron !== false ? '<span class="ios-chev"></span>' : "") +
    "</a>";
}
