# 📁 资源管理器

> 浏览站点目录树：目录导航、源码/文档/图片/音频预览（只读）

| 字段 | 值 |
| --- | --- |
| 分类 | 工具（`tool`） |
| 状态 | `stable`（稳定；改状态只改 `registry.json`） |
| 标签 | `#文件` `#目录` `#预览` `#iOS` |
| 入口 | `examples/file-manager/index.html` |
| 创建 / 更新 | 2026-11-15 10:45:16 / 2026-11-15 11:15:00 |
| 注册项 | `registry.json` 中 `url = "examples/file-manager/index.html"`（`pinned: true`） |

**首页显示名**：≥768px（PC / 平板）叫 **资源管理器**，<768px（手机）叫 **文件管理**，由
`js/label.js` 的 `appTitle(isNarrow)` 按视口切换；注册表里的 `title` 固定为「资源管理器」。

## 打开方式

```bash
node server.js                                # 站点根目录执行，监听 0.0.0.0:39977（含局域网地址）
# 浏览器打开 http://localhost:39977/examples/file-manager/
node tools/build-fs-manifest.js               # 生成/刷新本页面的目录清单 data/files.json
```

本页面拆了代码（`type="module"`），**必须**经 HTTP 访问（ES module 在 `file://` 下受 CORS 限制）。

## 玩法 / 用法

**进入 → 浏览 → 预览 → 打开源文件**：

1. 打开页面后自动读 `./data/files.json`，显示「站点根目录」的目录与文件（列表视图）。
2. **进目录**：点行（图标视图点图块）逐级进入；顶部面包屑点任意一层直接跳转；`上级` 按钮回上一层。
3. **看文件**：点文件弹出 iOS 风格的预览浮层（宽屏居中卡片，窄屏底部抽屉，可下拉关闭）：
   - 代码 / 文本 / Markdown：带行号预览（上限 512 KB、2000 行，超出给「下载」提示）；
   - 图片：内联显示（png/jpg/gif/webp/svg/ico）；
   - 音频：`<audio controls>`（mp3/wav/ogg 服务器已登记 MIME）；
   - HTML：沙箱 `iframe`（`sandbox="allow-scripts"`）内联预览；
   - PDF / 视频 / 压缩包 / 字体 / 二进制：显示信息面板 + 下载入口。
4. **搜索**：顶部搜索框（移动端点底部「搜索」标签），200ms 去抖，匹配整站清单里的文件名与完整路径，
   结果分「文件夹 / 文件」两段，最多 400 条。
5. **排序**：右上角排序按钮（键盘 `S`）弹操作表：文件夹优先 + 名称 A→Z（默认）/ 名称 Z→A / 修改时间 / 大小。
6. **视图**：右上角视图按钮（键盘 `L`）在「列表 ↔ 图标」间切换，选择记进 `localStorage`。
7. **收藏 / 最近**：在行或图块上长按（移动端）/ 右键（桌面）出上下文菜单 → 加入收藏；
   侧栏「收藏」「最近打开」可直接跳转，「最近」标签页列出最近打开与按 `mtime` 倒序的最近更改。
8. **深链**：地址栏 `#/examples/assets` 就是当前目录，前进/后退按钮可用，链接可分享。

按键一览（桌面）：`/` 或 `Ctrl/⌘+K` 聚焦搜索、`L` 切换视图、`S` 排序、`Esc` 关闭浮层/侧栏、
`Backspace` 或 `Alt+←` 返回上级目录。

只读设计：页面不提供重命名、删除、上传（`server.js` 只允许 `GET/HEAD`，静态托管也没有写接口）。

## 实现概览

页面目录实际结构：

| 文件 | 职责 |
| --- | --- |
| `index.html` | iOS 骨架：导航条 + 大标题、面包屑、搜索框、工具栏、侧栏、底部标签栏、浮层挂载点 |
| `css/main.css` | 页面布局：侧栏/抽屉、面包屑、图标网格、底部标签栏、预览浮层与代码查看器 |
| `js/main.js` | 入口：读清单 → 建索引 → 计算显示数据 → 渲染 → 动作表（导航/搜索/排序/视图/主题/刷新） |
| `js/label.js` | 命名（资源管理器 / 文件管理）、扩展名→类型分类、侧栏「位置」定义 |
| `js/api.js` | 清单读取、路径索引（`buildIndex`）、排序、全站搜索、最近更改、清单新鲜度、注册表回退树 |
| `js/state.js` | 偏好持久化（视图/排序）、最近打开、收藏、主题读写、迷你状态机 |
| `js/render.js` | DOM 渲染：侧栏、面包屑、列表/网格、提示条、页脚 |
| `js/preview.js` | 预览浮层：文本/代码、图片、音频、HTML 沙箱、二进制面板 |
| `js/input.js` | 全部交互绑定：侧栏、面包屑、列表、工具栏、搜索、标签栏、hash 路由、键盘、长按/右键 |
| `data/files.json` | 目录清单（由 `tools/build-fs-manifest.js` 生成，不手改） |

