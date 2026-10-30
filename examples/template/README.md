# {{EMOJI}} {{TITLE}}

> {{DESC}}

| 字段 | 值 |
| --- | --- |
| 分类 | {{CATEGORY_NAME}}（`{{CATEGORY}}`） |
| 状态 | `stable`（稳定；改状态只改 `registry.json`） |
| 标签 | {{TAGS}} |
| 入口 | `examples/{{SLUG}}/index.html` |
| 创建 / 更新 | {{CREATED}} / {{UPDATED}} |
| 注册项 | `registry.json` 中 `url = "examples/{{SLUG}}/index.html"` |

> 本文件由 `tools/new-page.js` 从 `examples/template/` 生成，**这是页面目录的规范样例**。
> 页面目录固定为：`index.html` + `README.md` + `docs/design.md` + `docs/devlog.md`，按需再加 `js/`、`css/`、`data/`。
> 模板文档里的双大括号占位符（如 slug、标题、分类、日期）由脚手架替换成实际值；落地后请把「待填写」的小节补全。
> 手工复制模板（不用脚手架）时，请自行替换全部双大括号占位符，并在 `registry.json` 追加注册条目。

## 打开方式

```bash
node server.js                                # 站点根目录执行，监听 0.0.0.0:39977（含局域网地址）
# 浏览器打开 http://localhost:39977/examples/{{SLUG}}/
```

拆分过代码（`type="module"`）的页面**必须**经 HTTP 访问（ES module 在 `file://` 下受 CORS 限制）；
纯单文件页面可 `file://` 直开，但首页要读 `registry.json`，同样得走 HTTP。

## 玩法 / 用法

- **待填写**：进入页面后的完整流程、按键与手势表、难度与规则细节、计分与结束条件、记录与存档说明。
- 这一节写给使用者看，实现细节放 `docs/design.md`。

## 实现概览

页面目录实际结构（生成后按实际文件增删行；未拆分的页面只保留第一行）：

| 文件 | 职责 |
| --- | --- |
| `index.html` | 骨架、首屏样式、启动流程 |
| `js/main.js` | 入口模块：装配各模块、启动循环 |
| `js/render.js` | 渲染层（Canvas / DOM / WebGL） |
| `js/state.js` | 数据与状态机 |
| `js/input.js` | 键鼠与触控输入 |
| `css/main.css` | 页面样式 |

- **待填写**：关键算法与数据结构（含代码注释锚点名，如 `ENGINE-START/END`）、渲染与更新循环、性能瓶颈与优化手段。

## 依赖

- **无外部依赖**：原生 HTML/CSS/JS，零构建、零 npm 包。
- 用到第三方库时改成本行格式：
  `- **<库> <版本>**（本地化资源）：`../../assets/vendor/<库>/<版本>/<文件>`，登记见 `assets/vendor/README.md``
  并在 `registry.json` 的 `tags` 里加运行时标签（如 `threejs`、`3d`）。
- 运行时特性（按需保留）：Canvas 2D / WebGL / 内联 SVG / Web Audio / localStorage / 移动端触控。

## 已知问题与限制

- **待填写**：已知的兼容性问题、边界条件、未实现项，以及「刻意不做」的部分与原因。

## 开发文档

- [docs/design.md](docs/design.md) —— 需求与设计：玩法/交互设计、数据与算法、渲染与 UI、关键取舍
- [docs/devlog.md](docs/devlog.md) —— 开发过程：里程碑、踩坑与解法、性能与兼容性记录

## 改这份页面时

- 改标题/简介/分类/标签/状态/置顶：只改 `registry.json` 对应条目，首页刷新即生效（`url` 是去重键，勿与其它条目重复）。
- 返回门户写 `href="/"`；引用顶级共享资源写 `../../assets/...`；页面自身文件写 `./js/...`、`./css/...`。
- 页面目录彼此自包含：除顶级 `assets/`（站点样式 + vendor）外，不引用其它页面目录的文件。
- 超过软上限（单文件 ~1200 行 / 单模块 ~800 行）就拆分，并在 `docs/devlog.md` 记一笔拆分原因与模块边界。
