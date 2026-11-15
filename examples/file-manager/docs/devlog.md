# 资源管理器 · 开发过程记录

> 约定：每完成一个阶段追加一条「做了什么 → 为什么 → 结果」；踩坑与解法单独成条，便于日后复用。
> 设计变更只改 [design.md](design.md)，这里记流水；两边都写清日期。

## 里程碑

| 日期 | 做了什么 | 为什么 | 结果 |
| --- | --- | --- | --- |
| 2026-11-15 10:45:16 | 用 `tools/new-page.js` 创建页面目录（`index.html` + `README.md` + `docs/`），并在 `registry.json` 追加条目 | 建立符合规范的骨架 | 页面可访问，注册表已追加条目 |
| 2026-11-15 11:00:00 | 写 `tools/build-fs-manifest.js`（BFS 扫描、跳过点文件/依赖目录/符号链接、深度与条数上限、本地时间戳）并生成 `data/files.json` | 纯前端虚拟文件树要求扁平清单，不改 `server.js`、不加目录列表接口 | 清单 259 条 / 26.9 KB，含 `count/generated/truncated` 自校验 |
| 2026-11-15 11:05:00 | 重写 `index.html`：iOS 导航条 + 大标题 + 面包屑 + 搜索框 + 工具栏 + 侧栏「位置/收藏/最近」+ 底部标签栏 + 浮层挂载点 | 与首页共用设计系统，页面 CSS 只管本页布局 | 骨架静态可访问（HTTP 200，5.7 KB） |
| 2026-11-15 11:10:00 | 写 `js/label.js`（命名 + 扩展名分类）、`js/api.js`（索引/排序/搜索/新鲜度/注册表回退）、`js/state.js`（偏好/收藏/最近/主题） | 把无 DOM 的纯逻辑与 DOM 渲染分开，便于 `node --check` 与后续校验 | 模块语法全部通过 `node --check`（复制成 `.mjs` 校验） |
| 2026-11-15 11:15:00 | 写 `js/render.js`、`js/preview.js`、`js/input.js`、`js/main.js` + `css/main.css`，接上清单 | 列表/图标双视图、预览浮层、hash 路由、长按菜单 | 三断点布局与预览链路可用；HTTP 冒烟全绿 |
| 2026-11-15 11:20:00 | 补齐 `README.md` 与本目录文档；首页 Dock 与注册表 `pinned` 联动 | 首页入口可达 + 规范齐全 | 文档中的命令与文件表与实际一致 |

## 踩坑与解法

- **ES module 的 Windows 语法校验** → 现象：`node --check js/main.js` 报 `SyntaxError: Unexpected token 'import'`；
  根因：`.js` 被 Node 当 CommonJS 解析；解法：把 `js/*.js` 复制成 `%TEMP%\fmcheck\*.mjs` 再 `node --check`（零依赖，不进仓库）；
  影响面：17 个共享/页面模块都纳入这条校验。
- **`import { init: initSheets }` 写错** → 现象：`Unexpected token ':'`；根因：解构重命名要用 `as`，不是 `:`；
  解法：改成 `import { init as initSheets }`；影响面：`main.js` 与 `preview.js` 的共享模块导入。
- **预览浮层头部重复** → 现象：文本预览里文件出现两个标题区；根因：`fill()` 内部又拼了一次 `bodyHead`，
  调用方也传了 `bodyHead`；解法：`fill()` 只负责追加「信息区」，正文由调用方给完整 HTML；影响面：预览渲染路径。
- **`[hidden]{display:none !important}` 吃掉 CSS 显示规则** → 现象：「位置」按钮在平板断点点不到；
  根因：站点样式里 `[hidden]` 是 `!important`，媒体查询里的 `display` 无法覆盖；
  解法：可见性完全交给 JS：`renderChrome()` 按 `state.wide`（`innerWidth>=1024`）设 `hidden`，
  并同步 `#fm-sidebar-close`；影响面：`index.html` 初始 `hidden` + `main.js` 维护 `state.wide`。
- **抽屉侧栏变成横向排列** → 现象：手机端侧栏条目并排一行；根因：`.fm-sidebar` 打开时 `display:flex` 但没有
  `flex-direction: column`；解法：基样式声明 `flex-direction:column`，`≥1024` 用 `display:block`；影响面：移动端与平板端侧栏。
- **副标题文件信息不显示** → 现象：预览文件的目录标题下没有大小；根因：`state.meta` 存的是「类型元数据」，
  代码用 `meta.t === "f"` 判断（该字段不存在）；解法：状态里加 `isFile` / `size` 两个显式字段；影响面：`main.js:navigate` + `render.js:stateStatusText`。
