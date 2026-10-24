/* registry.js — 加载站点注册表，提供全局 API。
 * Agent 或页面编辑 registry.json 后，首页无需改动即可反映新页面。
 * 职责：读取 → 字段默认值补全（含日期）→ 按 url 去重 → 注入分类名。
 */
(function () {
  const REGISTRY_URL = "registry.json";

  // 本地时间戳 "YYYY-MM-DD HH:MM:SS"（与注册表日期格式一致，避免时区偏移）
  function nowStamp() {
    const d = new Date();
    const p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  // 日期归一化：仅日期补 00:00:00，"T" 分隔转空格，缺失/非法则用 fallback。
  function stamp(v, fallback) {
    const t = String(v == null ? "" : v).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
    if (!m) return fallback;
    return m[1] + "-" + m[2] + "-" + m[3] + " " +
      (m[4] || "00") + ":" + (m[5] || "00") + ":" + (m[6] || "00");
  }

  // url 是注册项唯一键（去重键）：去掉 "./" 前缀、反斜杠归一化。
  function normalizeUrl(u) {
    let s = String(u == null ? "" : u).trim().replace(/\\/g, "/");
    if (s.indexOf("./") === 0) s = s.slice(2);
    return s;
  }

  // 补默认值 + 按 url 去重（保留首次出现，重复项跳过并告警）。
  function normalizePages(pages) {
    const seen = Object.create(null);
    const out = [];
    (Array.isArray(pages) ? pages : []).forEach(function (p, i) {
      if (!p || typeof p !== "object") { console.warn("跳过非法注册项 #" + i); return; }
      const url = normalizeUrl(p.url);
      if (!url) { console.warn("跳过缺少 url 的注册项 #" + i); return; }
      if (seen[url] != null) {
        console.warn("跳过重复 url：" + url + "（#" + i + "，保留 #" + seen[url] + "）");
        return;
      }
      seen[url] = i;
      const createdAt = stamp(p.createdAt, nowStamp());
      out.push(Object.assign({}, p, {
        url: url,
        title: p.title || "未命名页面",
        description: p.description || "",
        category: p.category || "",
        emoji: p.emoji || "📄",
        tags: Array.isArray(p.tags) ? p.tags : [],
        status: p.status || "stable",
        pinned: p.pinned === true,
        thumbnail: p.thumbnail == null ? null : p.thumbnail,
        createdAt: createdAt,
        updatedAt: stamp(p.updatedAt, createdAt)
      }));
    });
    return out;
  }

  // 始终从 registry.json 获取最新配置（HTTP 层已用 cache:"no-store" 禁用缓存），
  // 不使用 localStorage 本地缓存，保证首页始终反映注册表的最新内容。
  async function load() {
    try {
      const res = await fetch(REGISTRY_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      // 生成带分类名称映射的展开数据，供渲染使用。
      const catMap = {};
      (data.categories || []).forEach(function (c) { catMap[c.id] = c.name; });
      const pages = normalizePages(data.pages).map(function (p) {
        return Object.assign({}, p, { categoryName: catMap[p.category] || p.category || "未分类" });
      });
      const payload = { site: data.site || {}, views: data.views || {}, categories: data.categories || [], pages: pages };
      return payload;
    } catch (err) {
      console.error("加载注册表失败", err);
      // 提供空的降级结构，避免页面白屏。
      return { site: { title: "AI 编程模型实验室", subtitle: "" }, views: {}, categories: [], pages: [] };
    }
  }

  window.Registry = {
    load: load,
    get url() { return REGISTRY_URL; }
  };
})();
