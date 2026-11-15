/* springboard.js — 主屏图标网格：分页渲染、页码点、翻页、图块交互、键盘导航。 */

import { tileHTML } from "./apps.js";
import { icons } from "./icons.js";

/** 分块 */
export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length ? out : [];
}

/**
 * 渲染图标网格。paged=true 时每 pageSize 个一页（移动端主屏）；否则单页自然流（PC / 列表页）。
 * @returns {{pageEls:Element[], pages:Element[][]}}
 */
export function renderSpringboard(root, apps, opts) {
  opts = opts || {};
  const pageSize = opts.paged ? Math.max(4, opts.pageSize || 24) : Math.max(apps.length, 1);
  const pages = chunk(apps, pageSize);
  let idx = 0;
  const html = pages.map(function (page, pi) {
    const tiles = page.map(function (app) {
      const h = tileHTML(app, { isMobile: opts.isMobile, index: idx++ });
      return h;
    }).join("");
    const more = (opts.paged && pi === pages.length - 1 && opts.hasMore)
      ? '<a class="ios-tile ios-tile-more" href="#" data-more aria-label="显示更多结果">' +
        '<span class="ios-tile-icon" aria-hidden="true">' + icons.plus + "</span>" +
        '<span class="ios-tile-label">显示更多' + (opts.moreCount ? "（" + opts.moreCount + "）" : "") + "</span></a>"
      : "";
    return '<div class="ios-page" data-page="' + pi + '">' + tiles + more + "</div>";
  }).join("");

  root.innerHTML = html || '<div class="ios-page" data-page="0"></div>';
  return { pages: pages, pageEls: Array.prototype.slice.call(root.querySelectorAll(".ios-page")) };
}

/** 页码指示点 */
export function renderDots(el, count, active, onSelect) {
  if (!el) return;
  if (count <= 1) { el.innerHTML = ""; el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.innerHTML = Array.from({ length: count }, function (_, i) {
    return '<button class="ios-dot' + (i === active ? " active" : "") + '" type="button" data-page="' + i +
      '" aria-label="第 ' + (i + 1) + " 页" + (i === active ? "（当前）" : "") + '"></button>';
  }).join("");
  if (onSelect) {
    el.querySelectorAll(".ios-dot").forEach(function (b) {
      b.addEventListener("click", function () { onSelect(Number(b.getAttribute("data-page"))); });
    });
  }
}

export function setDotActive(el, index) {
  if (!el) return;
  el.querySelectorAll(".ios-dot").forEach(function (b, i) {
    b.classList.toggle("active", i === index);
  });
}

/** 绑定横向翻页，返回 {index(), goTo(i)} */
export function bindPaging(scroller, onIndex) {
  let current = 0, raf = 0;
  function measure() {
    raf = 0;
    const w = scroller.clientWidth || 1;
    const i = Math.max(0, Math.min(Math.round(scroller.scrollLeft / w), Math.max(0, scroller.scrollWidth / w - 1 | 0)));
    if (i !== current) { current = i; if (onIndex) onIndex(i); }
  }
  scroller.addEventListener("scroll", function () {
    if (!raf) raf = requestAnimationFrame(measure);
  }, { passive: true });
  return {
    index: function () { return current; },
    goTo: function (i) {
      const w = scroller.clientWidth || 0;
      scroller.scrollTo({ left: w * i, behavior: "smooth" });
      current = i;
      if (onIndex) onIndex(i);
    },
  };
}

function tileOf(node) { return node && node.closest ? node.closest(".ios-tile") : null; }

function columnsOf(pageEl) {
  if (!pageEl) return 4;
  try {
    const cs = getComputedStyle(pageEl).gridTemplateColumns;
    const n = (cs || "").split(" ").filter(Boolean).length;
    return Math.max(1, n);
  } catch (e) { return 4; }
}

/**
 * 图块交互：点击打开、长按/右键唤出上下文菜单、加载更多。
 * handlers: { byId(id), onOpen(app, el, ev), onContext(app, el, x, y), onLoadMore() }
 */
export function bindTiles(root, handlers) {
  let lpTimer = 0, suppress = false, sx = 0, sy = 0;

  function appOf(el) {
    const id = el && el.getAttribute ? el.getAttribute("data-app") : null;
    return id && handlers.byId ? handlers.byId(id) : null;
  }
  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  root.addEventListener("pointerdown", function (e) {
    const tile = tileOf(e.target);
    if (!tile) return;
    sx = e.clientX; sy = e.clientY; suppress = false;
    clearTimeout(lpTimer);
    lpTimer = setTimeout(function () {
      const app = appOf(tile);
      if (!app || !handlers.onContext) return;
      suppress = true;
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { /* 忽略 */ } }
      const c = center(tile);
      handlers.onContext(app, tile, c.x, c.y);
    }, 480);
  }, { passive: true });

  function cancelHold() { clearTimeout(lpTimer); lpTimer = 0; }
  root.addEventListener("pointermove", function (e) {
    if (!lpTimer) return;
    if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancelHold();
  }, { passive: true });
  root.addEventListener("pointerup", function () {
    setTimeout(function () { suppress = false; }, 700);
    cancelHold();
  }, { passive: true });
  root.addEventListener("pointercancel", cancelHold, { passive: true });
  root.addEventListener("scroll", cancelHold, { passive: true });

  root.addEventListener("click", function (e) {
    const more = e.target.closest("[data-more]");
    if (more) {
      e.preventDefault();
      if (handlers.onLoadMore) handlers.onLoadMore();
      return;
    }
    const el = e.target.closest("[data-app]");
    if (!el) return;
    if (suppress) { e.preventDefault(); suppress = false; return; }
    const app = appOf(el);
    if (app && handlers.onOpen) handlers.onOpen(app, el, e);
  });

  root.addEventListener("contextmenu", function (e) {
    const el = e.target.closest("[data-app]");
    if (!el) return;
    const app = appOf(el);
    if (!app || !handlers.onContext) return;
    e.preventDefault();
    handlers.onContext(app, el, e.clientX, e.clientY);
  });

  root.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      const el = tileOf(e.target);
      if (el) { e.preventDefault(); el.click(); }
    }
  });
}

