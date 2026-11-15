/* settings.js — 首页「设置」浮层：外观 / 视图 / 图标大小 / 每页数量 / 排序。 */

import { openSheet, openActionSheet, showToast } from "./sheets.js";
import { SORTS } from "./state.js";
import { escapeHtml } from "./format.js";
import { icons } from "./icons.js";

const THEME_OPTS = [
  { value: "auto", label: "自动" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];
const VIEW_OPTS = [
  { value: "card", label: "图标" },
  { value: "list", label: "列表" },
];
const SIZE_OPTS = [
  { value: "standard", label: "标准" },
  { value: "big", label: "大" },
];
const PAGE_OPTS = [
  { value: "24", label: "24" },
  { value: "48", label: "48" },
  { value: "0", label: "全部" },
];
const DOCK_OPTS = [
  { value: "show", label: "展开" },
  { value: "hide", label: "收起" },
];

function segHTML(name, opts, active) {
  return '<div class="ios-segmented" data-seg="' + name + '">' +
    opts.map(function (o) {
      return '<button class="ios-seg-btn' + (String(o.value) === String(active) ? " active" : "") +
        '" type="button" data-value="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + "</button>";
    }).join("") + "</div>";
}

function cell(label, control) {
  return '<div class="ios-cell ios-settings-row"><span class="ios-cell-label">' + escapeHtml(label) + "</span>" + control + "</div>";
}

export function openSettings(opts) {
  function s() { return opts.getSettings(); }

  function bodyHTML() {
    const st = opts.getState();
    const perPage = st.perPage > 0 ? String(st.perPage) : String(s().perPage);
    return '<div class="ios-settings-body">' +
      '<div class="ios-section"><div class="ios-section-header">外观</div><div class="ios-list">' +
      cell("主题（深浅色）", segHTML("theme", THEME_OPTS, s().theme)) +
      "</div></div>" +
      '<div class="ios-section"><div class="ios-section-header">主屏与列表</div><div class="ios-list">' +
      cell("默认视图", segHTML("view", VIEW_OPTS, st.view)) +
      cell("图标大小", segHTML("iconSize", SIZE_OPTS, s().iconSize)) +
      cell("每页图标数", segHTML("perPage", PAGE_OPTS, perPage)) +
      cell("底部 Dock 常驻栏", segHTML("dock", DOCK_OPTS, s().dock === "hide" ? "hide" : "show")) +
      '<button class="ios-cell" type="button" data-sort-row><span class="ios-cell-label">排序</span>' +
      '<span class="ios-cell-value">' + escapeHtml(SORTS[st.sort] || st.sort) + "</span></button>" +
      "</div></div>" +
      '<div class="ios-section"><div class="ios-section-header">关于</div><div class="ios-list">' +
      '<a class="ios-row" href="' + escapeHtml(opts.registryUrl || "registry.json") + '" target="_blank" rel="noopener">' +
      '<span class="ios-row-main"><span class="ios-row-title">数据源 registry.json</span>' +
      '<span class="ios-row-desc">首页只读注册表，不硬编码任何页面。</span></span>' +
      '<span class="ios-row-side">' + escapeHtml(opts.count + " 个页面") + "</span></a>" +
      '<div class="ios-cell"><span class="ios-cell-label">已注册页面</span>' +
      '<span class="ios-cell-value">' + escapeHtml(opts.count) + "</span></div>" +
      "</div></div>" +
      '<div class="ios-section"><div class="ios-list">' +
      '<button class="ios-cell" type="button" data-reset><span class="ios-cell-label">恢复默认设置</span>' +
      '<span class="ios-cell-value">' + icons.refresh + "</span></button>" +
      "</div></div>" +
      '<p class="ios-about">设置保存在本机 localStorage（<code>iosHome.settings.v1</code>），只影响这台设备；' +
      "Dock 收藏同理（<code>iosHome.dockExtras.v1</code>）。</p>" +
      "</div>";
  }

  const sheet = openSheet({
    title: "设置",
    label: "首页设置",
    bodyHTML: "",
    footerHTML: '<button class="ios-btn" type="button" data-close>完成</button>',
  });

  function redraw() { sheet.body.innerHTML = bodyHTML(); }
  redraw();

  sheet.body.addEventListener("click", function (e) {
    const segBtn = e.target.closest(".ios-seg-btn");
    if (segBtn) {
      const seg = segBtn.closest("[data-seg]");
      const name = seg.getAttribute("data-seg");
      const value = segBtn.getAttribute("data-value");
      seg.querySelectorAll(".ios-seg-btn").forEach(function (b) {
        b.classList.toggle("active", b === segBtn);
      });
      if (name === "theme") {
        const hit = THEME_OPTS.filter(function (o) { return o.value === value; })[0];
        opts.onTheme(value);
        showToast("主题：" + (hit ? hit.label : value));
      }
      if (name === "view") opts.onView(value);
      if (name === "iconSize") opts.onIconSize(value);
      if (name === "perPage") opts.onPerPage(value);
      if (name === "dock") {
        opts.onDock(value === "show");
        showToast(value === "show" ? "Dock 已展开" : "Dock 已收起（点细棒展开）");
      }
      return;
    }
    if (e.target.closest("[data-sort-row]")) {
      const st = opts.getState();
      openActionSheet({
        title: "排序方式",
        items: Object.keys(SORTS).map(function (k) {
          return { label: SORTS[k], value: k, checked: st.sort === k };
        }),
      }).then(function (value) {
        if (value) opts.onSort(value);
      });
      return;
    }
    if (e.target.closest("[data-reset]")) {
      opts.onReset();
      redraw();
      showToast("已恢复默认设置", "check");
    }
  });

  if (opts.onOpenSettings) opts.onOpenSettings(sheet);
  return sheet;
}
