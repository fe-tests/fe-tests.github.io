# AI 编程模型实验室 · 门户站

一个用**原生代码**（HTML/CSS/JS）构建的静态门户站，用于长期展示「小参数 AI 编程模型」的网页效果。每个开发出的小页面都作为一张「卡片」注册到首页导航中。

## 目录结构

```
.
├── index.html          # 门户首页（导航/检索/卡片-列表切换）
├── registry.json       # ★ 页面注册表（首页唯一数据源）
├── assets/
│   ├── styles.css      # 全站样式（深色主题）
│   ├── registry.js     # 注册表加载器（fetch + 默认值补全 + url 去重）
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

`url` 与 `title` 必填，其余字段缺省则由加载器补默认值。**去重键是 `url`**（不再使用 `id`）：`url` 归一化后（去 `./` 前缀、`\` 转 `/`）若重复，后出现的条目在加载时被跳过并在控制台告警。

| 字段 | 类型 | 必填 | 说明 | 默认 |
| --- | --- | --- | --- | --- |
| `title` | string | ✅ | 页面标题，展示在卡片/列表 | — |
| `description` | string | — | 一句话简介（≤60 字最佳） | `""` |
| `url` | string | ✅ | 页面相对路径，指向 `examples/xxx.html`；**唯一键，用于去重** | — |
| `category` | string | — | 分类 id，须与 `categories[].id` 一致 | `未分类` |
| `emoji` | string | — | 标注表情，建议 1 个（须为广泛支持的基础 emoji，见下方约束） | `📄` |
| `tags` | string[] | — | 标签，用于搜索命中 | `[]` |
| `status` | string | — | 状态：`stable`/`experimental`/`alpha` | `stable` |
| `pinned` | boolean | — | 是否置顶 | `false` |
| `thumbnail` | string \| null | — | 缩略图路径（预留） | `null` |
| `createdAt` | string | — | 创建时间 `YYYY-MM-DD HH:MM:SS`（取自对应 HTML 文件的创建时间）；仅写日期时自动补 `00:00:00` | 加载时的当前时间 |
| `updatedAt` | string | — | 更新时间 `YYYY-MM-DD HH:MM:SS`（取自对应 HTML 文件的修改时间）；仅写日期时自动补 `00:00:00` | `createdAt` |

> **日期由加载器补全**：`assets/registry.js` 在渲染前统一归一化日期，缺失即按上表补默认值，因此新注册页面可以完全不写 `createdAt` / `updatedAt`。

> **Emoji 约束（务必遵守）**：只选用被主流平台广泛支持的基础 emoji（建议 Unicode ≤ 11，即 2018 年及以前发布的符号）。禁止使用过新的 emoji（如 🦤 鸭嘴兽、🫏 驴、🫎 麋鹿等 2022 年才加入的符号）——它们在部分旧设备/旧浏览器中会渲染为空框或「无法查看」。选不定时优先用 🐦 🚀 🧭 📐 🐣 📊 等经典符号。

状态颜色与含义：

- `stable` 🟢 稳定可点
- `experimental` 🟡 实验性
- `alpha` 🔴 开发中

`categories` 数组定义左侧/顶部的分类筛选标签；`site` 配置首页标题、副标题；`views` 控制默认视图与是否允许切换。

## 如何注册一个新页面（Agent 工作流）

1. 在 `examples/` 下创建 `your-demo.html`（原生代码，返回链接统一写 `href="/"`，不要写 `../index.html`）。
2. 打开 `registry.json`，在 `pages` 末尾追加一个对象（保持逗号分隔、括号匹配；`url` 不可与已有条目重复）。
3. 复制 `examples/template.html` 作为新页面起点（见文末模板）。
4. 刷新首页，新页面即出现在导航中。

推荐最小对象：

```json
{
  "title": "我的演示",
  "description": "用一句话说明这个页面展示什么。",
  "url": "examples/my-demo.html",
  "category": "experiment",
  "emoji": "🚀",
  "tags": ["demo"],
  "status": "experimental",
  "pinned": false,
  "thumbnail": null,
  "createdAt": "2025-01-01 00:00:00",
  "updatedAt": "2025-01-01 00:00:00"
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

## 本地 / 局域网启动（Node，零依赖）

首页用 `fetch("registry.json")` 取数据，**必须走 HTTP**（直接双击 `index.html` 用 `file://` 打开会因跨域限制取不到注册表）。项目自带 `server.js`（只用 Node 内置模块，无需 `npm install`）：

```bash
node server.js              # 监听 0.0.0.0:8080，本机 + 局域网都能访问
node server.js --port=3000  # 换端口
node server.js --host=127.0.0.1   # 只允许本机访问
npm start                   # 等价于 node server.js
```

启动后终端会打印本机地址与**所有网卡的局域网地址**（形如 `http://192.168.1.23:8080/`），手机/平板/同事电脑在**同一 Wi-Fi（同网段）**下用该地址即可打开。

服务器行为：

- 目录自动映射到 `index.html`；越界路径（`../`）返回 403；未知路径返回 404 页。
- `*.html` 与 `registry.json` 用 `no-store`，改完注册表刷新首页即生效；其余静态资源缓存 5 分钟。
- 支持 `Range`（音频/大文件拖动播放）、`ETag/304`、`HEAD`。

**局域网访问不通时**（Windows 防火墙拦截入站连接），以管理员身份执行一次：

```powershell
netsh advfirewall firewall add rule name="node static 8080" dir=in action=allow protocol=TCP localport=8080
```

删除规则：`netsh advfirewall firewall delete rule name="node static 8080"`。
