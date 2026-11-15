/* state.js — 首页状态 + localStorage 持久化（隐私模式/禁用存储时静默降级）。 */

export const SETTINGS_KEY = "iosHome.settings.v1";
export const DOCK_KEY = "iosHome.dockExtras.v1";
export const SORTS = {
  "pinned-desc": "置顶优先",
  "updated-desc": "最近更新",
  "created-desc": "创建时间",
  "title-asc": "标题 A→Z",
};

export const SETTINGS_DEFAULTS = {
  theme: "auto",        // auto | light | dark
  view: null,           // null = 用注册表 views.default
  iconSize: "standard", // standard | big
  perPage: 0,           // 0 = 用注册表 views.perPage
  sort: "pinned-desc",
};

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch (e) { return null; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}

export function loadSettings() {
  return Object.assign({}, SETTINGS_DEFAULTS, readJSON(SETTINGS_KEY) || {});
}

export function saveSettings(patch) {
  const next = Object.assign(loadSettings(), patch || {});
  writeJSON(SETTINGS_KEY, next);
  return next;
}

export function clearSettings() {
  try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* 忽略 */ }
}

/** Dock 本地收藏（url 列表，不写注册表） */
export function loadDockExtras() {
  const v = readJSON(DOCK_KEY);
  return Array.isArray(v) ? v.filter(function (u) { return typeof u === "string" && u; }) : [];
}

export function saveDockExtras(list) {
  return writeJSON(DOCK_KEY, Array.isArray(list) ? list : []);
}

/** 建状态：set() 合并补丁后通知订阅者（订阅者收到变更的键集合） */
export function createState(initial) {
  const subs = [];
  const state = Object.assign({}, initial);
  state.set = function (patch) {
    const changed = {};
    Object.keys(patch).forEach(function (k) {
      if (state[k] !== patch[k]) { state[k] = patch[k]; changed[k] = true; }
    });
    if (Object.keys(changed).length) subs.forEach(function (f) { f(changed, state); });
    return changed;
  };
  state.subscribe = function (fn) { subs.push(fn); };
  return state;
}

/** URL 查询串（用于分享/刷新保持筛选） */
export function readLocationState() {
  const out = {};
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("cat")) out.category = q.get("cat");
    if (q.get("q")) out.keyword = q.get("q");
    if (q.get("view") === "list" || q.get("view") === "card") out.view = q.get("view");
    if (SORTS[q.get("sort")]) out.sort = q.get("sort");
  } catch (e) { /* 忽略 */ }
  return out;
}

export function writeLocationState(state) {
  try {
    const q = new URLSearchParams();
    if (state.category && state.category !== "all") q.set("cat", state.category);
    if (state.keyword) q.set("q", state.keyword);
    if (state.view === "list") q.set("view", "list");
    if (state.sort && state.sort !== SETTINGS_DEFAULTS.sort) q.set("sort", state.sort);
    const s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
  } catch (e) { /* 忽略（file:// 等环境） */ }
}
