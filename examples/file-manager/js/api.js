/* api.js — 清单读取 + 路径索引（纯前端「虚拟文件树」，无任何写操作接口）。 */

import { kindOf } from "./label.js";

export const MANIFEST_URL = "./data/files.json";
export const DAY = 86400000;

/** 读清单；失败时带 reason，调用方决定是否回退 */
export async function loadManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) return { ok: false, reason: "HTTP " + res.status };
    const data = await res.json();
    if (!data || !Array.isArray(data.entries) || !data.entries.length) {
      return { ok: false, reason: "清单为空或格式异常" };
    }
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, reason: (e && e.message) ? e.message : String(e) };
  }
}

export function parentOf(p) {
  const s = String(p == null ? "" : p);
  const i = s.lastIndexOf("/");
  return i < 0 ? "" : s.slice(0, i);
}

export function nameOf(p) {
  const s = String(p == null ? "" : p);
  const i = s.lastIndexOf("/");
  return i < 0 ? s : s.slice(i + 1);
}

export function isDescendant(p, dir) {
  if (!dir) return String(p).indexOf("/") > 0;
  return String(p).indexOf(dir + "/") === 0 && String(p).slice(dir.length + 1).indexOf("/") >= 0;
}

/** 站点根 URL（清单路径都是站点根相对路径） */
export function siteUrl(p) {
  const rel = String(p == null ? "" : p).split("/").filter(Boolean)
    .map(function (seg) { return encodeURIComponent(seg); }).join("/");
  try { return new URL("/" + rel, location.href).href; } catch (e) { return "/" + rel; }
}

/** 清单条目 → 索引（path → entry，children 缓存） */
export function buildIndex(entries) {
  const byPath = new Map();
  const children = new Map();     // dir → [entry]
  const files = [];
  const dirs = [];
  (entries || []).forEach(function (raw) {
    if (!raw || typeof raw.p !== "string") return;
    const p = raw.p === "" ? "" : String(raw.p).replace(/\\/g, "/").replace(/^\.\//, "");
    if (p !== "" && p.indexOf("..") >= 0) return;    // 越界防护
    const e = {
      p: p,
      t: raw.t === "d" ? "d" : "f",
      s: typeof raw.s === "number" ? raw.s : null,
      m: String(raw.m || ""),
      n: typeof raw.n === "number" ? raw.n : null,
      name: p === "" ? "" : nameOf(p),
      dir: parentOf(p),
    };
    e.meta = kindOf(e.name, e.t === "d");
    byPath.set(p, e);
    if (e.t === "d") dirs.push(e); else files.push(e);
    if (!children.has(e.dir)) children.set(e.dir, []);
    if (p !== "") children.get(e.dir).push(e);
  });
  return {
    byPath: byPath,
    children: children,
    files: files,
    dirs: dirs,
    get: function (p) { return byPath.get(String(p || "")); },
    childrenOf: function (dir) { return children.get(String(dir || "")) || []; },
  };
}

export const SORTS = {
  "dir-name-asc": "文件夹优先，名称 A→Z",
  "name-asc": "名称 A→Z",
  "name-desc": "名称 Z→A",
  "time-desc": "修改时间（新→旧）",
  "time-asc": "修改时间（旧→新）",
  "size-desc": "大小（大→小）",
  "size-asc": "大小（小→大）",
};
export const SORT_DEFAULT = "dir-name-asc";

function cmpName(a, b) { return a.name.localeCompare(b.name, "zh", { numeric: true, sensitivity: "base" }); }

/** 按排序键返回新数组（目录在前是 iOS 文件 App 的默认行为） */
export function sortEntries(list, sort, groupDirs) {
  const arr = (list || []).slice();
  const group = groupDirs !== false;
  const bySort = function (a, b) {
    switch (sort) {
      case "name-asc": return cmpName(a, b);
      case "name-desc": return cmpName(b, a);
      case "time-desc": return String(b.m).localeCompare(String(a.m)) || cmpName(a, b);
      case "time-asc": return String(a.m).localeCompare(String(b.m)) || cmpName(a, b);
      case "size-desc": return (b.s || 0) - (a.s || 0) || cmpName(a, b);
      case "size-asc": return (a.s || 0) - (b.s || 0) || cmpName(a, b);
      default: return cmpName(a, b);
    }
  };
  return arr.sort(function (a, b) {
    if (group && a.t !== b.t) return a.t === "d" ? -1 : 1;
    return bySort(a, b);
  });
}

/** 搜索：文件名/全路径包含（不区分大小写），目录优先 */
export function searchAll(index, keyword, limit) {
  const kw = String(keyword || "").trim().toLowerCase();
  if (!kw) return [];
  const tokens = kw.split(/\s+/);
  const all = index.byPath;
  const out = [];
  all.forEach(function (e) {
    if (e.p === "") return;
    const hay = (e.p + " " + e.name).toLowerCase();
    if (tokens.every(function (t) { return hay.indexOf(t) >= 0; })) out.push(e);
  });
  const max = limit > 0 ? limit : 400;
  const dirs = out.filter(function (e) { return e.t === "d"; });
  const files = out.filter(function (e) { return e.t === "f"; });
  return dirs.slice(0, 80).concat(files).slice(0, max);
}

/** 按修改时间倒序取文件（「最近」标签用） */
export function recentFiles(index, limit) {
  const arr = index.files.slice();
  arr.sort(function (a, b) {
    return String(b.m).localeCompare(String(a.m)) || cmpName(a, b);
  });
  return arr.slice(0, limit > 0 ? limit : 40);
}

/** 清单生成时间 → 距今天数（-1 = 无法解析） */
export function ageDays(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(stamp || ""));
  if (!m) return -1;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / DAY);
}

/**
 * 清单缺失时的回退树：用注册表页面 URL 造出目录 + 文件。
 * 返回 entries 结构（与清单同格式），并标记 fallback=true。
 */
export async function treeFromRegistry() {
  if (!window.Registry || !window.Registry.load) return null;
  const data = await window.Registry.load();
  const pages = (data && data.pages) || [];
  if (!pages.length) return null;
  const dirs = new Set(["", "examples"]);
  const entries = [{ p: "", t: "d", m: "", n: null }];
  pages.forEach(function (p) {
    const url = String(p.url || "").replace(/^\.\//, "");
    if (!url) return;
    const segs = url.split("/");
    for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join("/"));
    const stamp = p.updatedAt || p.createdAt || "";
    entries.push({ p: url, t: "f", s: null, m: stamp, n: null });
  });
  Array.from(dirs).forEach(function (d) {
    if (d === "") return;
    entries.push({ p: d, t: "d", m: "", n: null });
  });
  return {
    generated: "",
    root: "",
    count: entries.length,
    truncated: false,
    fallback: true,
    entries: entries,
  };
}
