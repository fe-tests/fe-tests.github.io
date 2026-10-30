#!/usr/bin/env node
/**
 * tools/new-page.js —— 新页面脚手架（零依赖）
 *
 * 按《页面目录规范》一次生成一个新页面目录，并把注册条目追加进 registry.json：
 *   examples/<slug>/
 *     ├── index.html          入口（模板骨架，已替换标题/表情/头部注释）
 *     ├── README.md           页面说明（由 examples/template/README.md 生成）
 *     ├── docs/design.md      需求与设计
 *     ├── docs/devlog.md      开发过程记录
 *     └── js/ css/            仅 --split 时生成（模块拆分起点）
 *
 * 用法：
 *   node tools/new-page.js <slug> [选项]
 *     --title="标题"        缺省 = slug
 *     --desc="一句话简介"   写进 README 与注册表 description
 *     --category=game       须是 registry.json categories[].id（model/tool/experiment/game）
 *     --emoji="🚀"          只用广泛支持的基础 emoji（建议 Unicode ≤ 11）
 *     --tags=canvas,game    逗号分隔
 *     --status=stable       stable | experimental | alpha
 *     --split               生成 js/ + css/ 拆分起点（入口改用 type="module"）
 *     --dry-run             只打印计划
 *
 * 约束：<slug> 必须 [a-z][a-z0-9-]{1,31}，且不得与已有页面目录 / 注册 url 重复。
 * 注册表按文本插入（保留原格式与 CRLF），写入前用 JSON.parse 校验，失败即中止。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(ROOT, 'registry.json');
const TPL_DIR = path.join(ROOT, 'examples', 'template');
const EX_DIR = path.join(ROOT, 'examples');

/* ------------------------------ 参数解析 ------------------------------ */
const argv = process.argv.slice(2);
const flagOf = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).replace(/^["']|["']$/g, '') : def;
};
const hasFlag = (name) => argv.indexOf(`--${name}`) >= 0;
const positional = argv.filter((a) => !a.startsWith('--'))[0];

const DRY = hasFlag('dry-run');
const SPLIT = hasFlag('split');
const SLUG = String(positional || '').trim();

function die(msg) {
  console.error('[new-page] ' + msg);
  process.exit(1);
}

if (!SLUG) die('缺少 slug。用法：node tools/new-page.js <slug> [--title= --desc= --category= --emoji= --tags= --status=] [--split]');
if (!/^[a-z][a-z0-9-]{1,31}$/.test(SLUG)) die('非法 slug：' + SLUG + '（要求小写字母开头，仅 a-z 0-9 -，长度 2~32）');
if (SLUG === 'template') die('template 是模板目录名，请换一个 slug');

/* ------------------------------ 注册表读取 ------------------------------ */
const regText = fs.readFileSync(REGISTRY, 'utf8');
let reg;
try {
  reg = JSON.parse(regText);
} catch (e) {
  die('registry.json 解析失败，先修好再创建页面：' + e.message);
}
const cats = reg.categories || [];
const catIds = cats.map((c) => c.id);
const normUrl = (u) => String(u || '').replace(/\\/g, '/').replace(/^\.\//, '');
const existingUrls = (reg.pages || []).map((p) => normUrl(p.url));

const CATEGORY = flagOf('category', '');
if (CATEGORY && catIds.indexOf(CATEGORY) < 0) {
  die('未知分类：' + CATEGORY + '（现有：' + catIds.join(' / ') + '；新增分类请先写进 registry.json 的 categories）');
}
const STATUS = flagOf('status', 'stable');
if (['stable', 'experimental', 'alpha'].indexOf(STATUS) < 0) die('未知 status：' + STATUS + '（stable / experimental / alpha）');

const DIR = path.join(EX_DIR, SLUG);
const INDEX_HTML = path.join(DIR, 'index.html');
const URL = 'examples/' + SLUG + '/index.html';
const OLD_URL_DIR = 'examples/' + SLUG + '/';

if (fs.existsSync(DIR)) die('页面目录已存在：examples/' + SLUG + '/（换 slug，或改完这页只编辑现有文件）');
if (existingUrls.indexOf(URL) >= 0 || existingUrls.indexOf(OLD_URL_DIR) >= 0 || existingUrls.indexOf('examples/' + SLUG + '.html') >= 0) {
  die('registry.json 已有相同 url（url 是去重键）：' + URL);
}

/* ------------------------------ 内容装配 ------------------------------ */
const TITLE = flagOf('title', SLUG);
const DESC = flagOf('desc', flagOf('description', '一句话说明这个页面展示什么（待填写）。'));
const EMOJI = flagOf('emoji', '🚀');
const TAGS = flagOf('tags', '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);
const CATEGORY_NAME = (cats.find((c) => c.id === CATEGORY) || {}).name || CATEGORY || '未分类';

const EOL = regText.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const stamp = (d) => {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
};
const NOW = stamp(new Date());

const TOKENS = {
  SLUG: SLUG,
  TITLE: TITLE,
  EMOJI: EMOJI,
  DESC: DESC,
  CATEGORY: CATEGORY || '（未分类）',
  CATEGORY_NAME: CATEGORY_NAME,
  TAGS: TAGS.length ? TAGS.map((t) => '`#' + t + '`').join(' ') : '（待补：分类标签 + 运行时标签，如 `#canvas` `#threejs`）',
  CREATED: NOW,
  UPDATED: NOW
};
const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (TOKENS[k] != null ? TOKENS[k] : m));

/** 入口页：替换模板头部注释块 + 标题 + 一级标题，并按 --split 换成模块引用。 */
function buildIndexHtml() {
  let html = fs.readFileSync(path.join(TPL_DIR, 'index.html'), 'utf8');

  const open = html.indexOf('<!--');
  const close = html.indexOf('-->', open);
  if (open < 0 || close < 0) die('模板 index.html 缺少头部注释块，无法生成页面头注释');
  const header = [
    '<!--',
    '  ' + TITLE + '（' + SLUG + '）· 页面入口',
    '  创建：' + NOW + ' · 由 tools/new-page.js 生成（--split：' + (SPLIT ? '是' : '否') + '）',
    '  文档：README.md（玩法与用法）· docs/design.md（设计）· docs/devlog.md（开发过程）',
    '  依赖：无（原生 HTML/CSS/JS）。用第三方库时按 assets/vendor/README.md 下载入库并登记，',
    '        在 </body> 前用相对路径加载，使用前探测：if (typeof LIB === "undefined") { 显示失败面板; return; }',
    '  路径约定：返回门户 href="/"；顶级共享资源 ../../assets/...；页面自身文件 ./js/... ./css/...',
    '  ' + (SPLIT
      ? '已拆分：入口只留骨架与样式，逻辑在 ./js/*.js（ES module，需 HTTP 访问，不能 file:// 直开）'
      : '单文件页面：拆到 ./js/*.js 与 ./css/*.css 同样合规（软上限：单文件 ~1200 行 / 单模块 ~800 行）'),
    '-->'
  ].join(EOL);
  html = html.slice(0, open) + header + html.slice(close + 3);

  html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + TITLE + '</title>');
  html = html.replace(/<h1>[\s\S]*?<\/h1>/, '<h1>' + EMOJI + ' ' + TITLE + '</h1>');
  html = html.replace(/<p class="hint">[\s\S]*?<\/p>/,
    '<p class="hint">' + DESC + '</p>');

  if (SPLIT) {
    html = html.replace('<!-- SPLIT:CSS -->', '<link rel="stylesheet" href="./css/main.css">');
    html = html.replace('<!-- SPLIT:JS -->', '<script type="module" src="./js/main.js"></script>');
  } else {
    html = html.replace('<!-- SPLIT:CSS -->', '<!-- 未拆分：样式写在上面的 <style> 里；拆分时用 tools/new-page.js --split 生成 ./css/main.css -->');
    html = html.replace('<!-- SPLIT:JS -->', '<!-- 未拆分：逻辑写在下面的 <script> 里；超软上限就拆到 ./js/*.js 并改用 type="module" -->');
  }
  return html;
}

const SPLIT_FILES = () => {
  const head = (name, extra) =>
    '/* ' + TITLE + '（' + SLUG + '）· ' + name + EOL +
    (extra ? ' * ' + extra + EOL : '') +
    ' * 创建于 ' + NOW + '（tools/new-page.js --split 生成的拆分起点，按需增删模块） */' + EOL + EOL;
  return {
    'js/main.js': head('入口模块：装配各模块并启动', 'ES module 需经 node server.js 以 HTTP 访问') +
      "import { createState } from './state.js';" + EOL +
      "import { createRenderer } from './render.js';" + EOL +
      "import { bindInput } from './input.js';" + EOL + EOL +
      "const state = createState();" + EOL +
      "const render = createRenderer(document);" + EOL +
      "bindInput(document, state);" + EOL + EOL +
      "let last = performance.now();" + EOL +
      "function frame(now) {" + EOL +
      "  const dt = Math.min(0.05, (now - last) / 1000);  // 固定上限，切后台回来不爆步长" + EOL +
      "  last = now;" + EOL +
      "  state.update(dt);" + EOL +
      "  render.draw(state, dt);" + EOL +
      "  requestAnimationFrame(frame);" + EOL +
      "}" + EOL +
      "requestAnimationFrame(frame);" + EOL,

    'js/state.js': head('数据与状态：规则、生成、求解（纯逻辑，尽量不碰 DOM）') +
      "export function createState() {" + EOL +
      "  const s = { phase: 'idle', t: 0 };" + EOL +
      "  s.update = function update(dt) {" + EOL +
      "    s.t += dt;" + EOL +
      "    // 待填写：推进状态机 idle → playing → paused → over" + EOL +
      "  };" + EOL +
      "  return s;" + EOL +
      "}" + EOL,

    'js/render.js': head('渲染层：DOM / Canvas 2D / WebGL 绘制') +
      "export function createRenderer(root) {" + EOL +
      "  return {" + EOL +
      "    draw(state, dt) {" + EOL +
      "      // 待填写：把 state 画到 root（Canvas 记得处理 devicePixelRatio）" + EOL +
      "    }," + EOL +
      "  };" + EOL +
      "}" + EOL,

    'js/input.js': head('输入层：键鼠 + 移动端触控') +
      "export function bindInput(root, state) {" + EOL +
      "  // 待填写：keydown / pointerdown / touchmove；移动端注意 touchmove 与页面滚动冲突、" + EOL +
      "  // 触控目标 ≥ 44px、pointerdown 解锁 AudioContext" + EOL +
      "}" + EOL,

    'css/main.css': head('页面样式（首屏关键样式留在 index.html 的 <style> 里）') +
      "/* 待填写：页面样式。移动端优先写媒体查询，避免影响首屏。 */" + EOL
  };
};

/* --------------------------- 注册表条目插入 --------------------------- */
function buildEntry() {
  const f = (k, v) => '      "' + k + '": ' + v;
  const fields = [
    f('title', JSON.stringify(TITLE)),
    f('description', JSON.stringify(DESC)),
    f('url', JSON.stringify(URL)),
    f('category', JSON.stringify(CATEGORY)),
    f('emoji', JSON.stringify(EMOJI)),
    f('tags', JSON.stringify(TAGS)),
    f('status', JSON.stringify(STATUS)),
    f('pinned', 'false'),
    f('thumbnail', 'null'),
    f('createdAt', JSON.stringify(NOW)),
    f('updatedAt', JSON.stringify(NOW))
  ].join(',' + EOL);
  return ['    {', fields, '    }'].join(EOL);
}

function spliceRegistry(entryText) {
  const idx = regText.lastIndexOf(']'); // pages 数组的收尾 ] 是全文件最后一个 ]
  if (idx < 0) die('registry.json 结构异常：找不到 pages 数组的收尾 ]');
  const before = regText.slice(0, idx);
  const ws = /[ \t\r\n]*$/.exec(before)[0];
  const cut = idx - ws.length;
  const next = regText.slice(0, cut) + ',' + EOL + entryText + EOL + '  ' + regText.slice(idx);
  try {
    JSON.parse(next);
  } catch (e) {
    die('生成的注册条目使 registry.json 失效，已中止写入：' + e.message);
  }
  return next;
}

/* ------------------------------ 执行 ------------------------------ */
const files = {
  'index.html': buildIndexHtml(),
  'README.md': fill(fs.readFileSync(path.join(TPL_DIR, 'README.md'), 'utf8')),
  'docs/design.md': fill(fs.readFileSync(path.join(TPL_DIR, 'docs', 'design.md'), 'utf8')),
  'docs/devlog.md': fill(fs.readFileSync(path.join(TPL_DIR, 'docs', 'devlog.md'), 'utf8'))
};
if (SPLIT) Object.assign(files, SPLIT_FILES());

const names = Object.keys(files);
console.log((DRY ? '[dry-run] 将创建：' : '[new-page] 已创建：') + 'examples/' + SLUG + '/');
names.forEach((n) => console.log('  examples/' + SLUG + '/' + n + (SPLIT && n.indexOf('js/') === 0 ? '' : '')));
console.log('  registry.json：追加 1 条（url = "' + URL + '"，title = ' + TITLE + '）');

if (DRY) {
  console.log('\n[dry-run] 未写入任何文件。去掉 --dry-run 执行。');
  process.exit(0);
}

names.forEach((n) => {
  const target = path.join(DIR, n);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, files[n].replace(/\r?\n/g, EOL), 'utf8');
});

fs.writeFileSync(REGISTRY, spliceRegistry(buildEntry()), 'utf8');

const sizeKb = (fs.statSync(INDEX_HTML).size / 1024).toFixed(1);
console.log('\n下一步：');
console.log('  1) 刷新首页（或 node server.js 起服务后访问 http://localhost:39977/examples/' + SLUG + '/），确认卡片出现');
console.log('  2) 补 README.md 的「玩法 / 用法」、docs/design.md 各节、docs/devlog.md 首条里程碑（把「待填写」写掉）');
console.log('  3) 需要第三方库：按 assets/vendor/README.md 下载入库 + 登记，页面用 ../../assets/vendor/<库>/<版本>/... 引用');
console.log('  4) 提交：git add examples/' + SLUG + ' registry.json && git commit -m "feat: 新增 ' + TITLE + ' 并注册"');
console.log('\n入口：examples/' + SLUG + '/index.html（' + sizeKb + ' KB，' + (SPLIT ? '已拆分 js/ + css/' : '单文件') + '）');
