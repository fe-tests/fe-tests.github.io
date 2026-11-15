/* state.js — 资源管理器状态与 localStorage 偏好（本机）+ 迷你订阅状态机。
 * 键：fm.view.v1（视图/排序/侧栏）、fm.recent.v1（最近打开）、fm.favorites.v1（收藏）。
 * 深浅色主题与首页共用 iosHome.settings.v1（只读，不改首页设置）。 */

export const PREFS_KEY = "fm.view.v1";
export const RECENT_KEY = "fm.recent.v1";
export const FAV_KEY = "fm.favorites.v1";
export const THEME_KEY = "iosHome.settings.v1";   // 与首页共用（只读）

export const PREFS_DEFAULTS = {
  view: "list",          // list | grid
  sort: "dir-name-asc",  // 见 api.js SORTS
  groupDirs: true,
  tab: "browse",         // browse | recent | search
};

const MAX_RECENT = 24;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return (v && typeof v === "object") ? v : null;
  } catch (e) { return null; }
}
function readList(key) {
  const v = read(key);
  return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string" && x; }) : [];
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}

export function loadPrefs() {
  return Object.assign({}, PREFS_DEFAULTS, read(PREFS_KEY) || {});
}
export function savePrefs(patch) {
  const next = Object.assign(loadPrefs(), patch || {});
  write(PREFS_KEY, next);
  return next;
}

export function loadRecent() { return readList(RECENT_KEY); }
export function pushRecent(path) {
  const p = String(path || "");
  if (!p) return loadRecent();
  const list = loadRecent().filter(function (x) { return x !== p; });
  list.unshift(p);
  write(RECENT_KEY, list.slice(0, MAX_RECENT));
  return list.slice(0, MAX_RECENT);
}
export function clearRecent() { write(RECENT_KEY, []); return []; }

export function loadFavorites() { return readList(FAV_KEY); }
export function toggleFavorite(path) {
  const p = String(path || "");
  if (!p) return loadFavorites();
  const list = loadFavorites();
  const i = list.indexOf(p);
  if (i >= 0) list.splice(i, 1); else list.unshift(p);
  write(FAV_KEY, list.slice(0, MAX_RECENT));
  return list.slice(0, MAX_RECENT);
}
export function isFavorite(path) { return loadFavorites().indexOf(String(path || "")) >= 0; }

/** 只读读取首页主题（不写首页其它设置） */
export function readThemeMode() {
  const s = read(THEME_KEY);
  return (s && (s.theme === "light" || s.theme === "dark")) ? s.theme : "auto";
}

/** 写主题：只覆盖 iosHome.settings.v1 的 theme 键，保留首页其它设置 */
export function saveThemeMode(mode) {
  const s = read(THEME_KEY) || {};
  s.theme = (mode === "light" || mode === "dark") ? mode : "auto";
  write(THEME_KEY, s);
  return s.theme;
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
