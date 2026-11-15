# 资源管理器 · 需求与设计

> 首页 iOS 风格改版的新增页面：站点目录树只读浏览器。过程流水见 [devlog.md](devlog.md)。

## 1. 需求与目标

- 一句话：浏览站点目录树：目录导航、源码/文档/图片/音频预览（只读）。
- 目标用户与场景：站点作者/审阅者在**手机**（iPhone Safari）与 **PC**（Chrome/Edge）上查看
  「这个仓库里有什么、某个页面的源码在哪」，并在手机上直接看源码、看图片、听音频示例。
  它是首页 iOS 改版的一部分，用来验证共享设计系统 `assets/styles.css` 在真实页面上的可复用性。
- 验收标准（可测条目）：
  1. 手机 375×812：能进目录、搜索、看代码（带行号）、看图片，且底部标签栏与抽屉不遮挡内容；
  2. 平板 905×1024 与 PC 1440×900：侧栏「位置」常驻（PC）/ 抽屉（平板），面包屑可用；
  3. `<768px` 显示名是「文件管理」，`≥768px` 是「资源管理器」（刷新后随窗口宽度切换即时生效）；
  4. `data/files.json` 缺失时页面不白屏：用注册表回退树 + 明确提示；
  5. 深浅色跟随系统且可手动切换，切换与首页联动（同一浏览器两个页面主题一致）；
  6. 全站无写操作请求（Network 面板里只有 GET），`server.js` 与 `package.json` 未改动。
- 非目标（明确不做）：重命名/删除/上传/新建（服务器只允许 GET/HEAD，静态托管没有写接口）；
  语法高亮、Markdown 渲染、缩略图缓存、批量操作、zip 解压预览。

## 2. 玩法 / 使用流程

`idle(读清单) → browse(目录) → preview(浮层) → 外部打开(新窗口/下载)`，三条平行入口：搜索、最近、收藏。

1. 进入：`fetch('./data/files.json', {cache:'no-store'})` → 建索引 → 显示站点根目录（列表视图）。
   地址栏带 `#/examples/assets` 之类锚点时直接定位到该目录。
2. 浏览：点目录行/图块 → 进入；面包屑、`上级` 按钮、`Alt+←`/`Backspace` 向上；侧栏「位置」横向跳转。
3. 预览：点文件 → 浮层（宽屏卡片 / 窄屏抽屉，下拉关闭、`Esc` 关闭）；底部动作：新窗口打开、下载、复制路径、收藏、打开所在目录。
4. 搜索：输入 200ms 去抖 → 全清单匹配（名 + 路径，多词 AND）→ 结果分「文件夹 / 文件」。
5. 最近：打开过的文件进 `fm.recent.v1`（最多 24 条）；「最近」标签额外给 `mtime` 倒序的最近更改。
6. 收藏：长按/右键 → 加入收藏，写 `fm.favorites.v1`（最多 24 条），侧栏可跳转、菜单可取消。
7. 刷新：右上角刷新按钮重新读清单（清单是本地快照，见 §8）。

## 3. 数据与算法

- **清单编码**（`tools/build-fs-manifest.js` 产出，不手改）：
  `{generated, root, count, truncated, entries:[{p,t,s|m,s|n}]}`；`p` 是**站点根相对路径**，
  `t` 为 `f`/`d`，文件带字节数 `s`，目录带直接子项数 `n`，`m` 是**本地时区**的
  `YYYY-MM-DD HH:MM:SS`（与 `registry.json` 同一约定，不做 UTC 转换）。
  扫描跳过点文件、`.git/node_modules/dist/out/.next/.svn/.idea/.vscode`、符号链接，
  深度 ≤8、单目录 ≤1000、总条目 ≤4000、总量 ≤400 KB（超限 `truncated:true`）。
- **虚拟文件树**：扁平条目 → `buildIndex()`（`js/api.js`）：`byPath: Map` + `children: Map<dir, entry[]>`，
  判断「某目录的直接子项」用 `parentOf(entry.p) === dir`；因此无需目录列表接口。
  路径消毒在 `js/main.js:normalizePath()`：去前导 `/`、折叠 `.`/`..`，越界路径弹提示并回退到最近的祖先目录。
