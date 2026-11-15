/* label.js — 命名（PC/移动端）、扩展名分类、文件类型元数据。 */

export const PC_LABEL = "资源管理器";
export const MOBILE_LABEL = "文件管理";

/** 按视口取显示名（<768px 移动端叫「文件管理」） */
export function appTitle(isNarrow) {
  return isNarrow ? MOBILE_LABEL : PC_LABEL;
}

export function extOf(name) {
  const base = nameOfBase(String(name || ""));
  const i = base.lastIndexOf(".");
  if (i <= 0) return base.toLowerCase();     // 无扩展名：整体作为键（README / LICENSE / Dockerfile…）
  return base.slice(i + 1).toLowerCase();
}

function nameOfBase(p) {
  const s = String(p || "");
  const i = s.lastIndexOf("/");
  return i < 0 ? s : s.slice(i + 1);
}

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif", "bmp"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "oga", "m4a", "flac", "aac"];
const VIDEO_EXT = ["mp4", "webm", "mov", "m4v"];
const ARCHIVE_EXT = ["zip", "tar", "gz", "tgz", "bz2", "rar", "7z", "jar"];
const FONT_EXT = ["woff", "woff2", "ttf", "otf", "eot"];
const CODE_EXT = [
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "json", "json5", "map", "css", "scss", "less",
  "html", "htm", "xml", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "gitignore",
  "npmignore", "editorconfig", "sh", "bash", "ps1", "bat", "cmd", "sql", "py", "lua",
  "rb", "go", "rs", "java", "c", "h", "cpp", "hpp", "cs", "php", "vue", "svelte", "wasm",
  "dockerfile", "makefile", "gradle", "properties",
];
const TEXT_EXT = ["txt", "md", "markdown", "csv", "log", "text", "license", "notice", "changelog", "readme", "contributing", "authors"];
const BINARY_EXT = ["exe", "dll", "so", "dylib", "bin", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "otf", "ttf", "woff", "woff2", "eot"];

/** 文件类型 → { kind, icon, g1, g2 }（kind 决定预览方式） */
export function kindOf(path, isDir) {
  if (isDir) return { kind: "dir", icon: "folder", g1: "var(--g-file-1)", g2: "var(--g-file-2)" };
  const e = extOf(path);
  const base = nameOfBase(path).toLowerCase();
  if (e === "html" || e === "htm") return { kind: "html", icon: "image", g1: "var(--g-experiment-1)", g2: "var(--g-experiment-2)" };
  if (e === "md" || e === "markdown") return { kind: "markdown", icon: "doc", g1: "var(--g-model-1)", g2: "var(--g-model-2)" };
  if (e === "json" || e === "json5" || e === "map") return { kind: "code", icon: "code", g1: "var(--g-tool-1)", g2: "var(--g-tool-2)" };
  if (IMAGE_EXT.indexOf(e) >= 0) return { kind: "image", icon: "image", g1: "var(--g-experiment-1)", g2: "var(--g-experiment-2)" };
  if (AUDIO_EXT.indexOf(e) >= 0) return { kind: "audio", icon: "audio", g1: "var(--g-game-1)", g2: "var(--g-game-2)" };
  if (VIDEO_EXT.indexOf(e) >= 0) return { kind: "video", icon: "video", g1: "var(--g-game-1)", g2: "var(--g-game-2)" };
  if (ARCHIVE_EXT.indexOf(e) >= 0) return { kind: "archive", icon: "archive", g1: "var(--g-default-1)", g2: "var(--g-default-2)" };
  if (FONT_EXT.indexOf(e) >= 0) return { kind: "font", icon: "font", g1: "var(--g-default-1)", g2: "var(--g-default-2)" };
  if (e === "pdf") return { kind: "pdf", icon: "doc", g1: "var(--g-model-1)", g2: "var(--g-model-2)" };
  if (CODE_EXT.indexOf(e) >= 0) return { kind: "code", icon: "code", g1: "var(--g-tool-1)", g2: "var(--g-tool-2)" };
  if (TEXT_EXT.indexOf(e) >= 0) return { kind: "text", icon: "doc", g1: "var(--g-default-1)", g2: "var(--g-default-2)" };
  if (BINARY_EXT.indexOf(e) >= 0) return { kind: "binary", icon: "file", g1: "var(--g-default-1)", g2: "var(--g-default-2)" };
  if (!e || base === e) return { kind: "text", icon: "doc", g1: "var(--g-default-1)", g2: "var(--g-default-2)" };
  return { kind: "binary", icon: "file", g1: "var(--g-default-1)", g2: "var(--g-default-2)" };
}

/** 可用文本预览读出的类型 */
export function isTextLike(meta) {
  return ["code", "text", "markdown", "html"].indexOf(meta.kind) >= 0;
}

/** 类型中文名（信息面板用） */
export function kindLabel(meta) {
  return ({
    dir: "文件夹", code: "代码文件", text: "文本文件", markdown: "Markdown 文档",
    html: "HTML 页面", image: "图片", audio: "音频", video: "视频", archive: "压缩包",
    font: "字体文件", pdf: "PDF 文档", binary: "二进制文件",
  })[meta.kind] || "文件";
}

/** 侧栏「位置」（路径为清单里的相对路径，file=true 表示直接指向文件） */
export const POSITIONS = [
  { label: "站点根目录", path: "", icon: "home" },
  { label: "示例页面", path: "examples", icon: "grid" },
  { label: "共享资源", path: "assets", icon: "folder" },
  { label: "工具脚本", path: "tools", icon: "gear2" },
  { label: "站点首页", path: "index.html", file: true, icon: "doc" },
  { label: "注册表", path: "registry.json", file: true, icon: "code" },
  { label: "说明文档", path: "README.md", file: true, icon: "doc" },
];

/** 侧栏/列表里展示的目录名 → 中文别名（没命中就直接用原名） */
export const DIR_ALIASES = {
  examples: "示例页面",
  assets: "共享资源",
  tools: "工具脚本",
  docs: "文档",
};

export function dirLabel(name) {
  return DIR_ALIASES[name] || name;
}