/**
 * 网格键盘导航。返回 true 表示已处理（调用方需 preventDefault）。
 * paging: bindPaging 的返回值（paged 模式）
 */
export function handleGridKey(root, ev, opts) {
  opts = opts || {};
  const cur = tileOf(document.activeElement);
  if (!cur || !root.contains(cur)) return false;
  const pageEl = cur.closest(".ios-page");
  const tiles = Array.prototype.slice.call(pageEl.querySelectorAll(".ios-tile:not(.ios-tile-more)"));
  const i = tiles.indexOf(cur);
  const cols = columnsOf(pageEl);
  const pageIdx = Number(pageEl.getAttribute("data-page")) || 0;
  const pages = root.querySelectorAll(".ios-page").length;
  const key = ev.key;

  function focusTile(t) {
    if (!t) return false;
    t.focus();
    t.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }
  function goToPage(pi, focusFirst) {
    if (!opts.paging || pi < 0 || pi >= pages) return false;
    opts.paging.goTo(pi);
    const target = root.querySelectorAll(".ios-page")[pi];
    const list = target ? Array.prototype.slice.call(target.querySelectorAll(".ios-tile:not(.ios-tile-more)")) : [];
    const t = focusFirst === "last" ? list[list.length - 1] : list[0];
    if (t) setTimeout(function () { focusTile(t); }, 180);
    return true;
  }

  let target = i;
  if (key === "ArrowRight" || key === "PageRight") target = i + 1;
  else if (key === "ArrowLeft" || key === "PageLeft") target = i - 1;
  else if (key === "ArrowDown") target = i + cols;
  else if (key === "ArrowUp") target = i - cols;
  else if (key === "Home") target = 0;
  else if (key === "End") target = tiles.length - 1;
  else return false;

  if (target < 0) {
    return opts.paged ? goToPage(pageIdx - 1, "last") : focusTile(tiles[0]);
  }
  if (target >= tiles.length) {
    return opts.paged ? goToPage(pageIdx + 1, "first") : focusTile(tiles[tiles.length - 1]);
  }
  return focusTile(tiles[target]);
}

/** 移动端下拉打开 Spotlight（绑在翻页容器上，判定当前页的 scrollTop） */
export function bindPullDown(root, onPull, threshold) {
  const th = threshold || 56;
  let startY = null;
  let box = null;
  root.addEventListener("touchstart", function (e) {
    const page = e.target.closest ? e.target.closest(".ios-page") : null;
    box = page && page.scrollTop <= 1 ? page : (page ? null : root);
    startY = box ? e.touches[0].clientY : null;
  }, { passive: true });
  root.addEventListener("touchmove", function (e) {
    if (startY == null) return;
    if (e.touches[0].clientY - startY > th) { startY = null; onPull(); }
  }, { passive: true });
  root.addEventListener("touchend", function () { startY = null; box = null; }, { passive: true });
}