- **排序**：`sortEntries(list, sort, groupDirs)`，默认「目录在前 + 名称 A→Z」（iOS 文件 App 行为），
  `localeCompare(..., "zh", {numeric:true})` 让 `2` 排在 `10` 前。
- **搜索**：遍历 `byPath` 全表（约 260 条，量级很小），多词 AND 包含匹配，目录取前 80 条 + 文件补足到 400 条。
- **最近更改**：`recentFiles()` 按 `m` 字符串倒序（本地时间戳格式定长，字典序即时间序）。
- **新鲜度**：`ageDays(generated)` 解析本地戳与当前时间比较，≥7 天提示重建。
- 纯逻辑集中在 `js/api.js`（无 DOM），可用 Node 直接 `import` 做校验；
  代码里的锚点：`js/api.js:buildIndex`、`js/api.js:searchAll`、`js/main.js:normalizePath`、`js/main.js:compute`。

## 4. 渲染与视图

- 渲染分工：**全部 DOM**（无 Canvas/WebGL）；图标是内联 SVG（共享 `assets/home/icons.js`）；
  目录图标用「渐变方块 + 白色 SF 风格图标」，与首页图块同一套令牌 `--g-{file,tool,model,game,…}`。
- 视图两套：`列表`（iOS `Grouped List` 分组：文件夹段 + 文件段）与 `图标`（自动填充网格）。
- 断点（与首页一致）：
  - `<768px`（手机）：隐藏侧栏，导航条出现「位置」按钮 → 抽屉式侧栏（`fm-sidebar-open` + 遮罩）；
    底部标签栏（浏览 / 最近 / 搜索 / 门户）常驻，含 `env(safe-area-inset-bottom)`；
  - `768–1023px`（平板）：与手机同一套标签栏 + 抽屉侧栏，网格列数更宽，字号更大；
  - `≥1024px`（PC）：`grid-template-columns: 260px 1fr` 常驻侧栏，隐藏底部标签栏与抽屉按钮。
- 预览浮层复用首页的 `sheets.js`：窄屏 `.ios-drawer`（可下拉关闭），宽屏 `.ios-card-modal`，
  带焦点陷阱、`Esc`、遮罩点击关闭、`body[data-modal=open]` 滚动锁。
- 代码查看器：`.fm-pre` 每行 `行号 + 内容`，`white-space:pre-wrap` + `overflow-wrap:anywhere`，
  `font-variant-numeric: tabular-nums`；只读渲染（先 `escapeHtml` 再插入）。
- 无 Canvas/DPR 相关处理；缩放依赖 CSS 流式布局；打印样式隐藏导航/侧栏/标签栏。

## 5. 交互与输入

| 场景 | 手机 | PC |
| --- | --- | --- |
| 进目录 | 点行/图块 | 点行/图块、单击 |
| 上下文菜单（预览/新窗口/下载/复制/收藏/打开所在目录） | 长按 480ms（`navigator.vibrate` 无，交由系统） | 右键 |
| 侧栏「位置」 | 导航条按钮 → 抽屉；点条目后自动关闭 | 常驻侧栏 |
| 预览关闭 | 下拉抽屉 / `关闭` / 点遮罩 | `Esc` / 点遮罩 |
| 搜索 | 底部「搜索」标签聚焦输入框 | `/` 或 `Ctrl/⌘+K` |
| 视图 / 排序 | 导航条按钮 | `L` / `S` |
| 返回上级 | 面包屑 / `上级` | `Backspace`、`Alt+←` |

- 长按实现：`pointerdown` 计时 480ms + 位移 >10px 取消 + `scroll` 取消 + `click` 捕获阶段抑制（`js/input.js:attachHold`），
  与首页图块长按同一手法；`contextmenu` 事件在桌面直接出菜单。
- 焦点管理：全部按钮/链接是原生可聚焦元素；浮层焦点由 `sheets.js` 收敛；`Esc` 优先关浮层，再关抽屉，再退出输入框。
- 可访问性：`aria-label`（位置/排序/视图/刷新/搜索/标签栏）、`aria-current="location"`（当前位置）、
  `role="status"` 计数与提示条、`prefers-reduced-motion` 去动效、`forced-colors` 给面包屑/标签/代码框描边。
