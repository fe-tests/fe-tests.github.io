/* preview.js — 文件预览浮层（只读：文本/代码、图片、音频、HTML、PDF、二进制面板）。
 * 体积与行数上限：≤512 KB 且 ≤2000 行；服务器未登记 MIME 的类型给出下载提示。 */

import { openSheet, showToast } from "../../../assets/home/sheets.js";
import { icons } from "../../../assets/home/icons.js";
import { escapeHtml, formatSize, formatDate, relativeTime, copyText } from "../../../assets/home/format.js";
import { kindLabel, isTextLike } from "./label.js";
import { siteUrl, parentOf, nameOf } from "./api.js";

const MAX_BYTES = 512 * 1024;
const MAX_LINES = 2000;

/** 取文本（带体积上限）；null = 取不到 */
async function fetchText(entry) {
  const url = siteUrl(entry.p);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > MAX_BYTES) return { tooBig: true, size: len };
  const text = await res.text();
  if (text.length > MAX_BYTES) return { tooBig: true, size: text.length, text: text };
  return { text: text, size: text.length };
}

function linesHTML(text) {
  const all = String(text).replace(/\r\n?/g, "\n").split("\n");
  const shown = all.slice(0, MAX_LINES);
  const rows = shown.map(function (line, i) {
    return '<div class="fm-line"><span class="fm-lnno">' + (i + 1) +
      '</span><span class="fm-lntxt">' + (line.length ? escapeHtml(line) : "\u00a0") + "</span></div>";
  }).join("");
  const more = all.length > shown.length
    ? '<p class="fm-cap">只显示前 ' + MAX_LINES + ' 行（共 ' + all.length + ' 行）。</p>'
    : "";
  return '<div class="fm-pre" role="document" tabindex="0">' + rows + "</div>" + more;
}

function infoRows(entry, extra) {
  const rows = [
    row("类型", escapeHtml(kindLabel(entry.meta))),
    row("大小", entry.s == null ? "未知（清单未记录）" : escapeHtml(formatSize(entry.s))),
    row("修改时间", escapeHtml(entry.m ? (formatDate(entry.m) + "（" + (relativeTime(entry.m) || "") + "）") : "未知")),
    row("路径", '<span class="ios-mono">' + escapeHtml(entry.p) + "</span>"),
  ];
  if (extra) rows.push(extra);
  return '<div class="ios-section"><div class="ios-section-header">信息</div><div class="ios-list">' + rows.join("") + "</div></div>";
}

function row(label, valueHTML) {
  return '<div class="ios-cell"><span class="fm-cell-label">' + escapeHtml(label) + "</span>" +
    '<span class="ios-cell-value">' + valueHTML + "</span></div>";
}

function notice(text) {
  return '<div class="ios-notice ios-notice-info">' + icons.info + "<span>" + text + "</span></div>";
}

function binaryPanel(entry) {
  return '<div class="fm-binary">' +
    '<span class="fm-binary-ico" style="--g1:' + entry.meta.g1 + ";--g2:" + entry.meta.g2 + '">' +
    (icons[entry.meta.icon] || icons.file) + "</span>" +
    '<p class="ios-body">' + escapeHtml(kindLabel(entry.meta)) + "</p>" +
    '<p class="ios-caption">站点服务器只发静态文件，没有内联预览；可下载或在新窗口打开。</p>' +
    "</div>";
}

/**
 * 打开文件预览浮层。
 * @param {Object} ctx {entry, state, onNavigate(dirPath), onOpenDir(dirPath), onFavToggle(path)}
 */
