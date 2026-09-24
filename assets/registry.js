/* registry.js — 加载站点注册表，提供全局 API。
 * Agent 或页面编辑 registry.json 后，首页无需改动即可反映新页面。
 */
(function () {
  const REGISTRY_URL = "registry.json";
  const cacheKey = "ai-code-lab:registry";

  async function load() {
    try {
      const res = await fetch(REGISTRY_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      // 缓存一份带分类名称映射的展开数据，供渲染使用。
      const catMap = {};
      (data.categories || []).forEach(function (c) { catMap[c.id] = c.name; });
      const enriched = (data.pages || []).map(function (p) {
        return Object.assign({}, p, { categoryName: catMap[p.category] || p.category || "未分类" });
      });
      const payload = { site: data.site || {}, views: data.views || {}, categories: data.categories || [], pages: enriched };
      localStorage.setItem(cacheKey, JSON.stringify(payload));
      return payload;
    } catch (err) {
      console.error("加载注册表失败", err);
      // 提供空的降级结构，避免页面白屏。
      return { site: { title: "AI 编程模型实验室", subtitle: "" }, views: {}, categories: [], pages: [] };
    }
  }

  // 首次同步可用缓存；否则异步加载并 resolve。
  function cached() {
    try { return JSON.parse(localStorage.getItem(cacheKey)); } catch (e) { return null; }
  }

  window.Registry = {
    load: load,
    cached: cached,
    get url() { return REGISTRY_URL; }
  };
})();
