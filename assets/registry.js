/* registry.js — 加载站点注册表，提供全局 API。
 * Agent 或页面编辑 registry.json 后，首页无需改动即可反映新页面。
 */
(function () {
  const REGISTRY_URL = "registry.json";

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
      const enriched = (data.pages || []).map(function (p) {
        return Object.assign({}, p, { categoryName: catMap[p.category] || p.category || "未分类" });
      });
      const payload = { site: data.site || {}, views: data.views || {}, categories: data.categories || [], pages: enriched };
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