- **不存在的类名 `.ios-cell-label`** → 现象：信息面板与空列表的标签无样式；根因：设计系统只有 `.ios-cell` + `.ios-cell-value`；
  解法：页面 CSS 自带 `.fm-cell-label`，页面不新增/不改站点 CSS 类名；影响面：`render.js`、`preview.js`。
- **长按后紧接着触发一次点击** → 现象：菜单弹出后目标行又跳了一次；根因：`pointerup` 后浏览器补发 `click`；
  解法：`attachHold()` 在捕获阶段抑制 700ms 内的 `click`，位移 >10px / 滚动 取消计时；影响面：与首页图块长按同一手法。
- **清单路径过滤误判** → 现象：自检脚本报「没有 file-manager 条目」；根因：脚本用 `indexOf('file-manager')===0`
  匹配站点根相对路径（实际是 `examples/file-manager/...`）；解法：断言改为前缀 `examples/file-manager`；影响面：仅自检脚本。
- **越界请求的行为要看清**：`/..%2f..%2fserver.js` 返回 200 是**预期行为**（WHATWG URL 先归一 `..`，
  结果落在站点根内）；真越界（越出站点根）返回 403。记录在 README「已知问题与限制」，避免日后误判为漏洞。

## 性能与兼容性记录

- 入口体积：`index.html` 5.7 KB + `css/main.css` 9.8 KB + `js/*` 共约 60 KB（7 个模块）+ 清单 26.9 KB，
  共享层 `assets/styles.css` 28.5 KB + `assets/home/*` 约 70 KB（浏览器缓存复用首页）。
- 数据规模：清单 259 条 / 站点 27 个页面；建索引 + 排序 + 搜索在 4K 条目上限内为线性遍历，无瓶颈。
  目录渲染上限 500 条；文本预览上限 512 KB / 2000 行（超出直接给下载入口，避免长文本卡住浮层）。
- 冒烟测试（`node tmp-check-http.js`，站点根目录执行 `node server.js` 后）：
  `/`、`/registry.json`、`/examples/file-manager/`、`data/files.json`、`js/main.js`、`css/main.css`、
  `assets/{styles.css,registry.js,home/sheets.js,home/icons.js}`、`README.md`、`docs/design.md` 全 200 且 content-type 正确；
  `HEAD /` 200；`/nope.html` 404；目录（无 index.html）404（**无目录列表**）；
  `/` 与 `/registry.json` 返回 `Cache-Control: no-store`，静态资源 `public, max-age=300`。
- 语法校验：`examples/file-manager/js/*.js` 7 个模块 + `assets/home/*.js` 10 个模块 `node --check` 全通过。
- DOM 一致性自检：`tmp-check-dom.js` 扫 `getElementById("…")` 与 `index.html` 的 id（36 个）→ 0 缺失。
- 浏览器：本机 Chromium 内核（Chrome/Edge）+ 375×812 / 905×1024 / 1440×900 视口实测；
  深浅色三态（跟随系统 / 强制浅色 / 强制深色）与 `prefers-reduced-motion`、`forced-colors` 已加样式兜底；
  iOS Safari 的 `dvh`、`env(safe-area-inset-*)`、`backdrop-filter` 均有 `@supports`/回退。

## 拆分记录

| 日期 | 从哪拆到哪 | 触发原因（行数 / 职责混杂 / 复用） | 模块边界 |
| --- | --- | --- | --- |
| 2026-11-15 11:15:00 | 单文件脚本 → `js/{label,api,state,render,preview,input,main}.js` | 模板规范要求拆分；预览与交互体量增长 | `api/label/state` 无 DOM（纯逻辑，可 Node 校验）；`render/preview` 只写 DOM；`input` 只绑事件；`main` 只做装配与状态计算 |
| 2026-11-15 11:15:00 | 预览浮层 / 操作表 / 上下文菜单 / 提示条 → 复用 `assets/home/{sheets,icons,format}.js` | 与首页同一套浮层与图标，避免两份实现漂移 | 本页不复制这三个模块；三者成为受控依赖（README 已登记，改动需同步 `node --check`） |

## 提交历史

本页由脚手架创建于 2026-11-15 10:45:16。提交记录用下面命令自查并择要粘贴到里程碑表：

```bash
git log --date=format:'%Y-%m-%d %H:%M:%S' --format='%ad %h %s' -- examples/file-manager/
```
