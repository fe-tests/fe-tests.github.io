# AI 编程模型实验室 · 门户站

一个用**原生代码**（HTML/CSS/JS）构建的静态门户站，用于长期展示「小参数 AI 编程模型」的网页效果。每个开发出的小页面都作为一张「卡片」注册到首页导航中。

全站**零依赖、零构建**：不装 npm 包、不打包、运行时不连任何外部 CDN。

- 每个页面是一个**独立目录**，入口固定为 `index.html`，页面说明写 `README.md`，开发过程与详情写 `docs/`（见《[页面目录规范](#页面目录规范)》）。
- 页面代码**鼓励合理拆分**（新页面按模块拆，历史页面不要求回炉），见《[代码拆分规范](#代码拆分规范)》。
- 页面确需第三方运行时（3D、物理、图表）时，**下载到顶级 `assets/vendor/` 入库**再引用，并自带降级方案，见《[第三方依赖本地化规范](#第三方依赖本地化规范)》。

## 目录结构

```
.
├── index.html              # 门户首页（导航 / 检索 / 卡片-列表切换）
├── registry.json           # ★ 页面注册表（首页唯一数据源）
├── server.js               # 零依赖静态服务器（Node 内置模块）
├── assets/
│   ├── styles.css          # 全站样式（深色主题，首页用）
│   ├── registry.js         # 注册表加载器（fetch + 默认值补全 + url 去重）
│   ├── app.js              # 首页渲染逻辑（筛选 / 搜索 / 排序）
│   └── vendor/             # ★ 第三方依赖本地化入库（含登记表 README.md）
│       ├── README.md       # 依赖登记表 + 下载校验流程 + 引用规范
│       └── three/r128/three.min.js
├── examples/
│   ├── template/           # ★ 新页面规范样例（脚手架从这里复制）
│   │   ├── index.html
│   │   ├── README.md
│   │   └── docs/{design.md, devlog.md}
│   └── <slug>/             # 每个页面一个目录，目录名 = slug
│       ├── index.html      # 入口（固定名）
│       ├── README.md       # 页面说明：玩法、实现概览、依赖、已知问题
│       ├── docs/           # 设计与开发过程
│       │   ├── design.md   # 需求与设计
│       │   └── devlog.md   # 开发过程记录
│       └── js/ css/ data/  # 可选：拆分出的模块 / 样式 / 数据
├── tools/
│   ├── new-page.js         # ★ 新页面脚手架（生成目录 + 追加注册条目）
│   └── migrate-to-dirs.js  # 一次性迁移脚本（2026-10 单页 → 目录化，仅留档）
└── README.md               # 本文档（开发标准）
```

## 工作原理

1. **唯一数据源是 `registry.json`**。首页只负责 `fetch("registry.json")` 并渲染，不硬编码任何页面。
2. **新增页面 = 建一个页面目录 + 在 `pages` 数组追加一个对象**，用脚手架两条都自动完成。
3. 首页刷新即生效，无需改动任何 JS/CSS。`server.js` 把目录 URL 自动映射到 `index.html`，
   `/examples/<slug>/` 与 `/examples/<slug>/index.html` 等价，注册表里写的是后者。

## 页面目录规范

**每个页面自成一个目录，目录名就是 slug（小写字母 + 数字 + 连字符）。**

| 文件 / 目录 | 必需 | 内容要求 |
| --- | --- | --- |
| `index.html` | ✅ | 页面入口，名字固定。头部注释写：页面名与 slug、依赖登记、文档索引 |
| `README.md` | ✅ | 给人读的页面说明：元数据表、打开方式、玩法/用法、实现概览、依赖、已知问题、改动指引 |
| `docs/design.md` | ✅ | 需求与设计：玩法/交互设计、数据与算法、渲染与 UI、关键取舍、边界限制 |
| `docs/devlog.md` | ✅ | 开发过程：里程碑（做了什么→为什么→结果）、踩坑与解法、性能与兼容性记录 |
| `js/` `css/` `data/` | — | 拆分出的模块 / 样式 / 数据，按需增加 |

规则：

- **返回门户统一写 `href="/"`**，不要写 `../index.html`。
- **引用顶级共享资源用相对路径 `../../assets/...`**（页面目录深度为 2）。站点自有样式在 `assets/styles.css`，第三方库在 `assets/vendor/<库>/<版本>/`。
  站点可能部署在子路径下（Gitee Pages），因此**不要写根绝对路径 `/assets/...`**；`href="/"` 是唯一例外（见《已知限制》）。
- **页面自身文件用 `./js/...`、`./css/...`**，只在本目录内解析。
- **页面目录彼此自包含**：除顶级 `assets/` 外，不引用其它页面目录的文件；页面之间不共享脚本，避免一处改动波及他页。
- 迁移过来的历史页面**保持单文件**（内容未拆），目录化只改变路径与文档；不要为了整齐去重写已验证过的页面。

## 代码拆分规范

新页面**鼓励合理拆分**，历史页面**不要求**拆分。

- 入口 `index.html` 只留骨架、首屏关键样式与启动流程；逻辑按职责拆到 `./js/*.js`（常用边界：`main` 装配、`state` 纯逻辑与状态机、`render` 渲染、`input` 输入、`audio` 音频），样式超约 300 行拆到 `./css/*.css`。
- 用 ES module：`<script type="module" src="./js/main.js"></script>`。**拆分后必须经 HTTP 访问**（`file://` 下模块受 CORS 限制打不开）。
- 纯逻辑段（规则、生成器、求解器）留在不碰 DOM 的模块里，并在入口用 `/* ENGINE-START */ … /* ENGINE-END */` 标出可抽离到 Node 校验的部分。
- 软上限（超了就该拆，不是硬性禁令）：单文件 ~1200 行、单模块 ~800 行、单函数 ~80 行。
- 拆分后在 `README.md` 的「实现概览」写清每个文件的职责，在 `docs/devlog.md` 记一笔拆分原因与模块边界。
- 单文件页面（< ~300 行）保持单文件同样合规，不必制造 `js/` 空壳。
- 脚手架 `node tools/new-page.js <slug> --split` 给出拆分起点（`js/{main,state,render,input}.js` + `css/main.css`）。

## 注册表字段规范

`url` 与 `title` 必填，其余字段缺省由加载器补默认值。**去重键是 `url`**（不用 `id`）：归一化后（去 `./` 前缀、`\` 转 `/`）重复的条目在加载时被跳过并在控制台告警。

| 字段 | 类型 | 必填 | 说明 | 默认 |
| --- | --- | --- | --- | --- |
| `title` | string | ✅ | 页面标题，展示在卡片/列表 | — |
| `description` | string | — | 一句话简介（≤60 字最佳） | `""` |
| `url` | string | ✅ | 页面入口路径，**写 `examples/<slug>/index.html`**；唯一键，用于去重 | — |
| `category` | string | — | 分类 id，须与 `categories[].id` 一致 | `未分类` |
| `emoji` | string | — | 标注表情，建议 1 个（须为广泛支持的基础 emoji，见下方约束） | `📄` |
| `tags` | string[] | — | 标签，用于搜索命中；建议含运行时标签（如 `canvas`、`threejs`、`3d`、`移动端`） | `[]` |
| `status` | string | — | 状态：`stable`/`experimental`/`alpha` | `stable` |
| `pinned` | boolean | — | 是否置顶 | `false` |
| `thumbnail` | string \| null | — | 缩略图路径（预留） | `null` |
| `createdAt` | string | — | 创建时间 `YYYY-MM-DD HH:MM:SS`（取自页面目录 `index.html` 的文件创建时间）；仅写日期时自动补 `00:00:00` | 加载时的当前时间 |
| `updatedAt` | string | — | 更新时间 `YYYY-MM-DD HH:MM:SS`（取自页面目录 `index.html` 的文件修改时间）；仅写日期时自动补 `00:00:00` | `createdAt` |

> **日期由加载器补全**：`assets/registry.js` 渲染前统一归一化日期，缺失即按上表补默认值。
> 手工写日期时取 `index.html` 的文件时间；脚手架自动取。已有条目的日期字面值是历史事实，**不要随代码改动而刷新**。

> **Emoji 约束（务必遵守）**：只选用被主流平台广泛支持的基础 emoji（建议 Unicode ≤ 11，即 2018 年及以前发布的符号）。禁止使用过新的 emoji（如 🦤 鸭嘴兽、🫏 驴、🫎 麋鹿等 2022 年才加入的符号）——它们在部分旧设备/旧浏览器中会渲染为空框或「无法查看」。选不定时优先用 🐦 🚀 🧭 📐 🐣 📊 等经典符号。

状态颜色与含义：

- `stable` 🟢 稳定可点
- `experimental` 🟡 实验性
- `alpha` 🔴 开发中

`categories` 数组定义左侧/顶部的分类筛选标签；`site` 配置首页标题、副标题；`views` 对象控制首页视图行为：

| 字段 | 类型 | 说明 | 默认 |
| --- | --- | --- | --- |
| `views.default` | `"card"` \| `"list"` | 首页初始视图 | `card` |
| `views.allowToggle` | boolean | 是否显示卡片/列表切换按钮；`false` 时隐藏切换 | `true` |
| `views.perPage` | number | 每页渲染数量，超出时首页显示「加载更多」按钮；`0` 或缺省表示不限量 | 不限量 |

注册表**不新增字段**：页面状态、依赖、拆分情况都写在页面目录的文档里，不写进注册表。

## 如何注册一个新页面（Agent 工作流）

**首选脚手架**（在站点根目录执行）：

```bash
node tools/new-page.js my-demo --title="我的演示" --desc="一句话说明这个页面展示什么" \
  --category=experiment --emoji="🚀" --tags=demo,canvas --status=experimental
# 加 --split 生成 js/ + css/ 拆分起点；加 --dry-run 只看计划不落盘
```

它会一次生成 `examples/my-demo/{index.html,README.md,docs/design.md,docs/devlog.md}`（模板占位符已替换），
并把注册条目按原格式追加到 `registry.json`（写前用 `JSON.parse` 校验，失败即中止）。之后：

1. 写页面逻辑，改 `index.html` 的标题与内容。
2. 补 `README.md` 的「玩法 / 用法」「实现概览」「已知问题」，补 `docs/design.md` 各节，`docs/devlog.md` 每完成一阶段追加一条。
3. 需要第三方库 → 按《第三方依赖本地化规范》入库并登记，页面用 `../../assets/vendor/...` 引用。
4. 刷新首页（`node server.js` 起服务后访问 `http://localhost:39977/`），确认卡片出现、链接可点。

手工流程（不用脚手架时）：复制 `examples/template/` 整个目录为 `examples/<slug>/`，替换文档里全部双大括号占位符，
再在 `registry.json` 的 `pages` 末尾追加对象（逗号分隔、括号匹配，`url` 不与已有条目重复）。推荐最小对象：

```json
{
  "title": "我的演示",
  "description": "用一句话说明这个页面展示什么。",
  "url": "examples/my-demo/index.html",
  "category": "experiment",
  "emoji": "🚀",
  "tags": ["demo", "canvas"],
  "status": "experimental",
  "pinned": false,
  "thumbnail": null
}
```

`createdAt` / `updatedAt` 可省略（加载器按 `index.html` 文件时间补）；要显式写就用文件时间字面值。

## 首页功能

- **卡片 / 列表 双视图**：右上角 `▦ / ☰` 切换。
- **分类筛选**：顶部标签按 `categories` 过滤。
- **搜索**：按标题 / 描述 / 标签模糊匹配（150ms 防抖）。
- **排序**：置顶优先 / 最近更新 / 创建时间 / 标题。
- **状态徽标**：每张卡片右上角显示 `稳定 / 实验 / 开发中`。

## 第三方依赖本地化规范

**运行时不引用外部 CDN**（`<script src="//cdnjs...">`、`https://unpkg...` 一律不要）。需要的库**下载进 `assets/vendor/`**，
好处是：内网 / 离线 / 防火墙受限环境下页面照常工作，且版本永远冻结在仓库里。

入库布局与登记表见 [assets/vendor/README.md](assets/vendor/README.md)。要点：

- **按库/版本分层**：`assets/vendor/<库>/<版本>/<文件>`，例如 `assets/vendor/three/r128/three.min.js`。同一库多版本并存，互不覆盖。
- **版本写死、不追版**：升级 = 新建版本目录并把页面引用改过去；`latest` 之类浮动概念在此不存在。
- **下载与校验**：从白名单镜像下载（优先级 `cdnjs.cloudflare.com` → `cdn.jsdelivr.net` → `unpkg.com`），
  并用另一个镜像**比对 sha256 与字节数**一致后入库；登记项记 sha256、体积、许可证、来源 URL、下载日期、使用页面。
- **页面引用**：相对路径 `../../assets/vendor/<库>/<版本>/<文件>`，放在 `</body>` 前，不阻塞首屏。
- **降级是硬性要求**（与 CDN 时代一致）：
  1. 使用前必须探测：`if (typeof THREE === 'undefined') { 显示失败面板; return; }`；
  2. 依赖缺失（文件被删、路径写错、`file://` 直开）时**不得白屏**，失败面板要写**本地路径**与修复指引（确认文件存在 / 用 `node server.js` 走 HTTP）；
  3. 3D 页面尽量提供**非 WebGL 的降级视图**（范例：`mahjong-3d` 的 `View2D`、`rubik-3d` 的 2D 展开图）；
  4. 图标优先 emoji 或内联 SVG；写了图标库类名就必须把它的 CSS 也入库，否则不要写类名。
- **素材优先程序化生成**（贴图、纹理、音效、关卡、字体子集）——范例：`solar-system-3d` 用 canvas + 值噪声生成行星贴图。
- 单页依赖建议 ≤ 3 个、入库总量 ≤ 1 MB；页面目录头注释 + `README.md` 的「依赖」小节都要写依赖与本地路径。
- **禁止**：需要 API key/鉴权的私有服务、统计埋点与广告脚本、把用户输入发往远端接口、自动播放的媒体。

已入库依赖（新增时同步更新 `assets/vendor/README.md` 与本表）：

| 库 | 版本 | 本地路径 | 使用页面 |
| --- | --- | --- | --- |
| Three.js | r128 | `assets/vendor/three/r128/three.min.js`（sha256 `9274bbce…1ce2`） | `3d-shoot-game`、`solar-system-3d`、`mahjong-3d`、`rubik-3d` |

## 本地 / 局域网启动（Node，零依赖）

首页用 `fetch("registry.json")` 取数据，**必须走 HTTP**（直接双击 `index.html` 用 `file://` 打开会因跨域限制取不到注册表）。项目自带 `server.js`（只用 Node 内置模块，无需 `npm install`）：

```bash
node server.js              # 监听 0.0.0.0:39977，本机 + 局域网都能访问
node server.js --port=3000  # 换端口
node server.js --host=127.0.0.1   # 只允许本机访问
npm start                   # 等价于 node server.js
```

启动后终端会打印本机地址与**所有网卡的局域网地址**（形如 `http://192.168.1.23:39977/`），手机/平板/同事电脑在**同一 Wi-Fi（同网段）**下用该地址即可打开。

服务器行为：

- **目录自动映射到 `index.html`**（`/examples/2048/` ≡ `/examples/2048/index.html`）；越界路径（`../`）返回 403；未知路径返回 404 页。
- `*.html` 与 `registry.json` 用 `no-store`，改完注册表刷新首页即生效；其余静态资源（含 `assets/vendor/**`）缓存 5 分钟 + `ETag`。
- 支持 `Range`（音频/大文件拖动播放）、`ETag/304`、`HEAD`；`.js` 以 `text/javascript` 提供，满足 `type="module"` 的 MIME 要求。
- 依赖已本地化，**局域网设备打开 3D 页不需要公网**；`server.js` 也不做任何代理。

**局域网访问不通时**（Windows 防火墙拦截入站连接），以管理员身份执行一次：

```powershell
netsh advfirewall firewall add rule name="node static 39977" dir=in action=allow protocol=TCP localport=39977
```

删除规则：`netsh advfirewall firewall delete rule name="node static 39977"`。

## 已知限制

- **子路径部署**：页面返回链接写 `href="/"`，在站点挂到子路径（如 Gitee Pages 的 `/username/`）下时会回到域名根。需要挂子路径部署时把首页与页面入口的返回链接改成相对形式。
- **`file://` 直开**：首页与所有注册页面都需 HTTP。单文件页面目录可 `file://` 直接打开 `index.html`，拆分过的页面（ES module）在 `file://` 下打不开。
- **旧链接无跳转**：单文件时代（`examples/<slug>.html`）的 URL 不做 `meta refresh` 兼容，站内唯一入口是首页注册表，历史外链不保证可达。
- **缓存**：`assets/vendor/**` 缓存 5 分钟，替换 vendor 文件时请换版本目录名（不要原地覆盖同名文件），否则最坏 5 分钟后生效。

## 结构迁移记录（2026-10）

- 25 个页面由 `examples/<slug>.html` 迁移为 `examples/<slug>/index.html`（`git mv`，页面内容未改），并补齐 `README.md` 与 `docs/{design.md,devlog.md}` 骨架（标 `待补充` 的小节需开发者补写）。
- `registry.json` 的 24 条 `url` 同步改为目录形式，其余字段（含日期字面值）保持不变；`examples/template/` 未注册，仅作为脚手架源。
- 迁移脚本 `tools/migrate-to-dirs.js` 留档：`--dry-run` 预览、`--force` 重建全部页面文档（默认跳过已存在文档，保护手写内容）。