export function openPreview(ctx) {
  const entry = ctx.entry;
  if (!entry || entry.t === "d") return;
  const meta = entry.meta;
  const url = siteUrl(entry.p);

  const bodyHead =
    '<div class="fm-preview-head">' +
    '<span class="ios-row-icon fm-preview-icon" style="--g1:' + meta.g1 + ";--g2:" + meta.g2 + '">' +
    (icons[meta.icon] || icons.file) + "</span>" +
    '<div class="fm-preview-name">' + escapeHtml(entry.name) + "</div>" +
    '<div class="ios-caption">' + escapeHtml(kindLabel(meta)) +
    (entry.s == null ? "" : " · " + escapeHtml(formatSize(entry.s))) + "</div>" +
    "</div>";

  const sheet = openSheet({
    title: entry.name,
    label: entry.name + " 预览",
    bodyHTML: "",
    footerHTML:
      '<button class="ios-btn ios-btn-filled" type="button" data-newwin>新窗口打开</button>' +
      '<a class="ios-btn" href="' + escapeHtml(url) + '" download>下载</a>' +
      '<button class="ios-btn" type="button" data-copy>复制路径</button>' +
      '<button class="ios-btn" type="button" data-fav>' + (ctx.isFav(entry.p) ? "取消收藏" : "收藏") + "</button>" +
      (meta.kind !== "dir" ? '<button class="ios-btn" type="button" data-dir>打开所在目录</button>' : ""),
  });

  const body = sheet.body;
  let html = bodyHead;
  body.innerHTML = html + infoRows(entry);

  // 各类型的正文区（调用方传完整 HTML，这里只追加信息区）
  const fill = function (extraInfo, contentHTML) {
    body.innerHTML = contentHTML + infoRows(entry, extraInfo);
  };

  if (isTextLike(meta)) {
    body.innerHTML = bodyHead + '<div class="fm-loading-row">' + '<span class="ios-spinner"></span><span class="ios-caption">读取文本…</span></div>' + infoRows(entry);
    fetchText(entry).then(function (res) {
      if (res.tooBig) {
        fill(row("大小", escapeHtml(formatSize(res.size))),
          bodyHead + binaryPanel(entry) + notice("文件超过 " + formatSize(MAX_BYTES) + "，不做内联预览。"));
        return;
      }
      if (!res.text || res.text.indexOf("\u0000") >= 0) {
        fill(null, bodyHead + binaryPanel(entry) + notice("看起来是二进制文件，已停止文本预览。"));
        return;
      }
      const lines = res.text.replace(/\r\n?/g, "\n").split("\n").length;
      const extra = row("行数", String(lines)) + row("文本大小", formatSize(res.size));
      fill(extra, bodyHead + linesHTML(res.text));
      if (meta.kind === "markdown") {
        body.insertAdjacentHTML("beforeend", notice("Markdown 以纯文本预览（站点不引入 Markdown 渲染器）。"));
      }
    }).catch(function (e) {
      fill(null, bodyHead + binaryPanel(entry) + notice("读取失败：" + escapeHtml(e && e.message ? e.message : String(e))));
    });
  } else if (meta.kind === "image") {
    fill(null, bodyHead + '<div class="fm-image-box"><img class="fm-image" src="' + escapeHtml(url) +
      '" alt="' + escapeHtml(entry.name) + '" loading="lazy"></div>');
  } else if (meta.kind === "audio") {
    fill(null, bodyHead + '<div class="fm-media"><audio controls preload="metadata" src="' + escapeHtml(url) + '"></audio></div>' +
      notice("服务器登记的 MIME 覆盖 mp3/wav/ogg；其它音频格式可能无法内联播放。"));
  } else if (meta.kind === "video") {
    fill(null, bodyHead + '<div class="fm-media"><video controls preload="metadata" src="' + escapeHtml(url) + '"></video></div>' +
      notice("服务器 MIME 表未登记 mp4/webm（见根 README「已知限制」），视频可能无法内联播放，请用下载或新窗口打开。"));
  } else if (meta.kind === "html") {
    fill(null, bodyHead + '<div class="fm-frame-box"><iframe class="fm-frame" sandbox="allow-scripts" srcdoc="' +
      escapeHtml("<p style=\"font:14px system-ui;padding:16px\">正在载入页面…</p>") + '" title="' + escapeHtml(entry.name) + '"></iframe></div>' +
      notice("沙箱 iframe（allow-scripts）内联预览，脚本只在沙箱里运行；建议在「新窗口打开」里完整体验。"));
    fetchText(entry).then(function (res) {
      if (res.tooBig || !res.text) return;
      const frame = body.querySelector(".fm-frame");
      if (frame) frame.setAttribute("srcdoc", res.text);
    }).catch(function () { /* 忽略 */ });
  } else if (meta.kind === "pdf") {
    fill(null, bodyHead + '<div class="fm-frame-box"><iframe class="fm-frame" src="' + escapeHtml(url) +
      '" title="' + escapeHtml(entry.name) + '"></iframe></div>' +
      notice("服务器 MIME 表未登记 pdf，浏览器多半会直接下载；请用「新窗口打开」或「下载」。"));
  } else {
    fill(null, bodyHead + binaryPanel(entry));
  }

  // 打开即记入「最近打开」
  ctx.onOpened(entry.p);

  sheet.el.addEventListener("click", function (e) {
    const t = e.target;
    if (t.closest("[data-newwin]")) {
      const w = window.open(url, "_blank", "noopener");
      if (!w) showToast("弹窗被拦截，请允许打开新窗口");
      return;
    }
    if (t.closest("[data-copy]")) {
      copyText(url).then(function (ok) { showToast(ok ? "已复制文件路径" : "复制失败，请手动复制", ok ? "check" : "warning"); });
      return;
    }
    if (t.closest("[data-fav]")) {
      const on = ctx.onFavToggle(entry.p);
      showToast(on ? "已加入收藏" : "已取消收藏", on ? "check" : "x");
      return;
    }
    if (t.closest("[data-dir]")) {
      sheet.close();
      if (ctx.onNavigate) ctx.onNavigate(parentOf(entry.p));
      return;
    }
    if (t.closest("a[download]")) showToast("开始下载：" + nameOf(entry.p));
  });

  return sheet;
}