关键实现点：

- **虚拟文件树**：清单是扁平条目数组（`{p,t,m,s|n}`），前端按「父目录 = 路径去掉最后一段」在
  `buildIndex()` 里建 `childrenOf(dir)` 映射（`js/api.js:buildIndex`），没有目录列表 API。
- **站点根解析**：清单里的路径是站点根相对路径，预览/下载链接用
  `siteUrl()` 拼成 `/examples/x/assets/y.png`（逐段 `encodeURIComponent`，`js/api.js:siteUrl`）。
- **共享组件复用**：设计系统来自 `../../assets/styles.css`；浮层/操作表/上下文菜单/提示条复用
  `../../assets/home/sheets.js`，图标复用 `../../assets/home/icons.js`，格式化复用
  `../../assets/home/format.js`（`assets/` 是站点唯一共享目录，页面目录之间互不引用）。
- **深浅色**：读首页的 `iosHome.settings.v1` 的 `theme` 键（`auto|light|dark`），
  页面内主题按钮循环切换，只覆盖这一个键，不动首页其它设置。
- **回退**：`data/files.json` 缺失/损坏时，用 `../../assets/registry.js` 的注册表页面 URL 造一棵
  目录树继续可用，并给黄色提示条说明回退原因。

## 依赖

- **无外部依赖**：原生 HTML/CSS/JS，零构建、零 npm 包；内联 SVG 图标（共享模块）。
- 运行时特性：`fetch`（读清单与文本）、`history.pushState`/`hashchange` 路由、`localStorage`、
  `Pointer Events` 长按、`navigator.clipboard`（降级 `execCommand`）、`matchMedia` 断点。

## 已知问题与限制

- **清单要手动重建**：`node tools/build-fs-manifest.js` 在本地生成 `data/files.json`；
  页面打开时读的是这份快照，新增/删除文件不会自动反映。清单超过 7 天会给提示条。
- **只读**：无重命名/删除/上传/新建；上下文菜单里的「下载」依赖浏览器下载行为（跨域站点不生效）。
- **MIME 缺口**：`server.js` 的 MIME 表没有 `mp4/webm/mov/pdf/zip` 等，视频与 PDF 内联预览大概率不工作
  （预览面板已给提示，请用「新窗口打开」或「下载」）。
- **服务器越界行为**：`resolveFile()` 会先把 URL 路径的 `..` 归一到站点根，
  因此编码过的 `../..` 变成「站点根内的路径」，真正的越界请求返回 403；本页面只读站点根内文件。
- 大目录截断显示前 500 条（`js/main.js:DIR_CAP`），单目录更多时用搜索定位。
- Markdown 只显示纯文本（站点不引入渲染器）；代码不做语法高亮（零依赖约束）。
- 清单跳过点文件、`.git`、`node_modules`、构建产物与符号链接，这些在页面里看不到。
- 刻意不做：多标签页、拖拽移动文件、批量选择、缩略图缓存（移动端文件 App 的完整功能集）。

## 开发文档

- [docs/design.md](docs/design.md) —— 需求与设计：布局与断点、数据与索引、预览策略、关键取舍
- [docs/devlog.md](docs/devlog.md) —— 开发过程：里程碑、踩坑与解法、兼容性记录

## 改这份页面时

- 改标题/简介/分类/标签/状态/置顶：只改 `registry.json` 对应条目，首页刷新即生效（`url` 是去重键，勿与其它条目重复）。
- 返回门户写 `href="/"`；引用顶级共享资源写 `../../assets/...`；页面自身文件写 `./js/...`、`./css/...`。
- 目录清单改动后请重跑 `node tools/build-fs-manifest.js`（提交 `data/files.json`，不要手改它）。
- 页面目录彼此自包含：除顶级 `assets/`（站点样式 + 首页共享模块 + vendor）外，不引用其它页面目录的文件。
- 超过软上限（单文件 ~1200 行 / 单模块 ~800 行）就拆分，并在 `docs/devlog.md` 记一笔拆分原因与模块边界。
