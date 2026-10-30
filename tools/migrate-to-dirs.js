#!/usr/bin/env node
/**
 * tools/migrate-to-dirs.js —— 一次性迁移脚本（2026-10-31「页面目录化」改造）
 *
 * 做什么：
 *   1. examples/<slug>.html        →  examples/<slug>/index.html   （git mv，内容不改）
 *   2. 为每个页面目录生成规范骨架：README.md + docs/design.md + docs/devlog.md
 *      内容取自 registry.json 的元数据 + 该文件路径的 git log 摘要 + 代码静态探测（依赖/降级/移动端）。
 *   3. registry.json 的 pages[].url：examples/<slug>.html → examples/<slug>/index.html
 *      其余字段（含 createdAt / updatedAt 字面值）一律不动。
 *
 * 用法：
 *   node tools/migrate-to-dirs.js --dry-run     # 只打印计划，不落盘
 *   node tools/migrate-to-dirs.js               # 执行迁移（幂等：已迁移的 slug 跳过改名）
 *   node tools/migrate-to-dirs.js --force       # 已存在 README/docs 时也重写（默认跳过，保护手写文档）
 *
 * 迁移完成后本脚本不再需要运行，保留在 tools/ 仅作改造过程记录。
 * 零依赖：只用 Node 内置 fs / path / child_process + 系统 git。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EX_DIR = path.join(ROOT, 'examples');
const REGISTRY = path.join(ROOT, 'registry.json');

const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const MIGRATION_DATE = '2026-10-31';

const CRLF = (s) => String(s).replace(/\r?\n/g, '\r\n');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const kb = (n) => (n / 1024).toFixed(1);
const STATUS_CN = { stable: '稳定', experimental: '实验', alpha: '开发中' };
const TODO = (t) => '> **待补充**（迁移时自动生成，请开发者填写）：' + t;

/* ------------------------------ git 辅助 ------------------------------ */
function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) return '';
  return r.stdout || '';
}

/** 按候选路径取提交历史：迁移前用旧路径，迁移后用新路径（--follow 跨改名）。 */
function gitLogAny(cands) {
  for (let i = 0; i < cands.length; i++) {
    const rows = gitLog(cands[i]);
    if (rows.length) return { rows: rows, path: cands[i] };
  }
  return { rows: [], path: cands[0] };
}

/** 取某个路径的提交历史，用于 devlog 的时间线。 */
function gitLog(oldRel) {
  const out = git(['log', '--follow', '--date=format:%Y-%m-%d %H:%M:%S', '--format=%ad|%h|%s', '--', oldRel]);
  return out.split('\n').filter((l) => l.indexOf('|') > 0).map((l) => {
    const a = l.indexOf('|');
    const b = l.indexOf('|', a + 1);
    return { date: l.slice(0, a), hash: l.slice(a + 1, b), subject: l.slice(b + 1) };
  });
}

