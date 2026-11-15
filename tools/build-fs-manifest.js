#!/usr/bin/env node
/* tools/build-fs-manifest.js — 生成「资源管理器 / 文件管理」页面的虚拟文件树清单。
 *
 * 输出：examples/file-manager/data/files.json
 *   { generated, root, count, truncated, entries: [{ p, t, s, m, n }] }
 *     p  相对站点根目录的路径（正斜杠），根目录自身为 ""
 *     t  "f" 文件 / "d" 目录
 *     s  字节数（仅文件）
 *     m  修改时间（本地 "YYYY-MM-DD HH:MM:SS"，与注册表日期格式一致）
 *     n  直接子项数（仅目录）
 *
 * 用途：给纯前端文件 App 提供只读目录树（站点无目录列表 API，服务器也不列目录）。
 * 约定：仅用 Node 内置模块；跳过 .git / node_modules / 产物目录 / 点文件；
 *      深度、单目录条目数、总条目数、JSON 体积都有上限，超限则截断并标 truncated。
 *
 * 用法：
 *   node tools/build-fs-manifest.js [--dry-run] [--max=4000] [--out=相对路径] [--root=站点根]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUT = path.join("examples", "file-manager", "data", "files.json");

// 跳过的目录名（站点产物与依赖）
const SKIP_DIRS = new Set([
  ".git", "node_modules", ".llama-trash", "out", "dist", ".next", ".svn", ".idea", ".vscode",
]);
// 跳过的文件名（系统噪声）
const SKIP_FILES = new Set(["Thumbs.db", "npm-debug.log"]);

const LIMITS = {
  maxDepth: 8,
  maxPerDir: 1000,
  maxEntries: 4000,
  maxBytes: 400 * 1024,
};

function parseArgs(argv) {
  const opts = { dryRun: false, max: LIMITS.maxEntries, out: DEFAULT_OUT, root: ROOT };
  argv.forEach(function (raw) {
    const m = /^--(out|max|root)=(.*)$/.exec(raw);
    if (m) {
      if (m[1] === "out") opts.out = m[2];
      if (m[1] === "max") opts.max = Math.max(50, Number(m[2]) || LIMITS.maxEntries);
      if (m[1] === "root") opts.root = path.resolve(m[2]);
      return;
    }
    if (raw === "--dry-run" || raw === "-n") opts.dryRun = true;
    if (raw === "--help" || raw === "-h") opts.help = true;
  });
  return opts;
}

function pad(n) { return (n < 10 ? "0" : "") + n; }
function localStamp(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function shouldSkipName(name) {
  if (!name) return true;
  if (name.charAt(0) === ".") return true;      // 点文件 / 点目录
  if (SKIP_DIRS.has(name)) return true;
  return SKIP_FILES.has(name);
}

/** 单层扫描：目录在前、文件在后，各按名称排序（zh  collate） */
function scan(dirAbs, relDir, depth, ctx) {
  let names;
  try {
    names = fs.readdirSync(dirAbs);
  } catch (e) {
    ctx.warn("读取目录失败，跳过：" + (relDir || "/") + "（" + e.code + "）");
    return 0;
  }
  const dirs = [], files = [];
  names.forEach(function (name) {
    if (shouldSkipName(name)) return;
    const abs = path.join(dirAbs, name);
    let st;
    try { st = fs.lstatSync(abs); } catch (e) { return; }
    if (st.isSymbolicLink()) return;             // 符号链接跳过，避免越界与环
    const rel = relDir ? relDir + "/" + name : name;
    if (st.isDirectory()) dirs.push({ name: name, abs: abs, rel: rel, st: st });
    else if (st.isFile()) files.push({ name: name, abs: abs, rel: rel, st: st });
  });
  const coll = function (a, b) { return a.name.localeCompare(b.name, "zh"); };
  dirs.sort(coll);
  files.sort(coll);

  let added = 0;
  const take = function (items, isDir) {
    for (let i = 0; i < items.length; i++) {
      if (i >= LIMITS.maxPerDir) { ctx.truncated = true; break; }
      if (ctx.count >= ctx.max) { ctx.truncated = true; break; }
      const it = items[i];
      const entry = { p: it.rel, t: isDir ? "d" : "f", m: localStamp(it.st.mtime) };
      if (isDir) entry.n = 0; else entry.s = it.st.size;
      ctx.push(entry);
      ctx.out.push(entry);
      added++;
      if (isDir) ctx.pending.push({ abs: it.abs, rel: it.rel, entry: entry, depth: depth });
    }
  };

  take(dirs, true);
  take(files, false);
  if (dirs.length + files.length > LIMITS.maxPerDir) ctx.truncated = true;
  return added;
}

/** 广度遍历（层级序），前端按父前缀还原目录树，顺序无关紧要但层级序更省解析 */
function build(opts) {
  const ctx = {
    count: 0,
    truncated: false,
    max: Math.min(opts.max, LIMITS.maxEntries),
    bytes: 0,
    pending: [],
    out: [],
    warn: function (msg) { console.warn("[manifest] " + msg); },
    push: function (entry) {
      ctx.count++;
      ctx.bytes += JSON.stringify(entry).length + 1;
    },
  };

  const rootStat = fs.statSync(opts.root);
  const rootEntry = { p: "", t: "d", m: localStamp(rootStat.mtime), n: 0 };
  ctx.out.push(rootEntry);
  ctx.count = 1;
  ctx.pending.push({ abs: opts.root, rel: "", entry: rootEntry, depth: 0 });

  while (ctx.pending.length) {
    const job = ctx.pending.shift();
    if (job.depth >= LIMITS.maxDepth) { ctx.truncated = true; continue; }
    job.entry.n = scan(job.abs, job.rel, job.depth + 1, ctx);
    if (ctx.bytes > LIMITS.maxBytes) { ctx.truncated = true; break; }
  }

  return {
    generated: localStamp(new Date()),
    count: ctx.out.length,
    truncated: ctx.truncated,
    bytes: ctx.bytes,
    entries: ctx.out,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log("用法：node tools/build-fs-manifest.js [--dry-run] [--max=4000] [--out=路径] [--root=站点根]");
    return;
  }
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory()) {
    console.error("[manifest] 站点根目录不存在：" + opts.root);
    process.exit(1);
  }

  const data = build(opts);
  const payload = {
    generated: data.generated,
    root: "",
    count: data.count,
    truncated: data.truncated,
    entries: data.entries,
  };
  const json = JSON.stringify(payload, null, 1);
  // 自校验：确保写出的内容能被前端 JSON.parse
  JSON.parse(json);

  const outAbs = path.isAbsolute(opts.out) ? opts.out : path.join(opts.root, opts.out);
  const relOut = path.relative(opts.root, outAbs).replace(/\\/g, "/");

  console.log("[manifest] 条目 " + payload.count + "（截断：" + (payload.truncated ? "是" : "否") +
    "），JSON " + (json.length / 1024).toFixed(1) + " KB");

  if (opts.dryRun) {
    console.log("[manifest] --dry-run：不写入 " + relOut);
    return;
  }
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, json, "utf8");
  console.log("[manifest] 已写入 " + relOut);
  if (json.length > LIMITS.maxBytes) {
    console.warn("[manifest] 提示：JSON 超过 " + (LIMITS.maxBytes / 1024) + " KB，建议调小 --max。");
  }
}

main();
