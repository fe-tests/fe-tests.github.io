# AI 编程模型实验室 · 门户站

一个用**原生代码**（HTML/CSS/JS）构建的静态门户站，用于长期展示「小参数 AI 编程模型」的网页效果。每个开发出的小页面都作为一张「卡片」注册到首页导航中。

## 目录结构

```
.
├── index.html          # 门户首页（导航/检索/卡片-列表切换）
├── registry.json       # ★ 页面注册表（首页唯一数据源）
├── assets/
│   ├── styles.css      # 全站样式（深色主题）
│   ├── registry.js     # 注册表加载器（fetch + 本地缓存）
│   └── app.js          # 首页渲染逻辑（筛选/搜索/排序）
├── examples/           # 每个已开发页面的存放目录
│   ├── hello-llm.html
│   ├── embedding-viz.html
│   └── token-counter.html
└── README.md           # 本文档
```

## 工作原理

1. **唯一数据源是 `registry.json`**。首页 `index.html` 只负责通过 `fetch("registry.json")` 读取注册表并渲染，不硬编码任何页面。
2. **新增页面 = 在 `registry.json` 的 `pages` 数组里追加一个对象**，并在 `examples/` 下放对应 HTML。
3. 首页刷新即生效，无需改动任何 JS/CSS。

## 注册表字段规范

字段全部为可选，除 `title`、`url` 外的属性缺省则有默认值。

| 字段 | 类型 | 必填 | 说明 | 默认 |
| --- | --- | --- | --- | --- |
| `id` | string | ✅ | 唯一标识，小写连字符，如 `hello-llm` | — |
| `title` | string | ✅ | 页面标题，展示在卡片/列表 | — |
| `description` | string | — | 一句话简介（≤60 字最佳） | `""` |
| `url` | string | ✅ | 页面相对路径，指向 `examples/xxx.html` | — |
| `category` | string | — | 分类 id，须与 `categories[].id` 一致 | `未分类` |
| `emoji` | string | — | 标注表情，建议 1 个（须为广泛支持的基础 emoji，见下方约束） | `📄` |
| `tags` | string[] | — | 标签，用于搜索命中 | `[]` |
| `status` | string | — | 状态：`stable`/`experimental`/`alpha` | `stable` |
| `pinned` | boolean | — | 是否置顶 | `false` |
| `thumbnail` | string \| null | — | 缩略图路径（预留） | `null` |
| `createdAt` | string | — | 创建日期 `YYYY-MM-DD` | 当前日期 |
| `updatedAt` | string | — | 更新日期 `YYYY-MM-DD` | 创建日期 |

> **Emoji 约束（务必遵守）**：只选用被主流平台广泛支持的基础 emoji（建议 Unicode ≤ 11，即 2018 年及以前发布的符号）。禁止使用过新的 emoji（如 🦤 鸭嘴兽、🫏 驴、🫎 麋鹿等 2022 年才加入的符号）——它们在部分旧设备/旧浏览器中会渲染为空框或「无法查看」。选不定时优先用 🐦 🚀 🧭 📐 🐣 📊 等经典符号。

状态颜色与含义：

- `stable` 🟢 稳定可点
- `experimental` 🟡 实验性
- `alpha` 🔴 开发中

`categories` 数组定义左侧/顶部的分类筛选标签；`site` 配置首页标题、副标题；`views` 控制默认视图与是否允许切换。

## 如何注册一个新页面（Agent 工作流）

1. 在 `examples/` 下创建 `your-demo.html`（原生代码，可用 `../index.html` 返回首页）。
2. 打开 `registry.json`，在 `pages` 末尾追加一个对象（保持逗号分隔、括号匹配）。
3. 复制 `examples/template.html` 作为新页面起点（见文末模板）。
4. 刷新首页，新页面即出现在导航中。

推荐最小对象：

```json
{
  "id": "my-demo",
  "title": "我的演示",
  "description": "用一句话说明这个页面展示什么。",
  "url": "examples/my-demo.html",
  "category": "experiment",
  "emoji": "🚀",
  "tags": ["demo"],
  "status": "experimental",
  "pinned": false,
  "thumbnail": null,
  "createdAt": "2025-01-01",
  "updatedAt": "2025-01-01"
}
```

## 首页功能

- **卡片 / 列表 双视图**：右上角 `▦ / ☰` 切换。
- **分类筛选**：顶部标签按 `categories` 过滤。
- **搜索**：按标题 / 描述 / 标签模糊匹配（150ms 防抖）。
- **排序**：置顶优先 / 最近更新 / 创建时间 / 标题。
- **状态徽标**：每张卡片右上角显示 `稳定 / 实验 / 开发中`。

## 页面模板

新建页面时复制 `examples/template.html`，其头部约定返回链接与原生结构，方便保持一致风格。