/* --------------------------- 代码静态探测 --------------------------- */
/** 从页面源码里探测外部依赖、降级视图、移动端适配等，写进 README/设计文档。 */
function probe(html) {
  const srcs = [];
  const re = /<script[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    if (/^(https?:)?\/\//.test(u) || u.indexOf('./') === 0 || u.indexOf('../') === 0) srcs.push(u);
  }
  const styles = [];
  const reCss = /<link[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  while ((m = reCss.exec(html))) {
    const u = m[1];
    if (/\.css(\?|$)/i.test(u)) styles.push(u);
  }
  return {
    scripts: srcs,
    styles: styles,
    usesThree: /three(\.min)?\.js/i.test(html) || /\bTHREE\b/.test(html),
    threeLocal: /assets\/vendor\/three/i.test(html),
    has2dFallback: /View2D|2D 简版|2D 展开图|视图.*2D/.test(html),
    mobile: /移动端|触屏|touchstart|touchmove|ontouchstart/i.test(html),
    localStorage: /localStorage/i.test(html),
    webaudio: /AudioContext|webkitAudioContext/i.test(html),
    canvas: /getContext\(['"]2d/i.test(html),
    webgl: /WebGLRenderer|getContext\(['"]webgl/i.test(html),
    svg: /createElementNS\(['"]http:\/\/www\.w3\.org\/2000\/svg/i.test(html)
  };
}

/** 依赖小节（README 用）。 */
function depsSection(p, pr) {
  const lines = [];
  if (pr.scripts.length === 0 && pr.styles.length === 0) {
    lines.push('- **无外部依赖**：原生 HTML/CSS/JS，零构建、零 npm 包。');
  }
  pr.scripts.forEach((u) => {
    lines.push(u.indexOf('assets/vendor/') >= 0
      ? '- **Three.js r128**（本地化资源）：`' + u + '`，来源与校验登记见 [`assets/vendor/README.md`](../../assets/vendor/README.md)。'
      : '- 外部脚本：`' + u + '`（**未本地化**，按 `assets/vendor/README.md` 的流程下载入库）。');
  });
  pr.styles.forEach((u) => lines.push('- 外部样式：`' + u + '`。'));
  const tech = [];
  if (pr.webgl) tech.push('WebGL 渲染');
  if (pr.canvas) tech.push('Canvas 2D 渲染');
  if (pr.svg) tech.push('内联 SVG');
  if (pr.webaudio) tech.push('Web Audio 合成音色');
  if (pr.localStorage) tech.push('localStorage 存档/记录');
  if (tech.length) lines.push('- 运行时特性：' + tech.join('、') + '。');
  if (pr.has2dFallback) lines.push('- **降级视图**：3D 资源不可用 / 无 WebGL 时切到 2D 视图，核心逻辑仍可运行。');
  lines.push('- 页面目录自包含：除 `assets/vendor/` 的第三方运行时外，不引用其它页面目录的文件。');
  return lines.join('\n');
}

/* ------------------------------ 文档生成 ------------------------------ */
function readmeMd(p, pr, size) {
  const title = p.title;
  const tags = (p.tags || []);
  const rows = [
    '| 字段 | 值 |',
    '| --- | --- |',
    '| 分类 | ' + p.categoryName + '（`' + (p.category || '未分类') + '`） |',
    '| 状态 | `' + p.status + '`（' + (STATUS_CN[p.status] || p.status) + '） |',
    '| 标签 | ' + (tags.length ? tags.map((t) => '`#' + t + '`').join(' ') : '—') + ' |',
    '| 入口 | `examples/' + p.slug + '/index.html`（' + size + ' KB，单文件） |',
    '| 创建 / 更新 | ' + p.createdAt + ' / ' + p.updatedAt + ' |',
    '| 注册项 | `registry.json` 中 `url = "examples/' + p.slug + '/index.html"` |'
  ].join('\n');

  return [
    '# ' + (p.emoji || '📄') + ' ' + title,
    '',
    '> ' + (p.description || '（一句话简介待补充）'),
    '',
    rows,
    '',
    '## 打开方式',
    '',
    '站点根目录启动零依赖静态服务器，再用浏览器打开本页目录：',
    '',
    '```bash',
    'node server.js                                      # 监听 0.0.0.0:39977（含局域网地址）',
    '# 浏览器打开 http://localhost:39977/examples/' + p.slug + '/',
    '```',
    '',
    p.mobile
      ? '本页按**移动端优先**设计：触屏手势为主、键鼠为辅；竖屏/横屏与全屏表现见 [docs/design.md](docs/design.md) 的交互小节。'
      : '本页以桌面键鼠操作为主，移动端表现见 [docs/design.md](docs/design.md) 的交互小节。',
    '',
    '## 玩法 / 用法',
    '',
    TODO('把上面的简介展开成用户视角的完整说明：入口流程、按键与手势表、难度/规则细节、计分与结束条件、记录与存档。'),
    '',
    '## 实现概览',
    '',
    TODO('说明入口文件的内部结构与关键算法：模块分块（含注释锚点名，如 ENGINE-START/END）、主要数据结构、渲染与更新循环、性能瓶颈与优化手段。'),
    '',
    '## 依赖',
    '',
    depsSection(p, pr),
    '',
    '## 已知问题与限制',
    '',
    TODO('列出已知的兼容性/边界问题、未实现项、以及「刻意不做」的部分与原因。'),
    '',
    '## 开发文档',
    '',
    '- [docs/design.md](docs/design.md) —— 需求与设计：玩法/交互设计、数据与算法、UI 与适配、关键取舍',
    '- [docs/devlog.md](docs/devlog.md) —— 开发过程：里程碑、提交历史、踩坑与解法、性能与兼容性记录',
    '',
    '## 改这份页面时',
    '',
    '- 改标题/简介/分类/标签/状态：只改 `registry.json` 对应条目，首页刷新即生效。',
    '- 本页是**迁移过来的历史页面**：按规范不要求代码拆分，入口保持单文件 `index.html` 即可；后续若做大改，可把逻辑拆到 `js/`、样式拆到 `css/`，并在 devlog 记一笔。',
    '- 返回门户统一写 `href="/"`；引用顶级共享资源写相对路径 `../../assets/...`。',
    ''
  ].join('\n');
}

function designMd(p, pr) {
  return [
    '# ' + p.title + ' · 需求与设计',
    '',
    '> 本页于 ' + MIGRATION_DATE + ' 由 `examples/' + p.slug + '.html` 目录化迁移而来（内容未改）。',
    '> 下列骨架由注册表元数据与代码静态探测自动生成，**标 `待补充` 的小节需开发者补写**。',
    '',
    '## 1. 需求与目标',
    '',
    '- 一句话：' + (p.description || '（待补充）'),
    TODO('目标用户与场景、要展示的编程模型能力点、验收标准（做到什么程度算完成）。'),
    '',
    '## 2. 玩法 / 使用流程',
    '',
    TODO('从进入页面到结束/提交的完整流程（含首屏加载、引导、结算、再来一局/重置）。'),
    '',
    '## 3. 数据与算法',
    '',
    pr.usesThree
      ? '- 已知：依赖 Three.js r128 渲染，页面自身承担场景搭建、几何/纹理生成与更新循环。'
      : '- 已知：纯原生实现（' + (pr.canvas ? 'Canvas 2D' : pr.webgl ? 'WebGL' : 'DOM') + '），零依赖。',
    TODO('核心数据结构与编码约定（如牌种编码、坐标系、单位）、生成器/求解器思路与复杂度、随机数与可复现性（seed）、帧步进与时间处理。'),
    '',
    '## 4. 渲染与视图',
    '',
    pr.has2dFallback
      ? '- 已知：提供 **2D 降级视图**，3D 资源缺失或无 WebGL 时核心逻辑仍可运行（降级面板 + 手动/自动切换）。'
      : '- 已知：单一视图实现，无降级分支。',
    TODO('渲染分工（DOM / Canvas / WebGL / SVG）、纹理与素材的程序化生成、分辨率与缩放策略、UI 图层与 HUD 布局。'),
    '',
    '## 5. 交互与输入',
    '',
    p.mobile
      ? '- 已知：含**移动端触屏**支持（手势/摇杆类输入），桌面键鼠并行。'
      : '- 已知：以键盘/鼠标输入为主。',
    TODO('键位与手势对照表、输入冲突与锁定（指针锁定/焦点/长按）、误触保护与可访问性。'),
    '',
    '## 6. 状态与持久化',
    '',
    pr.localStorage
      ? '- 已知：使用 `localStorage` 保存记录/设置。'
      : '- 已知：无持久化（刷新即重置）。',
    TODO('状态机与存档结构、刷新/重开后的恢复策略、清理与版本兼容。'),
    '',
    '## 7. 关键取舍',
    '',
    TODO('为什么选这套做法、放弃的备选方案与原因、性能/体积/兼容性的折中点（例如为移动端牺牲的特效、为单文件性放弃的依赖）。'),
    '',
    '## 8. 边界与已知限制',
    '',
    TODO('边界条件（极端输入、超长文本、小屏、离线）、以及设计上不覆盖的范围。'),
    ''
  ].join('\n');
}

function devlogMd(p, log, size, logPath) {
  const rows = log.length
    ? ['| 时间 | 提交 | 说明 |', '| --- | --- | --- |'].concat(
        log.map((c) => '| ' + c.date + ' | `' + c.hash + '` | ' + c.subject.replace(/\|/g, '\\|') + ' |')
      ).join('\n')
    : '（`git log --follow` 未取到记录：可能是迁移前脚本在非常规仓库状态下运行）';

  return [
    '# ' + p.title + ' · 开发过程记录',
    '',
    '> 约定：每完成一个阶段就在这里追加一条「做了什么 → 为什么 → 结果」；踩坑与解法单独成条，便于日后复用。',
    '',
    '## 里程碑',
    '',
    TODO('按时间顺序补写关键节点：首版、玩法/算法成型、移动端适配、性能优化、重要修复。'),
    '',
    '## 提交历史',
    '',
    '取自 `git log --follow -- ' + logPath + '`（`git mv` 已记录改名，`--follow` 可跟踪到迁移前的提交）：',
    '',
    rows,
    '',
    '## 踩坑与解法',
    '',
    TODO('现象 → 根因 → 解法 → 影响面。重点记录：坐标系/单位换算、事件与手势冲突、Canvas/WebGL 兼容、音频自动播放策略、AI 判分等。'),
    '',
    '## 性能与兼容性记录',
    '',
    '- 入口体积：' + size + ' KB（单文件）。',
    TODO('帧率/内存基线（含移动端）、测试过的浏览器与设备清单、瓶颈定位与优化前后对比。'),
    '',
    '## 目录化迁移（' + MIGRATION_DATE + '）',
    '',
    '- `examples/' + p.slug + '.html` → `examples/' + p.slug + '/index.html`（`git mv` 改名，**内容未改动**）。',
    '- 新增 `README.md` 与 `docs/`；`registry.json` 的 `url` 同步改为 `examples/' + p.slug + '/index.html`。',
    '- 按新规范，历史页面**不要求**代码拆分，入口保持单文件。'
  ].concat(
    pr_three(p) ? [
      '- 同日：Three.js 依赖由协议相对 CDN 改为本地资源 `../../assets/vendor/three/r128/three.min.js`（登记见 `assets/vendor/README.md`）。'
    ] : []
  ).concat(['']).join('\n');
}

function pr_three(p) {
  return p.threeDep === true;
}

/* ------------------------------ 主流程 ------------------------------ */
function main() {
  const rawRegistry = fs.readFileSync(REGISTRY, 'utf8');
  const reg = JSON.parse(rawRegistry);
  const catName = {};
  (reg.categories || []).forEach((c) => { catName[c.id] = c.name; });
  const byUrl = {};
  (reg.pages || []).forEach((p) => {
    // 迁移前 url = examples/<slug>.html；迁移后 = examples/<slug>/index.html（也容忍目录形式 examples/<slug>/）
    const u = String(p.url || '').replace(/\\/g, '/').replace(/^\.\//, '');
    const m = /^examples\/([^/]+?)(?:\.html|\/index\.html|\/)?$/.exec(u);
    if (m) byUrl[m[1]] = p;
  });

  // 待处理页面：迁移前 = examples 根下的 *.html；迁移后（重跑 --force）= examples/<slug>/index.html
  const targets = [];
  fs.readdirSync(EX_DIR).forEach((name) => {
    const full = path.join(EX_DIR, name);
    const isDir = fs.statSync(full).isDirectory();
    if (!isDir && /\.html$/i.test(name)) {
      const slug = name.replace(/\.html$/i, '');
      targets.push({ slug: slug, srcFile: full, indexHtml: path.join(EX_DIR, slug, 'index.html') });
    } else if (isDir && fs.existsSync(path.join(full, 'index.html'))) {
      targets.push({ slug: name, srcFile: path.join(EX_DIR, name + '.html'), indexHtml: path.join(full, 'index.html') });
    }
  });
  targets.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  const plan = [];
  targets.forEach((t) => {
    const slug = t.slug;
    const srcFile = t.srcFile;
    const dir = path.join(EX_DIR, slug);
    const indexHtml = t.indexHtml;
    const entry = byUrl[slug];
    const srcPath = rel(srcFile);

    // 已迁移：跳过改名，文档默认不覆盖
    const moved = fs.existsSync(indexHtml);
    plan.push({ slug, srcPath, dir, indexHtml, moved });

    if (DRY) return;

    // 提交历史：迁移前取旧路径；已迁移（重跑 --force）时取新路径（--follow 跨改名）
    const lg = gitLogAny([srcPath, rel(indexHtml)]);
    const html = fs.readFileSync(moved ? indexHtml : srcFile, 'utf8');
    const pr = probe(html);
    const size = kb(fs.statSync(moved ? indexHtml : srcFile).size);
    const st = fs.statSync(moved ? indexHtml : srcFile);

    const p = {
      slug: slug,
      title: (entry && entry.title) || (slug === 'template' ? '页面模板（新页面起点）' : slug),
      description: (entry && entry.description) ||
        '复制本模板作为新页面起点：入口 `index.html` + `README.md` + `docs/`，允许按需拆分代码。',
      category: (entry && entry.category) || '',
      categoryName: (entry && catName[entry.category]) || (entry && entry.category) || '未注册',
      emoji: (entry && entry.emoji) || '📄',
      tags: (entry && entry.tags) || (slug === 'template' ? ['template'] : []),
      status: (entry && entry.status) || 'stable',
      createdAt: (entry && entry.createdAt) || stampOf(st.birthtime),
      updatedAt: (entry && entry.updatedAt) || stampOf(st.mtime),
      threeDep: pr.usesThree
    };

    p.mobile = pr.mobile || /移动端|触屏|mobile/i.test(p.tags.join(' '));
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });

    if (!moved) {
      // git mv 走文件系统改名：NTFS 保留 CreationTime，git 按 rename 记录历史
      const r = spawnSync('git', ['mv', srcPath, rel(indexHtml)], { cwd: ROOT, encoding: 'utf8' });
      if (r.status !== 0) {
        // 未跟踪文件（新增页）退回 fs.renameSync
        if (!/not under version control|fatal: not under version/i.test(String(r.stderr || ''))) {
          console.error('[migrate] git mv 失败：' + srcPath + '\n' + (r.stderr || r.stdout));
          process.exit(1);
        }
        fs.renameSync(srcFile, indexHtml);
      }
    }

    const docs = [
      ['README.md', readmeMd(p, pr, size)],
      [path.join('docs', 'design.md'), designMd(p, pr)],
      [path.join('docs', 'devlog.md'), devlogMd(p, lg.rows, size, lg.path)]
    ];
    docs.forEach((d) => {
      const target = path.join(dir, d[0]);
      if (fs.existsSync(target) && !FORCE) {
        console.log('  跳过已存在文档：' + rel(target));
        return;
      }
      fs.writeFileSync(target, CRLF(d[1]), 'utf8');
    });

    // 注册表 url 改写（文本级替换，保留原格式 / CRLF / 其它字段原样）
    if (entry) {
      const oldStr = '"url": "examples/' + slug + '.html"';
      const newStr = '"url": "examples/' + slug + '/index.html"';
      const cur = fs.readFileSync(REGISTRY, 'utf8');
      if (cur.indexOf(oldStr) >= 0) {
        fs.writeFileSync(REGISTRY, cur.split(oldStr).join(newStr), 'utf8');
      } else if (cur.indexOf(newStr) < 0) {
        console.warn('[migrate] 未在 registry.json 找到 url 字面量：' + oldStr + '（请手工核对）');
      }
    }
  });

  if (DRY) {
    console.log('DRY RUN：将迁移 ' + plan.length + ' 个页面目录');
    plan.forEach((it) => console.log('  ' + (it.moved ? '[已迁移，跳过改名] ' : '[git mv] ') + it.srcPath + ' → ' + rel(it.indexHtml) + '/README.md + /docs/{design.md,devlog.md}'));
    return;
  }

  // 结果校验
  const after = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const urls = after.pages.map((p) => p.url);
  const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
  const missing = urls.filter((u) => !fs.existsSync(path.join(ROOT, u)));
  const dirs = fs.readdirSync(EX_DIR).filter((d) => fs.statSync(path.join(EX_DIR, d)).isDirectory());
  const badDocs = dirs.filter((d) => {
    const need = ['index.html', 'README.md', path.join('docs', 'design.md'), path.join('docs', 'devlog.md')];
    return !need.every((n) => fs.existsSync(path.join(EX_DIR, d, n)));
  });
  const strayHtml = fs.readdirSync(EX_DIR).filter((f) => /\.html$/i.test(f));

  console.log('\n[migrate] 完成');
  console.log('  页面目录      : ' + dirs.length + ' 个');
  console.log('  注册条目      : ' + urls.length + ' 条（重复 ' + dup.length + '，文件缺失 ' + missing.length + '）');
  console.log('  文档不齐的目录: ' + (badDocs.length ? badDocs.join(', ') : '无'));
  console.log('  examples 根下散落的 html: ' + (strayHtml.length ? strayHtml.join(', ') : '无'));
  if (dup.length || missing.length || badDocs.length || strayHtml.length) {
    console.error('[migrate] 校验未通过，请检查上面的明细');
    process.exit(1);
  }
}

function stampOf(d) {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

main();
