/* spotlight.js — iOS Spotlight 搜索浮层（窄屏）。 */

import { renderFlatList } from "./listview.js";
import { debounce, escapeHtml } from "./format.js";
import { icons } from "./icons.js";

const MAX_RESULTS = 60;

export function createSpotlight(opts) {
  const els = opts.els;
  let open = false;
  let hideTimer = 0;

  /** 渲染扁平结果行（复用 listview 的行模板） */
  function rowsHTML(list) {
    const tmp = document.createElement("div");
    renderFlatList(tmp, list, { isMobile: opts.isMobile, showDesc: true, showDate: true });
    return tmp.innerHTML;
  }

  function resultsHTML(list, keyword) {
    if (!list.length) {
      return '<div class="ios-empty"><span class="ios-empty-icon" aria-hidden="true">🔍</span>' +
        "<p>没有匹配「" + escapeHtml(keyword) + "」的结果</p></div>";
    }
    const shown = list.slice(0, MAX_RESULTS);
    const hint = list.length > shown.length
      ? '<p class="ios-spotlight-hint">仅显示前 ' + shown.length + " 条，共 " + list.length + " 条匹配。</p>"
      : '<p class="ios-spotlight-hint">' + list.length + " 条匹配。</p>";
    return '<div class="ios-section"><div class="ios-list">' + rowsHTML(shown) + "</div></div>" + hint;
  }

  function render() {
    const kw = (els.input.value || "").trim();
    els.body.innerHTML = resultsHTML(opts.getResults(kw), kw);
    els.clear.hidden = !kw;
  }

  function focusSoon() {
    setTimeout(function () { try { els.input.focus(); } catch (e) { /* 忽略 */ } }, 80);
  }

  function openSpotlight(prepulse) {
    if (window.innerWidth >= 768) return;   // PC 不用浮层
    open = true;
    clearTimeout(hideTimer);
    els.root.hidden = false;
    if (typeof prepulse === "function") prepulse();
    requestAnimationFrame(function () {
      els.root.classList.add("show");
      document.body.dataset.modal = "open";
    });
    els.input.value = opts.getKeyword() || "";
    render();
    focusSoon();
  }

  function closeSpotlight() {
    if (!open) return;
    open = false;
    els.root.classList.remove("show");
    const host = document.getElementById("sheet-host");
    if (!host || !host.children.length) delete document.body.dataset.modal;
    hideTimer = setTimeout(function () { els.root.hidden = true; }, 260);
    if (opts.onClose) opts.onClose();
  }

  function isOpen() { return open; }

  els.input.addEventListener("input", debounce(function () {
    opts.onQuery(els.input.value);
    render();
  }, 140));
  els.clear.addEventListener("click", function () {
    els.input.value = "";
    opts.onQuery("");
    render();
    focusSoon();
  });
  els.cancel.addEventListener("click", closeSpotlight);
  els.root.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); closeSpotlight(); }
  });
  // 结果行点击：交给上层 onOpen，未拦截则收起
  els.body.addEventListener("click", function (e) {
    const row = e.target.closest("[data-app]");
    if (!row) return;
    const app = opts.byId(row.getAttribute("data-app"));
    if (!app) return;
    if (opts.onOpen) opts.onOpen(app, row, e);
    if (!e.defaultPrevented) closeSpotlight();
  });

  return { open: openSpotlight, close: closeSpotlight, isOpen: isOpen, render: render, icon: icons.search };
}
