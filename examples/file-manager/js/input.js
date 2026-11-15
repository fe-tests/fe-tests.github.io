/* input.js — 交互绑定：侧栏 / 面包屑 / 列表 / 工具栏 / 搜索 / 标签栏 / 路由 / 键盘。 */

import { openActionSheet, openContextMenu, showToast, closeTop } from "../../../assets/home/sheets.js";
import { icons } from "../../../assets/home/icons.js";
import { debounce, copyText, absoluteUrl } from "../../../assets/home/format.js";
import { SORTS, siteUrl, parentOf } from "./api.js";
import { el } from "./render.js";
import { isFavorite } from "./state.js";

/** 长按（pointerdown 计时）+ 右键，统一给 [data-path] 元素挂上下文菜单 */
function attachHold(root, resolve) {
  let timer = 0, suppress = false, sx = 0, sy = 0;
  function nodeOf(target) { return target.closest ? target.closest("[data-path]") : null; }
  root.addEventListener("pointerdown", function (e) {
    const node = nodeOf(e.target);
    if (!node) return;
    sx = e.clientX; sy = e.clientY; suppress = false;
    clearTimeout(timer);
    timer = setTimeout(function () {
      suppress = true;
      const r = node.getBoundingClientRect();
      resolve(node, r.left + r.width / 2, r.top + r.height / 2);
    }, 480);
  }, { passive: true });
  root.addEventListener("pointermove", function (e) {
    if (!timer) return;
    if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) { clearTimeout(timer); timer = 0; }
  }, { passive: true });
  root.addEventListener("pointerup", function () {
    setTimeout(function () { suppress = false; }, 700);
    clearTimeout(timer); timer = 0;
  }, { passive: true });
  root.addEventListener("pointercancel", function () { clearTimeout(timer); timer = 0; }, { passive: true });
  root.addEventListener("scroll", function () { clearTimeout(timer); timer = 0; }, { passive: true });
  root.addEventListener("click", function (e) {
    if (suppress && nodeOf(e.target)) { e.preventDefault(); suppress = false; }
  }, true);
  root.addEventListener("contextmenu", function (e) {
    const node = nodeOf(e.target);
    if (!node) return;
    e.preventDefault();
    resolve(node, e.clientX, e.clientY);
  });
}

function entryMenu(ctx, entry, x, y) {
  const isDir = entry.t === "d";
  const fav = isFavorite(entry.p);
  const items = isDir
    ? [
        { label: "打开", value: "open", icon: "folder" },
        { label: "复制路径", value: "copy", icon: "copy" },
        { sep: true },
        { label: fav ? "取消收藏" : "加入收藏", value: "fav", icon: fav ? "x" : "star" },
      ]
    : [
        { label: "预览", value: "preview", icon: "eye" },
        { label: "在新窗口打开", value: "newwin", icon: "open" },
        { label: "下载", value: "download", icon: "download" },
        { label: "复制路径", value: "copy", icon: "copy" },
        { sep: true },
        { label: fav ? "取消收藏" : "加入收藏", value: "fav", icon: fav ? "x" : "star" },
        { label: "打开所在目录", value: "dir", icon: "folderOpen" },
      ];
  openContextMenu({
    x: x, y: y,
    label: entry.name + " 操作",
    items: items,
    onSelect: function (value) {
      const url = siteUrl(entry.p);
      if (value === "open") { ctx.actions.navigate(entry.p); return; }
      if (value === "preview") { ctx.actions.openEntry(entry); return; }
      if (value === "newwin") {
        const w = window.open(url, "_blank", "noopener");
        if (!w) showToast("弹窗被拦截，请允许打开新窗口");
        return;
      }
      if (value === "download") {
        const a = document.createElement("a");
        a.href = url; a.download = entry.name; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
        showToast("开始下载：" + entry.name);
        return;
      }
      if (value === "copy") {
        copyText(absoluteUrl(url)).then(function (ok) {
          showToast(ok ? "已复制路径" : "复制失败，请手动复制", ok ? "check" : "warning");
        });
        return;
      }
      if (value === "fav") {
        const on = ctx.actions.toggleFavorite(entry.p);
        showToast(on ? "已加入收藏" : "已取消收藏", on ? "check" : "x");
        return;
      }
      if (value === "dir") ctx.actions.navigate(parentOf(entry.p));
    },
  });
}

