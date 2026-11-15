/* sheets.js — iOS 浮层：卡片弹窗 / 底部抽屉 / 操作表 / 上下文菜单 / Toast。
 * 全部原生 DOM，焦点陷阱 + Esc 关闭 + 滚动锁，无框架。 */

import { icons } from "./icons.js";
import { escapeHtml } from "./format.js";

let host = null;
let toastEl = null;
let toastTimer = 0;
const stack = [];

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function init(hostElement, toastElement) {
  host = hostElement;
  toastEl = toastElement;
}

export function isNarrow() { return window.innerWidth < 768; }

function lockScroll() {
  document.body.dataset.modal = "open";
}
function syncScrollLock() {
  if (!stack.length) delete document.body.dataset.modal;
}

function focusables(root) {
  return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) {
    return el.offsetParent !== null || el === document.activeElement;
  });
}

/** 浮层通用：Esc 关闭 + Tab 焦点陷阱 + 恢复原点 */
function wireLayer(layer, api, onClose) {
  const prev = document.activeElement;
  layer.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.stopPropagation(); api.close(); return; }
    if (e.key !== "Tab") return;
    const items = focusables(layer);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); first.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); last.focus(); }
  });
  api.onClose = function () {
    syncScrollLock();
    if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* 忽略 */ } }
    if (onClose) onClose();
  };
}

function reveal(overlay, panel) {
  requestAnimationFrame(function () {
    overlay.classList.add("show");
    panel.classList.add("show");
  });
}

function removeLater(nodes) {
  setTimeout(function () { nodes.forEach(function (n) { if (n && n.parentNode) n.remove(); }); }, 320);
}

/**
 * 打开内容浮层。窄屏 → 底部抽屉（可拖拽关闭）；宽屏 → 居中卡片。
 * @returns {{el:HTMLElement, close:Function}}
 */
export function openSheet(opts) {
  opts = opts || {};
  const narrow = isNarrow();
  const overlay = document.createElement("div");
  overlay.className = "ios-overlay";
  const panel = document.createElement("div");
  panel.className = narrow ? "ios-drawer" : "ios-card-modal";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  if (opts.label) panel.setAttribute("aria-label", opts.label);

  panel.innerHTML =
    (narrow ? '<button class="ios-grabber" type="button" aria-label="关闭" data-close></button>' : "") +
    (opts.title
      ? '<div class="ios-modal-head">' +
        '<button class="ios-btn-plain" type="button" data-close aria-label="关闭">' + (opts.backLabel ? "返回" : "关闭") + "</button>" +
        '<span class="ios-modal-title">' + escapeHtml(opts.title) + "</span>" +
        (opts.actionLabel ? '<button class="ios-btn-plain" type="button" data-action>' + escapeHtml(opts.actionLabel) + "</button>" : '<span></span>') +
        "</div>"
      : '<div class="ios-modal-head" hidden></div>') +
    '<div class="ios-modal-body" id="sheet-body"></div>' +
    (opts.footerHTML ? '<div class="ios-modal-foot">' + opts.footerHTML + "</div>" : "");

  host.appendChild(overlay);
  host.appendChild(panel);
  lockScroll();

  const api = {
    el: panel,
    body: panel.querySelector("#sheet-body"),
    close: function () {
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      overlay.classList.remove("show");
      panel.classList.remove("show");
      removeLater([overlay, panel]);
      if (api.onClose) api.onClose();
    },
  };
  stack.push(api);
  wireLayer(panel, api, opts.onClose);

  panel.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) { api.close(); return; }
    const act = e.target.closest("[data-action]");
    if (act && opts.onAction) opts.onAction(api);
  });
  overlay.addEventListener("click", api.close);

  // 抽屉：下拉/上滑关闭
  const grab = panel.querySelector(".ios-grabber");
  if (grab) {
    let startY = 0, dy = 0, active = false;
    grab.addEventListener("pointerdown", function (e) {
      active = true; startY = e.clientY; dy = 0;
      panel.style.transition = "none";
      try { grab.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    });
    grab.addEventListener("pointermove", function (e) {
      if (!active) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.transform = "translateY(" + dy + "px)";
    });
    const end = function () {
      if (!active) return;
      active = false;
      panel.style.transition = "";
      panel.style.transform = "";
      if (dy > 70) api.close();
    };
    grab.addEventListener("pointerup", end);
    grab.addEventListener("pointercancel", end);
  }

  reveal(overlay, panel);
  if (opts.bodyHTML) api.body.innerHTML = opts.bodyHTML;
  if (opts.onMount) opts.onMount(api);

  const focusTarget = focusables(panel).filter(function (el) { return !el.hasAttribute("data-close"); })[0];
  if (focusTarget) setTimeout(function () { try { focusTarget.focus(); } catch (e) { /* 忽略 */ } }, 60);
  return api;
}

