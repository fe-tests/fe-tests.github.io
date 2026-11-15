/* format.js — 纯文本/格式化工具（无 DOM 依赖，可单测）。 */

/** HTML 转义（与注册表加载器一致的严格转义，所有动态文案都过这里）。 */
export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** 注册表日期 → 「YYYY-MM-DD HH:MM:SS」（不做时区换算，避免偏移）。 */
export function formatDate(s) {
  if (!s) return "";
  var t = String(s).trim();
  var sp = t.indexOf(" ");
  if (sp > 0) return t;
  return t + " 00:00:00";
}

/** 仅日期部分。 */
export function dateOnly(s) {
  return formatDate(s).slice(0, 10);
}

export function statusLabel(status) {
  return ({ stable: "稳定", experimental: "实验", alpha: "开发中" })[status] || "稳定";
}

export function statusClass(status) {
  return "ios-status-" + (status || "stable");
}

/** 12345 → 「12,345」 */
export function formatNumber(n) {
  var s = String(Math.round(Number(n) || 0));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 字节 → 人类可读（iOS 文件 App 风格：1.2 GB / 345 KB） */
export function formatSize(bytes) {
  var b = Number(bytes);
  if (!isFinite(b) || b < 0) return "";
  var units = ["B", "KB", "MB", "GB", "TB"];
  var i = 0, v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  var txt = i === 0 ? String(Math.round(v)) : (v >= 100 ? String(Math.round(v)) : v.toFixed(1));
  return txt + " " + units[i];
}

/** 「2 分钟前」「昨天 15:04」「3 天前」「2026-11-13」 */
export function relativeTime(stamp) {
  var t = String(stamp || "").trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const diff = Date.now() - d.getTime();
  if (diff < 0 || diff > 1000 * 60 * 60 * 24 * 365 * 20) return dateOnly(t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return min + " 分钟前";
  const hr = Math.floor(min / 60);
  if (hr < 24 && d.getDate() === new Date().getDate()) return "今天 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  if (hr < 48) return "昨天 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  const day = Math.floor(hr / 24);
  if (day <= 6) return day + " 天前";
  return dateOnly(t);
}

export function pad(n) { return (n < 10 ? "0" : "") + n; }

/** 状态栏时钟（iOS：9:41，不补零） */
export function clockTime(d) {
  var x = d || new Date();
  return x.getHours() + ":" + pad(x.getMinutes());
}

/** 防抖 */
export function debounce(fn, ms) {
  var t;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

/** 剪贴板（带 execCommand 兜底），返回是否成功。 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* 退到 execCommand */ }
  try {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1px;left:-1px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    var ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

/** 绝对 URL（用于「新窗口打开 / 复制链接」） */
export function absoluteUrl(href) {
  try { return new URL(href, location.href).href; } catch (e) { return String(href || ""); }
}