export function bindAll(ctx) {
  const { state, actions } = ctx;
  const sidebar = document.getElementById("fm-sidebar");
  const main = document.getElementById("fm-main");

  /* ---------------- 侧栏：位置 / 收藏 / 最近 ---------------- */
  sidebar.addEventListener("click", function (e) {
    const a = e.target.closest("[data-path]");
    if (!a) return;
    const path = a.getAttribute("data-path") || "";
    const isFile = a.getAttribute("data-file") === "1";
    if (!isFile) {
      e.preventDefault();
      actions.navigate(path);
      actions.closeSidebar();
      return;
    }
    const entry = state.index.get(path);
    e.preventDefault();
    if (!entry) { showToast("清单里没有这个路径"); return; }
    actions.openEntry(entry);
    actions.closeSidebar();
  });
  attachHold(sidebar, function (node, x, y) {
    const entry = state.index.get(node.getAttribute("data-path") || "");
    if (entry) entryMenu(ctx, entry, x, y);
  });

  /* ---------------- 面包屑 ---------------- */
  el.crumb.addEventListener("click", function (e) {
    const b = e.target.closest("[data-crumb]");
    if (!b) return;
    actions.navigate(b.getAttribute("data-crumb") || "");
  });

  /* ---------------- 主区：行 / 图块 ---------------- */
  main.addEventListener("click", function (e) {
    const a = e.target.closest("[data-path]");
    if (!a) return;
    const path = a.getAttribute("data-path") || "";
    if (a.getAttribute("data-dir") === "1") {
      e.preventDefault();
      actions.navigate(path);
      return;
    }
    const entry = state.index.get(path);
    if (!entry) return;
    e.preventDefault();
    actions.openEntry(entry);
  });
  attachHold(main, function (node, x, y) {
    const entry = state.index.get(node.getAttribute("data-path") || "");
    if (entry) entryMenu(ctx, entry, x, y);
  });

  /* ---------------- 工具栏 ---------------- */
  document.getElementById("fm-btn-up").addEventListener("click", actions.goUp);
  document.getElementById("fm-btn-view").addEventListener("click", actions.toggleView);
  document.getElementById("fm-btn-theme").addEventListener("click", actions.cycleTheme);
  document.getElementById("fm-btn-refresh").addEventListener("click", actions.refresh);
  document.getElementById("fm-btn-positions").addEventListener("click", actions.openSidebar);
  document.getElementById("fm-sidebar-close").addEventListener("click", actions.closeSidebar);
  document.getElementById("fm-scrim").addEventListener("click", actions.closeSidebar);

  el.btnSort.addEventListener("click", function () {
    openActionSheet({
      title: "排序方式",
      items: Object.keys(SORTS).map(function (k) {
        return { label: SORTS[k], value: k, checked: state.sort === k };
      }),
    }).then(function (value) { if (value) actions.setSort(value); });
  });

  /* ---------------- 搜索 ---------------- */
  const push = debounce(function () { actions.setKeyword(el.search.value); }, 200);
  el.search.addEventListener("input", push);
  el.search.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); actions.setKeyword(el.search.value); }
  });
  el.searchClear.addEventListener("click", function () {
    el.search.value = "";
    actions.setKeyword("");
    el.search.focus();
  });

  /* ---------------- 底部标签栏 ---------------- */
  el.tabs.addEventListener("click", function (e) {
    const tab = e.target.closest("[data-tab]");
    if (!tab) return;
    const name = tab.getAttribute("data-tab");
    if (name === "home") return;         // 「门户」是链接，走默认跳转
    e.preventDefault();
    actions.setTab(name);
  });

  /* ---------------- 提示条关闭 ---------------- */
  const noticeSlot = document.getElementById("fm-notices");
  if (noticeSlot) {
    noticeSlot.addEventListener("click", function (e) {
      const b = e.target.closest("[data-dismiss]");
      if (!b) return;
      actions.dismissNotice(b.getAttribute("data-dismiss"));
    });
  }

  /* ---------------- 路由：hash / 前进后退 ---------------- */
  function parseHash() {
    const raw = String(location.hash || "").replace(/^#\/?/, "");
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }
  window.addEventListener("hashchange", function () {
    actions.navigate(parseHash(), { fromRoute: true });
  });
  window.addEventListener("popstate", function (e) {
    const p = (e.state && typeof e.state.path === "string") ? e.state.path : parseHash();
    actions.navigate(p, { fromRoute: true });
  });

  /* ---------------- 键盘 ---------------- */
  document.addEventListener("keydown", function (e) {
    const tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select";
    if (e.key === "Escape") {
      if (closeTop()) return;
      actions.closeSidebar();
      if (typing) document.activeElement.blur();
      return;
    }
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); actions.focusSearch(); return;
    }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); actions.focusSearch(); return; }
    if (e.key === "l" || e.key === "L") { e.preventDefault(); actions.toggleView(); return; }
    if (e.key === "s" || e.key === "S") { e.preventDefault(); el.btnSort.click(); return; }
    if (e.key === "Backspace" || (e.key === "ArrowLeft" && e.altKey)) { e.preventDefault(); actions.goUp(); }
  });

  /* ---------------- 视口变化 ---------------- */
  window.addEventListener("resize", debounce(function () { actions.onResize(); }, 140));
}
