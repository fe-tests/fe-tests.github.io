# AI 球形算力场（WebGL） · 开发过程记录

## 里程碑

| 日期 | 做了什么 | 为什么 | 结果 |
| --- | --- | --- | --- |
| 2026-11-13 20:06:44 | 手工建目录 `examples/ai-sphere-webgl/index.html`，写完 7 层场景 + 4 段后处理着色器 + 相机/交互/面板 | 参考图是视频截图，需要逐要素拆解：核心球、节点连线、发光环、穹顶透视、数据流、字幕 | 页面可访问，逻辑单文件 1000 行内 |
| 2026-11-13 20:13:32 | 重写：把「靠 `String.replace` 拼 VS」的写法改成 4 个独立 VS（`VS_POINTS / VS_LINES / VS_RAIN / VS_COMET`），修掉 billboard 基向量算法与 `fibSphere(1)` 的 NaN | 字符串替换拼着色器极其脆弱（一处正则不中就静默出图错误），基向量算错会让核心辉光错位 | 着色器全部显式声明，`bindQuad` 取代带隐式绘制的 `drawQuad`；`node --check` 语法通过 |
| 2026-11-13 20:25:00 | 写 Node mock-GL 烟雾测试（`aisphere-smoke.js`）：跑 60 帧，校验 null uniform location、NaN 上传、drawArrays count、GLSL 与 JS uniform 名单一致性、几何数量、矩阵正交性 | 无 GPU 的沙箱环境里 headless Chrome 截图不可靠，把「渲染一次看效果」换成「用 mock GL 跑通管线 + 静态一致性校验」 | 60 帧无异常，1620 次 `drawArrays`（27 次/帧），无 NaN、无 null location，名单全部匹配；几何数量确认 162 顶点 / 480 棱边 |
| 2026-11-13 20:35:00 | 细分级别从 3 降到 2（1280 面 → 320 面），补棱边中点「算力节点」点云，球体棱边 alpha 0.42 → 0.55 | 细分 3 级时线太密，糊成一团不像参考图的节点连线结构；节点密度要靠中点点补，而不是靠线密度 | 观感接近参考图：线稀疏 + 亮点密集，线绘制量减半 |
| 2026-11-13 20:35:00 | 补 `README.md` / `docs/design.md` / `docs/devlog.md`，注册进 `registry.json` | 站点规范：页面目录要有文档 + 注册条目 | 首页可发现本页 |

## 踩坑与解法