- 误触保护：长按后的 700ms 内抑制 click；只读操作不会触发不可逆动作。

## 6. 状态与持久化

| 键 | 内容 | 说明 |
| --- | --- | --- |
| `fm.view.v1` | `{view, sort, groupDirs}` | 视图与排序偏好 |
| `fm.recent.v1` | 最近打开路径数组（≤24） | 「最近打开」列表与侧栏 |
| `fm.favorites.v1` | 收藏路径数组（≤24） | 侧栏收藏 |
| `iosHome.settings.v1` | 只读写 `theme` 一个键 | 与首页共用主题；页面主题按钮只覆盖该键 |

- 目录状态（当前目录）不进 `localStorage`：用 URL `#/path` 承载，可分享、可前进后退，
  `history.pushState` + `hashchange` + `popstate` 双入口在 `js/input.js` 绑定，`js/main.js:navigate()` 统一处理。
- 所有读取都是 `try/catch` + 类型校验，键损坏时回落到默认值（`js/state.js:loadPrefs`）。
- 清理方式：删 `localStorage` 键即回到默认；页面不提供「清空数据」（避免误删首页设置）。

## 7. 关键取舍

- **纯前端虚拟文件树**（用户明确选择）：不新增目录列表 API、不改 `server.js`。
  代价：清单是快照，需要本地跑一次 `node tools/build-fs-manifest.js`；换来零后端接口、静态托管可直接用。
- **复用首页共享模块**（`assets/home/{icons,format,sheets}.js`）而不是页面自带一份：
  浮层/操作表/上下文菜单/提示条/图标与首页完全一致，体积小、行为一致；
  代价是首页这三模块成为本页面的依赖（本页 README 已登记，`node --check` 同步校验）。
- **不引入虚拟列表/分页**：站点条目 ~260 条，直接渲染整目录（上限 500 条）比虚拟化简单可靠；
  首页 springboard 也同理（每页 ≤24 图块 + `显示更多`）。
- **主题与首页联动**：不为本页单建一套主题键，避免「同一浏览器两个页面深浅色不一致」。
- **HTML 预览用 `srcdoc` 沙箱**（`sandbox="allow-scripts"`）：比 `iframe src=真实页面` 更稳（相对资源不受当前目录影响），
  脚本只在沙箱里跑；完整体验交回给「新窗口打开」。
- **不做语法高亮**：零依赖约束下自写高亮成本高、体积大；行号 + 等宽 + 复制路径已够用。
- 首页改版的一处偏差（一并记录）：**首页底部不放 tab bar**，移动端用 Dock，底部标签栏属于本页（文件 App 语义），
  计划里的「只渲染当前页」也简化为「一次渲染全部分页」。

## 8. 边界与已知限制

- 清单缺失/损坏 → 注册表回退树（只有页面目录，没有全部源码），提示条说明原因与重建命令。
- 清单过期（>7 天）→ 提示条，不阻断浏览；`truncated:true` → 提示「只显示前一部分」。
- 单目录 >500 条只取前 500 条（`DIR_CAP`）；超长文件名靠 CSS 截断，预览信息面板显示完整路径。
- 大文件（>512 KB）不内联预览；>2000 行只渲染前 2000 行；二进制（含 `\u0000`）自动转信息面板。
- 视频/PDF/压缩格式受 `server.js` MIME 表限制（无 mp4/webm/pdf/zip），提示改用下载/新窗口。
- 越界：编码过的 `../..` 会先被归一到站点根，页面侧再做一次路径消毒，最坏结果是「站点根内的某个路径」；
  服务器对真越界返回 403。
- 剪贴板 API 在非安全上下文（局域网 `http://192.168.x.x`）不可用 → 降级 `execCommand`，失败时提示手动复制。
- 离线（`file://`）不可用：ES module + `fetch` 都要 HTTP；页面顶部 `noscript`/离线提示。
- 低端机（首代 iPhone SE 级别）：条目少，全量 DOM 渲染无压力；无虚拟列表是有意取舍。