/**
 * 操作表（iOS Action Sheet）。items: [{label, value, checked, destructive, icon}]
 * @returns {Promise<string|null>} 选中项 value；取消为 null
 */
export function openActionSheet(opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const overlay = document.createElement("div");
    overlay.className = "ios-overlay";
    const sheet = document.createElement("div");
    sheet.className = "ios-actionsheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-label", opts.title || "选择操作");

    const rows = (opts.items || []).map(function (it) {
      return '<button class="ios-action' + (it.destructive ? " ios-action-destructive" : "") +
        '" type="button" data-value="' + escapeHtml(it.value) + '">' +
        (it.checked ? '<span class="ios-action-check">' + icons.check + "</span>" : "") +
        escapeHtml(it.label) + "</button>";
    }).join("");

    sheet.innerHTML =
      '<div class="ios-actionsheet-group">' +
      (opts.title ? '<div class="ios-action-title">' + escapeHtml(opts.title) + "</div>" : "") +
      rows + "</div>" +
      '<div class="ios-actionsheet-group ios-actionsheet-cancel">' +
      '<button class="ios-action" type="button" data-value="__cancel">取消</button></div>';

    host.appendChild(overlay);
    host.appendChild(sheet);
    lockScroll();

    const api = {
      el: sheet,
      close: function (value) {
        const i = stack.indexOf(api);
        if (i >= 0) stack.splice(i, 1);
        overlay.classList.remove("show");
        sheet.classList.remove("show");
        removeLater([overlay, sheet]);
        if (api.onClose) api.onClose();
        resolve(value === "__cancel" ? null : value);
      },
    };
    stack.push(api);
    wireLayer(sheet, api, function () { resolve(null); });

    sheet.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-value]");
      if (btn) api.close(btn.getAttribute("data-value"));
    });
    overlay.addEventListener("click", function () { api.close("__cancel"); });
    reveal(overlay, sheet);
    const first = focusables(sheet)[0];
    if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* 忽略 */ } }, 60);
  });
}

/**
 * iOS 上下文菜单（长按 / 右键触发）。items: [{label, icon, value, destructive}]
 */
export function openContextMenu(opts) {
  opts = opts || {};
  const overlay = document.createElement("div");
  overlay.className = "ios-overlay";
  const menu = document.createElement("div");
  menu.className = "ios-ctxmenu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", opts.label || "操作菜单");

  menu.innerHTML = (opts.items || []).map(function (it) {
    if (it.sep) return '<div class="ios-ctxmenu-sep"></div>';
    return '<button class="ios-ctxmenu-item" type="button" role="menuitem" data-value="' + escapeHtml(it.value) + '">' +
      (it.icon && icons[it.icon] ? icons[it.icon] : "<span></span>") +
      "<span>" + escapeHtml(it.label) + "</span></button>";
  }).join("");

  host.appendChild(overlay);
  host.appendChild(menu);
  lockScroll();

  // 定位：贴着触发点，超界则贴边
  const r = menu.getBoundingClientRect();
  const w = r.width || 244, h = r.height || 200;
  const x = Math.min(Math.max(8, (opts.x || 0) - w / 2), Math.max(8, window.innerWidth - w - 8));
  const y = Math.min(Math.max(8, (opts.y || 0) - h / 2), Math.max(8, window.innerHeight - h - 8));
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  const api = {
    el: menu,
    close: function (value) {
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      overlay.classList.remove("show");
      menu.classList.remove("show");
      removeLater([overlay, menu]);
      if (api.onClose) api.onClose();
      if (value != null && opts.onSelect) opts.onSelect(value);
    },
  };
  stack.push(api);
  wireLayer(menu, api);

  menu.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-value]");
    if (btn) api.close(btn.getAttribute("data-value"));
  });
  overlay.addEventListener("click", function () { api.close(null); });
  reveal(overlay, menu);
  const first = focusables(menu)[0];
  if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* 忽略 */ } }, 40);
  return api;
}

/** 关闭最上层浮层，返回是否有关闭 */
export function closeTop() {
  if (!stack.length) return false;
  stack[stack.length - 1].close(null);
  return true;
}

export function openCount() { return stack.length; }

/** 轻量提示（自动消失） */
export function showToast(text, iconKey) {
  if (!toastEl) return;
  clearTimeout(toastTimer);
  toastEl.innerHTML = (iconKey && icons[iconKey] ? icons[iconKey] : "") + "<span>" + escapeHtml(text) + "</span>";
  toastEl.classList.add("show");
  toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
}