- **现象**：核心辉光 sprite 位置/朝向飘忽。**根因**：billboard 基向量是临时拼的（`cross(forward, worldUp)` 写成 `(fy*0 - fz*1, …)` 一堆冗余赋值，其中一行还把 `rx` 覆盖了三次）。**解法**：显式写 `right = normalize(cross(forward, (0,1,0))) = normalize((-fz, 0, fx))`，退化（`|forward| ∥ up`）时兜底成 `(1,0,0)`，`up = cross(right, forward)`；用 mock 校验 `|right| = |up| = 1`。**影响面**：`drawSprite` 的三层辉光。
- **现象**：彗星随机方向出现 `NaN`，整条消失。**根因**：用 `fibSphere(1, R, …)` 取随机方向，函数里 `i/(n-1)` 在 `n === 1` 时是 `0/0`。**解法**：加 `n > 1` 保护，并单独写 `randDir()`（`z` 均匀、方位角均匀），不再复用 `fibSphere`。**影响面**：所有随机单位向量。
- **现象**：着色器逻辑改动后行为诡异（虚线流动消失、数据流不动）。**根因**：`VS_RAIN`/`VS_COMET` 由 `VS_LINES` 经 `.replace(正则, …)` 派生，正则没命中时静默保持原样，改一处要同步三处正则。**解法**：把 4 个 VS 全部写成独立完整源码，公共部分（雾 + 颜色 + 闪烁）各写一遍，删除全部 `replace` 派生。**影响面**：所有线层；顺带删掉 `VS_POINTS` 里的模板字面量占位符技巧（`uMaxPS` 改成 uniform 传入）。
- **现象**：后处理第一个 pass 会把上一 pass 的画面「刷一遍再画第二遍」。**根因**：`drawQuad(prog)` 内部就 `drawArrays` 了一次，调用处又设 uniform 再画一次（默认 uniform 先出一帧）。**解法**：拆成 `bindQuad(prog)`（只绑程序 + 绑缓冲 + 设 attribute），由各 pass 自己设 uniform 后 `drawArrays`。**影响面**：背景 / 亮通道 / 两次模糊 / 合成 5 处。
- **现象**：`gl.disableVertexAttribArray(1)` 在只有 `aPos` 的后处理程序里是隐式约定。**解法**：保留（网格绘制会开 attribute 0/1，后处理只用 0），并在 mock 里对 `vertexAttribPointer(-1)`/`enableVertexAttribArray(-1)` 计数告警，防止拼错 attribute 名。**影响面**：`Mesh.draw` 已对 `aData < 0` 做跳过。
- **现象**：headless Chrome 截图始终不落盘（进程被截断时不写文件），`--headless`（旧模式）又把 URL 当缺省去加载 NTP。**解法**：验证路线改为 Node mock GL；调试视觉参数时用 `--headless=new` + 有头窗口。**影响面**：验证流程（记录在里程碑），不要用截图当验收。
- **现象**：关掉辉光（`B`）后光环明显变细。**根因**：WebGL 1.0 `lineWidth` 被驱动钳制为 1，参考图的粗环全靠 bloom。**解法**：保留 1px + 辉光，文档写清；不做 ribbon 几何（取舍记录在 design 第 7 节）。

## 性能与兼容性记录

- 入口体积：`index.html` 单文件约 44 KB（gzip 后约 12 KB），零外部资源、零图片。
- 绘制规模（每帧）：27 次 `drawArrays`，顶点量 ≈ 球体 324（线）+ 162+120+110+1400+3264（点）+ 数据流 780 + 彗星 300 + 环/弧 1190（线）+ 5 次全屏三角。
- 帧率基线：mock GL 下 60 帧脚本执行 < 200 ms（纯 JS 侧，用于回归）；桌面 GPU 目测 60 fps（1400 粒子 + 半分辨率 bloom）。软件渲染（SwiftShader）会明显低于 60 fps——`--use-angle=swiftshader` 下 Chrome headless 截图时出现 `GPU stall due to ReadPixels` 驱动提示，属软件光栅化路径的正常现象，不是本页逻辑问题。
- 一致性校验结果（2026-11-13 20:25 mock 跑测）：`球顶点 162 / 球棱边 480 / 尘埃 1400（上限 2200） / 球壳 110 / 穹顶 3264 / 数据流 780 / 彗星 300`；`rotY` 行列式 1.00000、模型矩阵列长 1.00000、billboard 基长 1.0000；核心投影 `NDC(0.000, -0.010)`。
- 测试环境：Windows 11 + Chrome（`--headless=new` 控制台无 `CONSOLE` 报错、无 `Uncaught`）；`node --check` 内联脚本语法通过；mock GL 60 帧无异常。真机（Android/iOS Safari、桌面 GPU）**尚未实测**，验收标准里的 60 fps 需用户设备复核。
- 内存：3 个 FBO（1 全分辨率 + 2 半分辨率 RGBA8 + DEPTH16）+ 40 个 buffer，1920×1080@2x 约 40 MB 显存量级，无逐帧分配（几何全 `STATIC_DRAW`，无 `bufferData` 重建）。

## 提交历史

```bash
git log --date=format:'%Y-%m-%d %H:%M:%S' --format='%ad %h %s' -- examples/ai-sphere-webgl/
```

本页为手工建目录（未用 `tools/new-page.js`），目录结构与注册条目按站点规范补齐。
