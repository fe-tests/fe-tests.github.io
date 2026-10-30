# 第三方库本地化登记（`assets/vendor/`）

本站**运行时不引用外部 CDN**。页面需要的第三方运行时库（3D 引擎、物理/图表库等）一律下载入库到本目录，页面用**相对路径**引用。这样内网、离线、防火墙受限环境下都能打开，且已归档的展示页不会被 CDN 端升级打断。

## 目录布局

```
assets/vendor/
├── README.md                 # 本登记表（新增/删除依赖必须同步更新）
└── <库名>/<版本号>/<文件名>   # 例：three/r128/three.min.js
```

- 一个库一个目录，目录名用**小写库名**；库内**按版本号建子目录**（`r128`、`0.128.0` 等，取上游官方版本写法）。
- 版本目录即锁版本：同一库允许多版本共存（各自一个目录），但**同一页面只加载同一库的一个版本**。
- 禁止 `latest`、`master`、`next`、`^6.x` 之类浮动地址/目录。

## 登记表现行依赖

| 库 | 版本 | 本地路径 | 大小 | SHA-256 | 许可证 | 下载来源（下载日期） | 使用页面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Three.js | r128 | `three/r128/three.min.js` | 603,445 B | `9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2` | MIT | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`（2026-10-31，与 `https://unpkg.com/three@0.128.0/build/three.min.js` 逐字节一致） | `3d-shoot-game`、`solar-system-3d`、`mahjong-3d`、`rubik-3d` |

> 校验记录：`three.min.js` 内含 `const e="128"`（`THREE.REVISION === "128"`），与登记版本一致。

## 页面如何引用

页面入口位于 `examples/<slug>/index.html`，相对站点根的深度是 2，因此统一写：

```html
<!-- 依赖：Three.js r128（本地 ../../assets/vendor/three/r128/three.min.js） -->
<script src="../../assets/vendor/three/r128/three.min.js"></script>
```

- **写相对路径** `../../assets/vendor/...`，不要写 `/assets/...`：站点部署到项目子路径（如 GitHub/Gitee Pages 的子目录）时绝对路径会 404。
- 依赖脚本放在 `</body>` 前，不阻塞首屏；页面骨架与操作说明先渲染。
- 使用前必须探测：`if (typeof THREE === 'undefined') { 显示失败面板; return; }`。
- 失败面板文案写**本地路径**与修复方式（`node server.js` 走 HTTP、确认文件存在），不要再写 CDN 域名白名单。
- 3D 页面尽量提供非 WebGL 的降级视图（范例：`mahjong-3d` 的 `View2D`、`rubik-3d` 的 2D 展开图）。

## 新增依赖的流程

1. 确认原生实现代价确实过高（3D、图标字体、物理/图表引擎）；能程序化生成的素材（贴图、纹理、音效、关卡、字体子集）一律代码生成，不下载文件——参考 `examples/solar-system-3d/` 用 canvas + 值噪声生成行星贴图。
2. 按下述白名单顺序下载（前一个可用就不试后一个），**URL 写死版本号**：
   1. `https://cdnjs.cloudflare.com/ajax/libs/<lib>/<version>/<file>`
   2. `https://cdn.jsdelivr.net/npm/<pkg>@<version>/<file>`
   3. `https://unpkg.com/<pkg>@<version>/<file>`
3. **跨镜像校验**：至少两个镜像的 SHA-256 必须一致（`Get-FileHash` / `sha256sum`），只落单一来源的要在登记表注明「单一来源」。
4. 在上表登记：库、版本、本地路径、字节数、SHA-256、许可证、来源 URL 与下载日期、使用页面。
5. 页面侧：改 `<script src>` 为相对路径、页面脚本块头注释写依赖、`registry.json` 对应条目 `tags` 加运行时标签（如 `threejs`、`3d`）；**注册表不新增字段**。
6. 体积约束：单页未压缩依赖总量建议 ≤ 1 MB；单页依赖数建议 ≤ 3 个。

## 禁止事项

- 需要 API key / 鉴权的私有服务、统计埋点与广告脚本、把用户输入发往远端接口、自动播放的媒体。
- 把 vendor 库改造成「全站自动加载」（不在 `index.html` 或 `assets/app.js` 里注入依赖）：每个页面按需自己 `<script>`，缺库只影响这一页。
- 站点自有 JS/CSS（`assets/*.js`）`import` 页面目录内的文件；页面目录彼此自包含，`assets/` 是唯一的共享例外。

## 升级与删除

- **不追版**：已归档页面绑定它写明的版本目录；需要新版时新建 `<新版本号>/` 目录，由新页面选用，旧页面不动。
- 删除任一 vendor 文件前先 `grep` 全站引用（`examples/**` 与本页登记表），无引用才删；删除时同步删登记表行。
- `server.js` 对 `assets/**` 走 5 分钟缓存 + `ETag`（`*.html` 与 `registry.json` 才是 `no-store`），所以**替换同名文件请换版本目录名**，避免旧缓存。
